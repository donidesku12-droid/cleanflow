import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db.js';
import { config } from '../config.js';
import {
  parse, v, idParam, notFound, forbidden, badRequest, HttpError, hoursSchema, logActivity, PLANS, DEFAULT_WORK_SCHEDULE,
} from '../lib/core.js';
import { requireRole, createAuthToken } from '../lib/auth.js';
import { notificationSettings, NOTIFICATION_TYPES, sendEmail, visibleClause } from '../lib/notify.js';
import { getCompany } from '../lib/availability.js';

const router = Router();
const admin = requireRole('owner', 'manager');
const owner = requireRole('owner');

// ---------------- Company profile ----------------
router.get('/company', admin, (req, res) => {
  res.json({ company: getCompany(req.user.companyId) });
});

const TIMEZONES = Intl.supportedValuesOf('timeZone');
router.patch('/company', admin, (req, res) => {
  const b = parse(z.object({
    name: v.name.optional(), email: v.optEmail, phone: v.optPhone, website: v.optText(200),
    address: v.optText(200), city: v.optText(80), postal_code: v.optText(20), country: v.optText(80),
    currency: z.enum(['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN']).optional(),
    timezone: z.string().refine((t) => TIMEZONES.includes(t), 'is geen geldige tijdzone').optional(),
    opening_hours: hoursSchema.optional(),
    slot_interval_min: z.coerce.number().int().refine((n) => [15, 30, 60].includes(n), 'moet 15, 30 of 60 zijn').optional(),
    min_notice_hours: z.coerce.number().int().min(0).max(168).optional(),
    booking_horizon_days: z.coerce.number().int().min(7).max(365).optional(),
    booking_enabled: z.boolean().optional(),
  }), req.body);
  const c = getCompany(req.user.companyId);
  const pick = (k) => (b[k] !== undefined ? b[k] : c[k]);
  run(`UPDATE companies SET name = ?, email = ?, phone = ?, website = ?, address = ?, city = ?, postal_code = ?, country = ?, currency = ?, timezone = ?,
       opening_hours = ?, slot_interval_min = ?, min_notice_hours = ?, booking_horizon_days = ?, booking_enabled = ? WHERE id = ?`,
  pick('name'), pick('email'), pick('phone'), pick('website'), pick('address'), pick('city'), pick('postal_code'), pick('country'),
  pick('currency'), pick('timezone'), JSON.stringify(pick('opening_hours')), pick('slot_interval_min'), pick('min_notice_hours'),
  pick('booking_horizon_days'), b.booking_enabled !== undefined ? (b.booking_enabled ? 1 : 0) : c.booking_enabled, c.id);
  logActivity(c.id, req.user.id, 'updated', 'company', c.id, `${req.user.name} heeft de bedrijfsinstellingen gewijzigd`);
  res.json({ company: getCompany(c.id) });
});

router.put('/company/logo', owner, (req, res) => {
  if (!req.subscription.features.includes('custom_branding')) {
    throw new HttpError(402, 'Een eigen logo zit in het Business-abonnement. Upgrade via Instellingen → Abonnement.');
  }
  const { dataUrl } = parse(z.object({ dataUrl: z.string().max(400_000, 'de afbeelding moet kleiner zijn dan 300 KB').nullable() }), req.body);
  if (dataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw badRequest('Het logo moet een PNG-, JPEG- of WebP-afbeelding zijn.');
  run('UPDATE companies SET logo_data_url = ? WHERE id = ?', dataUrl, req.user.companyId);
  res.json({ ok: true });
});

// ---------------- Team & permissions ----------------
router.get('/team', admin, (req, res) => {
  const users = all(`SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.created_at, u.employee_id, e.name AS employee_name
    FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.company_id = ? ORDER BY u.role = 'owner' DESC, u.name`, req.user.companyId);
  const employeesWithoutLogin = all(`SELECT e.id, e.name, e.email FROM employees e WHERE e.company_id = ? AND e.status != 'inactive'
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)`, req.user.companyId);
  res.json({ users, employeesWithoutLogin, limit: PLANS[req.subscription.plan].limits.teamMembers });
});

async function issueInvite(req, user) {
  const token = createAuthToken(user.id, 'invite', 72);
  const link = `${config.appUrl}/accept-invite?token=${token}`;
  const company = getCompany(req.user.companyId);
  await sendEmail(company.id, user.email, `Je bent uitgenodigd voor ${company.name} op CLEANFLOW`,
    `Hallo ${user.name},\n\n${req.user.name} heeft je uitgenodigd voor ${company.name} op CLEANFLOW, als ${user.role === 'manager' ? 'manager' : 'medewerker'}.\nKies hier je wachtwoord (72 uur geldig):\n\n${link}`);
  return { link, emailDelivered: config.smtp.configured };
}

router.post('/team/invite', admin, async (req, res) => {
  const b = parse(z.object({
    name: v.name, email: v.email, role: z.enum(['manager', 'employee']),
    employee_id: z.number().int().nullable().optional(),
  }), req.body);
  if (b.role === 'manager' && req.user.role !== 'owner') throw forbidden('Alleen de eigenaar kan managers uitnodigen.');
  if (b.role === 'employee' && !req.subscription.features.includes('employees')) {
    throw new HttpError(402, 'Accounts voor medewerkers zitten in het Professional-abonnement. Upgrade via Instellingen → Abonnement.');
  }
  const limit = PLANS[req.subscription.plan].limits.teamMembers;
  const current = one(`SELECT COUNT(*) n FROM users WHERE company_id = ? AND status != 'disabled'`, req.user.companyId).n;
  if (current >= limit) throw new HttpError(402, `Je abonnement heeft maximaal ${limit} gebruikersaccounts. Upgrade om er meer toe te voegen.`);
  if (one('SELECT 1 FROM users WHERE email = ?', b.email)) throw new HttpError(409, 'Er bestaat al een gebruiker met dit e-mailadres.');

  const userId = tx(() => {
    let employeeId = b.employee_id ?? null;
    if (employeeId) {
      if (!one('SELECT 1 FROM employees WHERE id = ? AND company_id = ?', employeeId, req.user.companyId)) throw notFound('Medewerker');
      if (one('SELECT 1 FROM users WHERE employee_id = ?', employeeId)) throw badRequest('Dit teamlid heeft al een inlogaccount.');
    } else if (b.role === 'employee') {
      employeeId = Number(run(`INSERT INTO employees (company_id, name, email, work_schedule) VALUES (?, ?, ?, ?)`,
        req.user.companyId, b.name, b.email, JSON.stringify(DEFAULT_WORK_SCHEDULE)).lastInsertRowid);
    }
    return Number(run(`INSERT INTO users (company_id, employee_id, email, name, role, status) VALUES (?, ?, ?, ?, ?, 'invited')`,
      req.user.companyId, employeeId, b.email, b.name, b.role).lastInsertRowid);
  });
  const user = one('SELECT * FROM users WHERE id = ?', userId);
  const invite = await issueInvite(req, user);
  logActivity(req.user.companyId, req.user.id, 'invited', 'user', userId, `${req.user.name} heeft ${b.name} uitgenodigd als ${b.role === 'manager' ? 'manager' : 'medewerker'}`);
  res.status(201).json({ user, invite });
});

router.post('/team/:id/resend-invite', admin, async (req, res) => {
  const user = one(`SELECT * FROM users WHERE id = ? AND company_id = ? AND status = 'invited'`, idParam(req.params.id), req.user.companyId);
  if (!user) throw notFound('Openstaande uitnodiging');
  if (user.role === 'manager' && req.user.role !== 'owner') throw forbidden();
  res.json({ invite: await issueInvite(req, user) });
});

router.patch('/team/:id', owner, (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ role: z.enum(['manager', 'employee']).optional(), status: z.enum(['active', 'disabled']).optional() }), req.body);
  const user = one('SELECT * FROM users WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!user) throw notFound('Gebruiker');
  if (user.role === 'owner') throw badRequest('Het account van de eigenaar kan hier niet worden gewijzigd.');
  if (b.status === 'active' && user.status === 'invited') throw badRequest('Deze gebruiker heeft de uitnodiging nog niet geaccepteerd.');
  if (b.role === 'employee' && !user.employee_id) {
    const eid = Number(run(`INSERT INTO employees (company_id, name, email, work_schedule) VALUES (?, ?, ?, ?)`,
      req.user.companyId, user.name, user.email, JSON.stringify(DEFAULT_WORK_SCHEDULE)).lastInsertRowid);
    run('UPDATE users SET employee_id = ? WHERE id = ?', eid, id);
  }
  run('UPDATE users SET role = ?, status = ? WHERE id = ?', b.role ?? user.role, b.status ?? user.status, id);
  if (b.status === 'disabled' || (b.role && b.role !== user.role)) run('DELETE FROM sessions WHERE user_id = ?', id);
  logActivity(req.user.companyId, req.user.id, 'updated', 'user', id, `${req.user.name} heeft de toegang van ${user.name} gewijzigd`);
  res.json({ ok: true });
});

router.delete('/team/:id', owner, (req, res) => {
  const id = idParam(req.params.id);
  const user = one('SELECT * FROM users WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!user) throw notFound('Gebruiker');
  if (user.role === 'owner') throw badRequest('Het account van de eigenaar kan niet worden verwijderd.');
  run('DELETE FROM users WHERE id = ?', id);
  logActivity(req.user.companyId, req.user.id, 'removed', 'user', id, `${req.user.name} heeft het inlogaccount van ${user.name} verwijderd`);
  res.json({ ok: true });
});

// ---------------- Notification preferences & delivery log ----------------
router.get('/notifications', admin, (req, res) => {
  res.json({
    settings: notificationSettings(req.user.companyId),
    automated: req.subscription.features.includes('automated_notifications'),
    providers: { email: config.smtp.configured, sms: config.twilio.configured },
    outbox: all('SELECT id, channel, recipient, subject, status, error, created_at FROM message_outbox WHERE company_id = ? ORDER BY id DESC LIMIT 50', req.user.companyId),
  });
});

router.put('/notifications', admin, (req, res) => {
  const b = parse(z.object({ settings: z.array(z.object({
    type: z.enum(Object.keys(NOTIFICATION_TYPES)), in_app: z.boolean(), email: z.boolean(), sms: z.boolean(),
  })) }), req.body);
  tx(() => {
    for (const s of b.settings) {
      run(`INSERT INTO notification_settings (company_id, type, in_app, email, sms) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(company_id, type) DO UPDATE SET in_app = excluded.in_app, email = excluded.email, sms = excluded.sms`,
      req.user.companyId, s.type, +s.in_app, +s.email, +s.sms);
    }
  });
  res.json({ settings: notificationSettings(req.user.companyId) });
});

// ---------------- In-app notification feed ----------------
export const notificationsRouter = Router();
notificationsRouter.get('/', (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const rows = all(`SELECT n.*, (r.notification_id IS NOT NULL) AS is_read FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.company_id = ? AND ${visibleClause(req.user)} ${unreadOnly ? 'AND r.notification_id IS NULL' : ''}
    ORDER BY n.created_at DESC, n.id DESC LIMIT 100`, req.user.id, req.user.companyId);
  res.json({ notifications: rows });
});
notificationsRouter.post('/:id/read', (req, res) => {
  const id = idParam(req.params.id);
  const n = one(`SELECT n.id FROM notifications n WHERE n.id = ? AND n.company_id = ? AND ${visibleClause(req.user)}`, id, req.user.companyId);
  if (!n) throw notFound('Melding');
  run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)', id, req.user.id);
  res.json({ ok: true });
});
notificationsRouter.post('/read-all', (req, res) => {
  run(`INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
    SELECT n.id, ? FROM notifications n WHERE n.company_id = ? AND ${visibleClause(req.user)}`, req.user.id, req.user.companyId);
  res.json({ ok: true });
});

export default router;
