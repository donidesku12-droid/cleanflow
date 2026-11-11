import nodemailer from 'nodemailer';
import { all, one, run } from '../db.js';
import { config } from '../config.js';
import { getSubscription } from './auth.js';
import { nowIn, addMinutes } from './core.js';

export const NOTIFICATION_TYPES = {
  booking_new: { label: 'New booking requests', defaults: { in_app: 1, email: 1, sms: 0 } },
  booking_confirmed: { label: 'Booking confirmations', defaults: { in_app: 1, email: 1, sms: 0 } },
  booking_cancelled: { label: 'Booking cancellations', defaults: { in_app: 1, email: 1, sms: 0 } },
  booking_reminder: { label: 'Upcoming appointment reminders', defaults: { in_app: 1, email: 1, sms: 0 } },
  employee_assigned: { label: 'Employee job assignments', defaults: { in_app: 1, email: 1, sms: 0 } },
  job_completed: { label: 'Completed jobs', defaults: { in_app: 1, email: 0, sms: 0 } },
  chat_escalated: { label: 'AI assistant escalations', defaults: { in_app: 1, email: 1, sms: 0 } },
};

export function notificationSettings(companyId) {
  const rows = all('SELECT * FROM notification_settings WHERE company_id = ?', companyId);
  return Object.entries(NOTIFICATION_TYPES).map(([type, meta]) => {
    const r = rows.find((x) => x.type === type);
    return { type, label: meta.label, in_app: r ? r.in_app : meta.defaults.in_app, email: r ? r.email : meta.defaults.email, sms: r ? r.sms : meta.defaults.sms };
  });
}

let transporter;
function mailer() {
  if (!config.smtp.configured) return null;
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

/** Sends an email if SMTP is configured. Otherwise records it in the outbox as
 *  'not_configured' — nothing is ever reported as sent unless it really was. */
export async function sendEmail(companyId, to, subject, text) {
  if (!to) return;
  const t = mailer();
  if (!t) {
    run(`INSERT INTO message_outbox (company_id, channel, recipient, subject, body, status) VALUES (?, 'email', ?, ?, ?, 'not_configured')`,
      companyId, to, subject, text);
    if (!config.isProd && !config.isTest) console.log(`[email:not-configured] to=${to} subject="${subject}"\n${text}\n`);
    return;
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    run(`INSERT INTO message_outbox (company_id, channel, recipient, subject, body, status) VALUES (?, 'email', ?, ?, ?, 'sent')`, companyId, to, subject, text);
  } catch (err) {
    run(`INSERT INTO message_outbox (company_id, channel, recipient, subject, body, status, error) VALUES (?, 'email', ?, ?, ?, 'failed', ?)`,
      companyId, to, subject, text, String(err.message).slice(0, 500));
  }
}

export async function sendSms(companyId, to, text) {
  if (!to) return;
  if (!config.twilio.configured) {
    run(`INSERT INTO message_outbox (company_id, channel, recipient, body, status) VALUES (?, 'sms', ?, ?, 'not_configured')`, companyId, to, text);
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilio.sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.twilio.sid}:${config.twilio.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: config.twilio.from, Body: text }),
    });
    if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
    run(`INSERT INTO message_outbox (company_id, channel, recipient, body, status) VALUES (?, 'sms', ?, ?, 'sent')`, companyId, to, text);
  } catch (err) {
    run(`INSERT INTO message_outbox (company_id, channel, recipient, body, status, error) VALUES (?, 'sms', ?, ?, 'failed', ?)`,
      companyId, to, text, String(err.message).slice(0, 500));
  }
}

/**
 * Central notification entry point.
 *  - inApp: { userId?: number|null }  (null/undefined => all owners & managers)
 *  - email / sms: recipients for external delivery (customer, employee, company inbox)
 * External delivery requires the plan feature 'automated_notifications' and the
 * per-type preference; in-app notifications are always available.
 */
export async function notify(companyId, type, { title, body, link, userId = null, emailTo = [], smsTo = [], emailSubject, emailBody }) {
  const pref = notificationSettings(companyId).find((s) => s.type === type);
  if (!pref) throw new Error(`Unknown notification type ${type}`);
  if (pref.in_app) {
    run(`INSERT INTO notifications (company_id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)`,
      companyId, userId, type, title, body ?? null, link ?? null);
  }
  const sub = getSubscription(companyId);
  if (!sub.features.includes('automated_notifications')) return;
  const jobs = [];
  if (pref.email) for (const to of emailTo.filter(Boolean)) jobs.push(sendEmail(companyId, to, emailSubject || title, emailBody || body || title));
  if (pref.sms) for (const to of smsTo.filter(Boolean)) jobs.push(sendSms(companyId, to, `${title}${body ? ` – ${body}` : ''}`.slice(0, 300)));
  await Promise.allSettled(jobs);
}

/** Fire-and-forget wrapper so request handlers never fail because of delivery. */
export function notifySafe(...args) {
  notify(...args).catch((err) => console.error('[notify] failed', err));
}

/** Sends reminders for confirmed bookings starting within the next 24 hours. */
export async function runReminderSweep() {
  const companies = all('SELECT id, name, timezone FROM companies');
  for (const c of companies) {
    const now = nowIn(c.timezone);
    const horizon = addMinutes(now, 24 * 60);
    const due = all(`
      SELECT b.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, s.name AS service_name
      FROM bookings b JOIN customers c ON c.id = b.customer_id JOIN services s ON s.id = b.service_id
      LEFT JOIN reminder_log r ON r.booking_id = b.id
      WHERE b.company_id = ? AND b.status = 'confirmed' AND b.starts_at > ? AND b.starts_at <= ? AND r.booking_id IS NULL`,
    c.id, now, horizon);
    for (const b of due) {
      run('INSERT OR IGNORE INTO reminder_log (booking_id) VALUES (?)', b.id);
      await notify(c.id, 'booking_reminder', {
        title: `Reminder: ${b.service_name} on ${b.starts_at}`,
        body: `${b.customer_name} · ${b.address}`,
        link: `/app/bookings?open=${b.id}`,
        emailTo: [b.customer_email], smsTo: [b.customer_phone],
        emailSubject: `Reminder: your ${b.service_name} with ${c.name}`,
        emailBody: `Hi ${b.customer_name},\n\nThis is a reminder of your ${b.service_name} appointment on ${b.starts_at} at ${b.address}.\nBooking reference: ${b.reference}\n\n${c.name}`,
      });
    }
  }
}

export function unreadCount(user) {
  return one(`SELECT COUNT(*) AS n FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.company_id = ? AND r.notification_id IS NULL AND ${visibleClause(user)}`, user.id, user.companyId).n;
}

export function visibleClause(user) {
  // Owners/managers see company-wide notifications plus their own; employees only their own.
  return user.role === 'employee' ? `n.user_id = ${Number(user.id)}` : `(n.user_id IS NULL OR n.user_id = ${Number(user.id)})`;
}
