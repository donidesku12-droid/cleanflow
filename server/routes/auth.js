import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, run, tx } from '../db.js';
import { config } from '../config.js';
import {
  parse, v, HttpError, badRequest, TRIAL_DAYS, DEFAULT_OPENING_HOURS, logActivity,
} from '../lib/core.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, requireAuth, createAuthToken,
  consumeAuthToken, getSubscription,
} from '../lib/auth.js';
import { sendEmail, unreadCount } from '../lib/notify.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Te veel pogingen. Wacht een paar minuten en probeer het opnieuw.' } });

export function slugify(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company';
  let slug = base; let i = 2;
  while (one('SELECT 1 FROM companies WHERE slug = ?', slug)) slug = `${base}-${i++}`;
  return slug;
}

export const STARTER_SERVICES = [
  ['Reguliere huishoudelijke schoonmaak', 'Wekelijkse of tweewekelijkse schoonmaak van woonkamer, keuken, badkamers en slaapkamers.', 8500, 'fixed', 150],
  ['Dieptereiniging', 'Grondige schoonmaak van boven tot onder, inclusief binnenkant van kasten, apparaten, plinten en ontkalken.', 19500, 'fixed', 300],
  ['Kantoorschoonmaak', 'Werkplekken, vergaderruimtes, keukens en sanitair voor kleine en middelgrote kantoren.', 4500, 'per_hour', 120],
  ['Glasbewassing', 'Ramen binnen en buiten, inclusief kozijnen en vensterbanken.', 6500, 'from', 90],
  ['Schoonmaak bij verhuizing (intrek)', 'Je nieuwe woning brandschoon voordat je erin trekt.', 22000, 'from', 300],
  ['Opleverschoonmaak', 'Klaar voor de oplevering, zodat je je borg terugkrijgt.', 24000, 'from', 330],
];

export function provisionCompany({ companyName, plan = 'professional', isDemo = false }) {
  const info = run(`INSERT INTO companies (name, slug, opening_hours, is_demo) VALUES (?, ?, ?, ?)`,
    companyName, slugify(companyName), JSON.stringify(DEFAULT_OPENING_HOURS), isDemo ? 1 : 0);
  const companyId = Number(info.lastInsertRowid);
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString();
  run(`INSERT INTO subscriptions (company_id, plan, status, trial_ends_at) VALUES (?, ?, 'trialing', ?)`, companyId, plan, trialEnds);
  run(`INSERT INTO ai_settings (company_id, assistant_name, welcome_message, escalation_message, languages) VALUES (?, 'Flo', ?, ?, '["nl","en"]')`,
    companyId,
    `Hoi! Ik ben Flo, de virtuele assistent van ${companyName}. Stel me een vraag over onze diensten, prijzen of openingstijden, of vraag een afspraak aan.`,
    'Een collega neemt zo snel mogelijk contact met je op tijdens onze openingstijden.');
  STARTER_SERVICES.forEach(([name, desc, price, unit, dur], i) => {
    run(`INSERT INTO services (company_id, name, description, price_cents, price_unit, duration_min, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      companyId, name, desc, price, unit, dur, i);
  });
  return companyId;
}

function publicUser(user) {
  const company = one('SELECT id, name, slug, logo_data_url, currency, timezone, is_demo FROM companies WHERE id = ?', user.companyId);
  const sub = getSubscription(user.companyId);
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId },
    company,
    subscription: { plan: sub.plan, status: sub.status, trialEndsAt: sub.trial_ends_at, trialExpired: sub.trialExpired, active: sub.active, features: sub.features },
    unreadNotifications: unreadCount(user),
  };
}

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json(publicUser(req.user));
});

router.post('/signup', authLimiter, async (req, res) => {
  const body = parse(z.object({
    companyName: v.name, name: v.name, email: v.email, password: v.password,
    plan: z.enum(['starter', 'professional', 'business']).default('professional'),
    acceptTerms: z.literal(true, { error: 'Je moet akkoord gaan met de voorwaarden' }),
  }), req.body);
  if (one('SELECT 1 FROM users WHERE email = ?', body.email)) {
    throw new HttpError(409, 'Er bestaat al een account met dit e-mailadres. Probeer in te loggen.');
  }
  const hash = await hashPassword(body.password);
  const userId = tx(() => {
    const companyId = provisionCompany({ companyName: body.companyName, plan: body.plan });
    run(`UPDATE companies SET email = ? WHERE id = ?`, body.email, companyId);
    const u = run(`INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'owner')`, companyId, body.email, hash, body.name);
    logActivity(companyId, Number(u.lastInsertRowid), 'created', 'company', companyId, `${body.name} heeft het account voor ${body.companyName} aangemaakt`);
    return Number(u.lastInsertRowid);
  });
  createSession(res, req, userId);
  const u = one('SELECT * FROM users WHERE id = ?', userId);
  res.status(201).json(publicUser({ id: u.id, companyId: u.company_id, employeeId: null, email: u.email, name: u.name, role: u.role }));
});

router.post('/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ email: v.email, password: z.string().min(1, 'is verplicht').max(200) }), req.body);
  const u = one('SELECT * FROM users WHERE email = ?', body.email);
  const ok = await verifyPassword(body.password, u?.password_hash);
  if (!u || !ok) throw new HttpError(401, 'E-mailadres of wachtwoord klopt niet.');
  if (u.status !== 'active') throw new HttpError(403, 'Dit account is niet actief. Neem contact op met de eigenaar van je bedrijf.');
  createSession(res, req, u.id);
  res.json(publicUser({ id: u.id, companyId: u.company_id, employeeId: u.employee_id, email: u.email, name: u.name, role: u.role }));
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: v.email }), req.body);
  const u = one(`SELECT * FROM users WHERE email = ? AND status = 'active'`, email);
  if (u) {
    const token = createAuthToken(u.id, 'reset', 1);
    const link = `${config.appUrl}/reset-password?token=${token}`;
    await sendEmail(u.company_id, u.email, 'Nieuw wachtwoord voor CLEANFLOW',
      `Hallo ${u.name},\n\nVia de link hieronder kies je een nieuw wachtwoord. De link is 1 uur geldig.\n\n${link}\n\nHeb je dit niet aangevraagd? Dan kun je deze e-mail negeren.`);
  }
  // Same response either way, so the endpoint can't be used to discover accounts.
  res.json({ ok: true, message: 'Als er een account bestaat voor dit e-mailadres, hebben we een link gestuurd om je wachtwoord te herstellen.' });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(10).max(200), password: v.password }), req.body);
  const row = consumeAuthToken(body.token, 'reset');
  if (!row) throw badRequest('Deze link werkt niet meer of is verlopen. Vraag een nieuwe aan.');
  const hash = await hashPassword(body.password);
  tx(() => {
    run(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`, row.id);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hash, row.user_id);
    run('DELETE FROM sessions WHERE user_id = ?', row.user_id); // sign out everywhere
  });
  res.json({ ok: true });
});

router.get('/invite', (req, res) => {
  const row = consumeAuthToken(req.query.token, 'invite');
  if (!row) throw badRequest('Deze uitnodiging werkt niet meer of is verlopen. Vraag de eigenaar om een nieuwe.');
  const u = one(`SELECT u.name, u.email, u.role, c.name AS company FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?`, row.user_id);
  res.json(u);
});

router.post('/accept-invite', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(10).max(200), password: v.password }), req.body);
  const row = consumeAuthToken(body.token, 'invite');
  if (!row) throw badRequest('Deze uitnodiging werkt niet meer of is verlopen. Vraag de eigenaar om een nieuwe.');
  const hash = await hashPassword(body.password);
  tx(() => {
    run(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`, row.id);
    run(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, hash, row.user_id);
  });
  const u = one('SELECT * FROM users WHERE id = ?', row.user_id);
  createSession(res, req, u.id);
  res.json(publicUser({ id: u.id, companyId: u.company_id, employeeId: u.employee_id, email: u.email, name: u.name, role: u.role }));
});

router.patch('/account', requireAuth, async (req, res) => {
  const body = parse(z.object({
    name: v.name.optional(), email: v.email.optional(),
    currentPassword: z.string().max(200).optional(), newPassword: v.password.optional(),
  }), req.body);
  const u = one('SELECT * FROM users WHERE id = ?', req.user.id);
  if ((body.email && body.email !== u.email) || body.newPassword) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, u.password_hash))) {
      throw badRequest('Je huidige wachtwoord klopt niet.');
    }
  }
  if (body.email && body.email !== u.email && one('SELECT 1 FROM users WHERE email = ? AND id != ?', body.email, u.id)) {
    throw new HttpError(409, 'Dit e-mailadres is al in gebruik.');
  }
  if (body.name) run('UPDATE users SET name = ? WHERE id = ?', body.name, u.id);
  if (body.email) run('UPDATE users SET email = ? WHERE id = ?', body.email, u.id);
  if (body.newPassword) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(body.newPassword), u.id);
    run('DELETE FROM sessions WHERE user_id = ? AND id != ?', u.id, req.sessionId); // sign out other devices
  }
  const fresh = one('SELECT * FROM users WHERE id = ?', u.id);
  res.json(publicUser({ ...req.user, name: fresh.name, email: fresh.email }));
});

router.post('/logout-everywhere', requireAuth, (req, res) => {
  run('DELETE FROM sessions WHERE user_id = ?', req.user.id);
  destroySession(req, res);
  res.json({ ok: true });
});

export default router;
