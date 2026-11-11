import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { all, one, run, tx } from '../db.js';
import { config } from '../config.js';
import { parse, v, notFound, badRequest, HttpError, bookingReference, logActivity, todayIn, addDays } from '../lib/core.js';
import { getSubscription } from '../lib/auth.js';
import { assertBookable, availableSlots, availableDates, getCompany } from '../lib/availability.js';
import { getAiSettings } from '../lib/assistant.js';
import { notifySafe, sendEmail } from '../lib/notify.js';
import { handleVisitorMessage, newConversationToken } from './assistant.js';
import { BOOKING_SELECT } from './bookings.js';

const router = Router();
const limit = (n, windowMin = 10) => rateLimit({ windowMs: windowMin * 60 * 1000, limit: config.isTest ? 10000 : n, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' } });

function companyBySlug(slug) {
  const row = one('SELECT id FROM companies WHERE slug = ?', String(slug));
  if (!row) throw notFound('Company');
  return getCompany(row.id);
}

function assistantAvailable(company) {
  const ai = getAiSettings(company.id);
  return ai && ai.enabled && getSubscription(company.id).features.includes('ai_assistant') ? ai : null;
}

router.get('/company/:slug', (req, res) => {
  const c = companyBySlug(req.params.slug);
  const ai = assistantAvailable(c);
  res.json({
    company: {
      name: c.name, slug: c.slug, logo: c.logo_data_url, phone: c.phone, email: c.email, website: c.website,
      address: c.address, city: c.city, currency: c.currency, opening_hours: c.opening_hours, booking_enabled: !!c.booking_enabled,
      min_notice_hours: c.min_notice_hours, booking_horizon_days: c.booking_horizon_days, today: todayIn(c.timezone), is_demo: !!c.is_demo,
    },
    services: all(`SELECT id, name, description, price_cents, price_unit, duration_min FROM services WHERE company_id = ? AND active = 1 ORDER BY sort_order, name`, c.id),
    assistant: ai ? { name: ai.assistant_name, welcome: ai.welcome_message } : null,
  });
});

function activeService(company, id) {
  const s = one('SELECT * FROM services WHERE id = ? AND company_id = ? AND active = 1', id, company.id);
  if (!s) throw notFound('Service');
  return s;
}

router.get('/company/:slug/dates', limit(300), (req, res) => {
  const c = companyBySlug(req.params.slug);
  const q = parse(z.object({ service_id: z.coerce.number().int(), from: v.date.optional(), days: z.coerce.number().int().min(1).max(62).default(35) }), req.query);
  const s = activeService(c, q.service_id);
  const today = todayIn(c.timezone);
  const from = q.from && q.from > today ? q.from : today;
  const lastDay = addDays(today, c.booking_horizon_days);
  res.json({ dates: c.booking_enabled ? availableDates(c, s, from, q.days).filter((d) => d <= lastDay) : [] });
});

router.get('/company/:slug/slots', limit(300), (req, res) => {
  const c = companyBySlug(req.params.slug);
  const q = parse(z.object({ service_id: z.coerce.number().int(), date: v.date }), req.query);
  res.json({ slots: c.booking_enabled ? availableSlots(c, activeService(c, q.service_id), q.date) : [] });
});

router.post('/company/:slug/bookings', limit(10), (req, res) => {
  const c = companyBySlug(req.params.slug);
  if (!c.booking_enabled) throw new HttpError(409, 'Online booking is currently unavailable. Please contact us directly.');
  const b = parse(z.object({
    service_id: z.number().int(), date: v.date, time: v.time,
    address: v.text(200).min(3, 'is required'), postal_code: v.optText(20), city: v.optText(80),
    name: v.name, email: v.email, phone: v.phone,
    instructions: v.optText(1000),
    privacy_consent: z.literal(true, { error: 'Please agree to the processing of your details' }),
    website: z.string().max(0).optional(), // honeypot
  }), req.body);
  const s = activeService(c, b.service_id);
  const fullAddress = [b.address, [b.postal_code, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const start = `${b.date} ${b.time}`;
  const id = tx(() => {
    if (!availableSlots(c, s, b.date).includes(b.time)) {
      // assertBookable gives the precise reason; fall back to a generic one.
      assertBookable(c, start, s.duration_min);
      throw new HttpError(409, 'That time is no longer available. Please choose another slot.');
    }
    const end = assertBookable(c, start, s.duration_min);
    let customer = one('SELECT * FROM customers WHERE company_id = ? AND email = ?', c.id, b.email);
    if (!customer) {
      const cid = Number(run(`INSERT INTO customers (company_id, name, email, phone, address, city, postal_code, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'online')`,
        c.id, b.name, b.email, b.phone, b.address, b.city, b.postal_code).lastInsertRowid);
      customer = { id: cid };
    } else {
      // Never overwrite existing records from a public form; only fill blanks.
      run(`UPDATE customers SET phone = COALESCE(phone, ?), address = COALESCE(address, ?), city = COALESCE(city, ?), postal_code = COALESCE(postal_code, ?) WHERE id = ?`,
        b.phone, b.address, b.city, b.postal_code, customer.id);
    }
    return Number(run(`INSERT INTO bookings (company_id, reference, customer_id, service_id, starts_at, ends_at, address, instructions, status, price_cents, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'online')`, c.id, bookingReference(), customer.id, s.id, start, end, fullAddress, b.instructions, s.price_cents).lastInsertRowid);
  });
  const booking = one(`${BOOKING_SELECT} WHERE b.id = ?`, id);
  logActivity(c.id, null, 'requested', 'booking', id, `${b.name} requested ${s.name} online for ${start}`);
  notifySafe(c.id, 'booking_new', {
    title: `New booking request: ${s.name}`, body: `${b.name} · ${start}`, link: `/app/bookings?open=${id}`, emailTo: [c.email],
    emailSubject: `New booking request ${booking.reference}`,
    emailBody: `${b.name} (${b.email}, ${b.phone}) requested ${s.name} on ${start}.\nAddress: ${fullAddress}\n${b.instructions ? `Instructions: ${b.instructions}\n` : ''}\nReview it in CLEANFLOW: ${config.appUrl}/app/bookings?open=${id}`,
  });
  // Receipt to the customer (transactional; sent whenever email delivery is configured).
  sendEmail(c.id, b.email, `We received your booking request – ${c.name}`,
    `Hi ${b.name},\n\nThanks for your request for ${s.name} on ${start}.\nReference: ${booking.reference}\n\nThis is not yet a confirmation – we'll email you as soon as ${c.name} confirms your appointment.\n\n${c.name}${c.phone ? `\n${c.phone}` : ''}`).catch(() => {});
  res.status(201).json({
    booking: { reference: booking.reference, service: s.name, starts_at: booking.starts_at, ends_at: booking.ends_at, address: booking.address, status: booking.status, price_cents: booking.price_cents, price_unit: s.price_unit },
  });
});

// ---------------- Chat widget ----------------
const chatLimiter = limit(40, 5);

function conversationByToken(token) {
  const conv = one('SELECT * FROM chat_conversations WHERE public_token = ?', String(token));
  if (!conv) throw notFound('Conversation');
  return conv;
}
const visibleMessages = (convId, after = 0) => all(`SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id`, convId, after);

router.post('/company/:slug/chat', chatLimiter, async (req, res) => {
  const c = companyBySlug(req.params.slug);
  if (!assistantAvailable(c)) throw new HttpError(409, 'The chat assistant is not available for this company.');
  const b = parse(z.object({ message: v.text(1000).min(1, 'is required'), token: z.string().max(100).optional() }), req.body);
  let conv = b.token ? one('SELECT * FROM chat_conversations WHERE public_token = ? AND company_id = ?', b.token, c.id) : null;
  if (!conv) {
    const token = newConversationToken();
    const id = Number(run(`INSERT INTO chat_conversations (company_id, public_token) VALUES (?, ?)`, c.id, token).lastInsertRowid);
    conv = one('SELECT * FROM chat_conversations WHERE id = ?', id);
  }
  if (all('SELECT 1 FROM chat_messages WHERE conversation_id = ?', conv.id).length > 200) throw badRequest('This conversation is too long. Please start a new chat.');
  const lastId = one('SELECT COALESCE(MAX(id),0) m FROM chat_messages WHERE conversation_id = ?', conv.id).m;
  const result = await handleVisitorMessage(c, conv, b.message);
  res.json({ token: conv.public_token, messages: visibleMessages(conv.id, lastId), escalated: result.escalate || conv.status === 'escalated' });
});

router.get('/chat/:token', chatLimiter, (req, res) => {
  const conv = conversationByToken(req.params.token);
  const after = Number(req.query.after) || 0;
  res.json({ messages: visibleMessages(conv.id, after), status: conv.status, contactShared: !!conv.contact_consent });
});

router.post('/chat/:token/contact', chatLimiter, (req, res) => {
  const conv = conversationByToken(req.params.token);
  const b = parse(z.object({
    name: v.name, email: v.optEmail, phone: v.optPhone,
    consent: z.literal(true, { error: 'Consent is required to share your details' }),
  }).refine((x) => x.email || x.phone, { message: 'Enter an email address or phone number', path: ['email'] }), req.body);
  run(`UPDATE chat_conversations SET visitor_name = ?, visitor_email = ?, visitor_phone = ?, contact_consent = 1, updated_at = datetime('now') WHERE id = ?`,
    b.name, b.email, b.phone, conv.id);
  run(`INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, 'assistant', ?)`, conv.id,
    `Thanks ${b.name}! I've shared your contact details with the team so they can follow up with you.`);
  if (conv.status !== 'escalated') {
    run(`UPDATE chat_conversations SET status = 'escalated', escalation_reason = 'Visitor requested contact' WHERE id = ?`, conv.id);
    notifySafe(conv.company_id, 'chat_escalated', {
      title: 'Chat visitor requested contact', body: `${b.name} · ${b.email || b.phone}`, link: `/app/assistant?tab=inbox&open=${conv.id}`,
    });
  }
  res.json({ ok: true, messages: visibleMessages(conv.id, Number(req.body.after) || 0) });
});

// ---------------- Marketing site contact form ----------------
router.post('/contact', limit(5, 60), async (req, res) => {
  const b = parse(z.object({ name: v.name, email: v.email, company: v.optText(120), message: v.text(4000).min(10, 'must be at least 10 characters'), website: z.string().max(0).optional() }), req.body);
  run('INSERT INTO contact_requests (name, email, company, message) VALUES (?, ?, ?, ?)', b.name, b.email, b.company, b.message);
  if (process.env.SALES_INBOX) await sendEmail(null, process.env.SALES_INBOX, `CLEANFLOW contact: ${b.name}`, `${b.name} <${b.email}> ${b.company || ''}\n\n${b.message}`);
  res.status(201).json({ ok: true });
});

export default router;
