import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db.js';
import {
  parse, v, idParam, notFound, forbidden, badRequest, logActivity, DEFAULT_WORK_SCHEDULE, scheduleSchema, nowIn, todayIn, addDays,
} from '../lib/core.js';
import { requireRole, requireFeature, isStaffAdmin } from '../lib/auth.js';
import { getCompany } from '../lib/availability.js';
import { BOOKING_SELECT } from './bookings.js';

const router = Router();
const admin = requireRole('owner', 'manager');

const STATS = `
  (SELECT COUNT(*) FROM bookings b WHERE b.employee_id = e.id AND b.status IN ('confirmed','pending','in_progress') AND b.starts_at >= ?) AS upcoming_jobs,
  (SELECT COUNT(*) FROM bookings b WHERE b.employee_id = e.id AND b.status = 'completed') AS completed_jobs,
  (SELECT COUNT(*) FROM bookings b WHERE b.employee_id = e.id AND b.status = 'completed' AND b.completed_at >= datetime('now','-30 days')) AS completed_30d,
  (SELECT b.id FROM bookings b WHERE b.employee_id = e.id AND b.status != 'cancelled' AND b.starts_at <= ? AND b.ends_at > ? LIMIT 1) AS current_booking_id,
  (SELECT COUNT(*) FROM bookings b WHERE b.employee_id = e.id AND b.status != 'cancelled' AND substr(b.starts_at,1,10) = ?) AS jobs_today,
  u.id AS user_id, u.role AS user_role, u.status AS user_status, u.email AS user_email`;

function hydrate(e) {
  return e && { ...e, work_schedule: JSON.parse(e.work_schedule) };
}

router.get('/', admin, requireFeature('employees'), (req, res) => {
  const company = getCompany(req.user.companyId);
  const now = nowIn(company.timezone);
  const rows = all(`SELECT e.*, ${STATS} FROM employees e LEFT JOIN users u ON u.employee_id = e.id
    WHERE e.company_id = ? ORDER BY e.status = 'inactive', e.name COLLATE NOCASE`, now, now, now, now.slice(0, 10), company.id);
  res.json({ employees: rows.map(hydrate) });
});

router.get('/:id', (req, res) => {
  const id = idParam(req.params.id);
  if (!isStaffAdmin(req.user) && req.user.employeeId !== id) throw forbidden();
  if (isStaffAdmin(req.user) && !req.subscription.features.includes('employees')) throw forbidden('Personeelsbeheer zit niet in je abonnement.');
  const company = getCompany(req.user.companyId);
  const now = nowIn(company.timezone);
  const e = hydrate(one(`SELECT e.*, ${STATS} FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.id = ? AND e.company_id = ?`,
    now, now, now, now.slice(0, 10), id, company.id));
  if (!e) throw notFound('Medewerker');
  const upcoming = all(`${BOOKING_SELECT} WHERE b.employee_id = ? AND b.status IN ('pending','confirmed','in_progress') AND b.ends_at >= ? ORDER BY b.starts_at LIMIT 50`, id, now);
  const completed = all(`${BOOKING_SELECT} WHERE b.employee_id = ? AND b.status = 'completed' ORDER BY b.starts_at DESC LIMIT 50`, id);
  const today = todayIn(company.timezone);
  const weekly = [];
  for (let i = 27; i >= 0; i -= 7) {
    const from = addDays(today, -i - 6); const to = addDays(today, -i);
    const r = one(`SELECT COUNT(*) n, COALESCE(SUM((julianday(replace(ends_at,' ','T')) - julianday(replace(starts_at,' ','T'))) * 24), 0) h
      FROM bookings WHERE employee_id = ? AND status = 'completed' AND substr(starts_at,1,10) BETWEEN ? AND ?`, id, from, to);
    weekly.push({ week: `${from.slice(5)}–${to.slice(5)}`, jobs: r.n, hours: Math.round(r.h * 10) / 10 });
  }
  const activity = all(`SELECT a.* FROM activity_log a WHERE a.company_id = ? AND a.entity = 'booking'
    AND a.entity_id IN (SELECT id FROM bookings WHERE employee_id = ?) ORDER BY a.created_at DESC LIMIT 20`, company.id, id);
  const strip = (b) => (isStaffAdmin(req.user) ? b : (({ customer_email, price_cents, paid_cents, ...r }) => r)(b));
  res.json({ employee: e, upcoming: upcoming.map(strip), completed: completed.map(strip), weekly, activity });
});

const schema = z.object({
  name: v.name, email: v.optEmail, phone: v.optPhone,
  job_title: v.text(80).min(1, 'is verplicht'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'moet een kleurcode zijn').default('#10b981'),
  status: z.enum(['active', 'on_leave', 'inactive']).default('active'),
  work_schedule: scheduleSchema.default(DEFAULT_WORK_SCHEDULE),
  notes: v.optText(2000),
});

router.post('/', admin, requireFeature('employees'), (req, res) => {
  const b = parse(schema, req.body);
  const info = run(`INSERT INTO employees (company_id, name, email, phone, job_title, color, status, work_schedule, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.companyId, b.name, b.email, b.phone, b.job_title, b.color, b.status, JSON.stringify(b.work_schedule), b.notes);
  const id = Number(info.lastInsertRowid);
  logActivity(req.user.companyId, req.user.id, 'created', 'employee', id, `${req.user.name} heeft ${b.name} aan het team toegevoegd`);
  res.status(201).json({ employee: hydrate(one('SELECT * FROM employees WHERE id = ?', id)) });
});

router.patch('/:id', admin, requireFeature('employees'), (req, res) => {
  const id = idParam(req.params.id);
  const existing = one('SELECT * FROM employees WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!existing) throw notFound('Medewerker');
  const b = parse(schema.partial(), req.body);
  const m = { ...hydrate(existing), ...Object.fromEntries(Object.entries(b).filter(([, x]) => x !== undefined)) };
  const company = getCompany(req.user.companyId);
  tx(() => {
    run(`UPDATE employees SET name = ?, email = ?, phone = ?, job_title = ?, color = ?, status = ?, work_schedule = ?, notes = ? WHERE id = ?`,
      m.name, m.email, m.phone, m.job_title, m.color, m.status, JSON.stringify(m.work_schedule), m.notes, id);
    if (m.status !== 'active' && existing.status === 'active') {
      // Unassign future, not-yet-started jobs so they show up for reassignment.
      const n = run(`UPDATE bookings SET employee_id = NULL, updated_at = datetime('now') WHERE employee_id = ? AND status IN ('pending','confirmed') AND starts_at > ?`,
        id, nowIn(company.timezone)).changes;
      if (n) logActivity(company.id, req.user.id, 'unassigned', 'employee', id, `${n} komende klus(sen) van ${m.name} moeten opnieuw worden toegewezen`);
    }
  });
  if (b.name) run('UPDATE users SET name = ? WHERE employee_id = ?', b.name, id);
  logActivity(company.id, req.user.id, 'updated', 'employee', id, `${req.user.name} heeft de gegevens van ${m.name} gewijzigd`);
  res.json({ employee: hydrate(one('SELECT * FROM employees WHERE id = ?', id)) });
});

router.delete('/:id', admin, requireFeature('employees'), (req, res) => {
  const id = idParam(req.params.id);
  const e = one('SELECT * FROM employees WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!e) throw notFound('Medewerker');
  if (one('SELECT 1 FROM bookings WHERE employee_id = ?', id)) {
    throw badRequest('Dit teamlid heeft eerdere klussen. Zet de status op "Inactief", dan blijven je overzichten kloppen.');
  }
  tx(() => {
    run('DELETE FROM users WHERE employee_id = ? AND role != \'owner\'', id);
    run('DELETE FROM employees WHERE id = ?', id);
  });
  logActivity(req.user.companyId, req.user.id, 'deleted', 'employee', id, `${req.user.name} heeft ${e.name} uit het team verwijderd`);
  res.json({ ok: true });
});

export default router;
