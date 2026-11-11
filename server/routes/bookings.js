import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db.js';
import {
  parse, v, idParam, notFound, forbidden, badRequest, bookingReference, logActivity, addMinutes, todayIn, fmtWhen, fmtShort,
} from '../lib/core.js';
import { requireRole, isStaffAdmin } from '../lib/auth.js';
import { assertBookable, getCompany, employeeAvailability, availableSlots } from '../lib/availability.js';
import { notifySafe } from '../lib/notify.js';

const STATUS_NL = { pending: 'openstaande', confirmed: 'bevestigde', in_progress: 'lopende', completed: 'voltooide', cancelled: 'geannuleerde' };
const STATUS_TO = { pending: 'in afwachting', confirmed: 'bevestigd', in_progress: 'bezig', completed: 'voltooid', cancelled: 'geannuleerd' };

const router = Router();
const admin = requireRole('owner', 'manager');

export const BOOKING_SELECT = `
  SELECT b.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
         s.name AS service_name, s.duration_min, e.name AS employee_name, e.color AS employee_color,
         (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.booking_id = b.id AND p.status = 'paid') AS paid_cents
  FROM bookings b
  JOIN customers c ON c.id = b.customer_id
  JOIN services s ON s.id = b.service_id
  LEFT JOIN employees e ON e.id = b.employee_id`;

/** Strip fields employees are not allowed to see. */
function shapeFor(user, b) {
  if (!b) return b;
  if (user.role !== 'employee') return b;
  const { customer_email, paid_cents, price_cents, ...rest } = b;
  return rest;
}

function loadBooking(req, id) {
  const b = one(`${BOOKING_SELECT} WHERE b.id = ? AND b.company_id = ?`, id, req.user.companyId);
  if (!b) throw notFound('Boeking');
  if (req.user.role === 'employee' && b.employee_id !== req.user.employeeId) throw notFound('Boeking');
  return b;
}

router.get('/', (req, res) => {
  const q = parse(z.object({
    status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'active', 'all']).optional(),
    from: v.date.optional(), to: v.date.optional(), q: z.string().max(100).optional(),
    employee_id: z.coerce.number().int().optional(), customer_id: z.coerce.number().int().optional(),
    unassigned: z.enum(['1']).optional(),
    sort: z.enum(['asc', 'desc']).default('asc'),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  }), req.query);
  const where = ['b.company_id = ?']; const params = [req.user.companyId];
  if (req.user.role === 'employee') { where.push('b.employee_id = ?'); params.push(req.user.employeeId ?? -1); }
  if (q.status === 'active') where.push(`b.status IN ('pending','confirmed','in_progress')`);
  else if (q.status && q.status !== 'all') { where.push('b.status = ?'); params.push(q.status); }
  if (q.from) { where.push('b.starts_at >= ?'); params.push(`${q.from} 00:00`); }
  if (q.to) { where.push('b.starts_at <= ?'); params.push(`${q.to} 23:59`); }
  if (q.employee_id) { where.push('b.employee_id = ?'); params.push(q.employee_id); }
  if (q.unassigned) where.push('b.employee_id IS NULL');
  if (q.customer_id) { where.push('b.customer_id = ?'); params.push(q.customer_id); }
  if (q.q) {
    where.push('(c.name LIKE ? OR b.reference LIKE ? OR b.address LIKE ? OR s.name LIKE ?)');
    const like = `%${q.q}%`; params.push(like, like, like, like);
  }
  const rows = all(`${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.starts_at ${q.sort === 'desc' ? 'DESC' : 'ASC'} LIMIT ${q.limit}`, ...params);
  const counts = req.user.role === 'employee' ? null : Object.fromEntries(
    all(`SELECT status, COUNT(*) n FROM bookings WHERE company_id = ? GROUP BY status`, req.user.companyId).map((r) => [r.status, r.n]),
  );
  res.json({ bookings: rows.map((b) => shapeFor(req.user, b)), counts });
});

router.get('/availability', admin, (req, res) => {
  const q = parse(z.object({ service_id: z.coerce.number().int(), date: v.date }), req.query);
  const company = getCompany(req.user.companyId);
  const service = one('SELECT * FROM services WHERE id = ? AND company_id = ?', q.service_id, company.id);
  if (!service) throw notFound('Dienst');
  res.json({ slots: availableSlots({ ...company, min_notice_hours: 0 }, service, q.date) });
});

router.get('/:id', (req, res) => {
  const b = loadBooking(req, idParam(req.params.id));
  const payments = req.user.role === 'employee' ? [] : all('SELECT * FROM payments WHERE booking_id = ? ORDER BY paid_at', b.id);
  res.json({ booking: shapeFor(req.user, b), payments });
});

router.get('/:id/employees', admin, (req, res) => {
  const b = loadBooking(req, idParam(req.params.id));
  res.json({ employees: employeeAvailability(getCompany(req.user.companyId), b.starts_at, b.ends_at, b.id) });
});

const customerInput = z.object({ name: v.name, email: v.optEmail, phone: v.optPhone });

router.post('/', admin, (req, res) => {
  const body = parse(z.object({
    customer_id: z.number().int().optional(),
    new_customer: customerInput.optional(),
    service_id: z.number().int(),
    date: v.date, time: v.time,
    address: v.text(300).min(3, 'is required'),
    instructions: v.optText(1000),
    employee_id: z.number().int().nullable().optional(),
    status: z.enum(['pending', 'confirmed']).default('confirmed'),
    price: v.money.optional(),
    allow_outside_hours: z.boolean().default(false),
  }).refine((b) => b.customer_id || b.new_customer, { message: 'Kies een klant of voeg een nieuwe toe', path: ['customer_id'] }), req.body);
  const company = getCompany(req.user.companyId);
  const service = one('SELECT * FROM services WHERE id = ? AND company_id = ?', body.service_id, company.id);
  if (!service) throw notFound('Dienst');
  if (body.employee_id && !one('SELECT 1 FROM employees WHERE id = ? AND company_id = ?', body.employee_id, company.id)) throw notFound('Medewerker');
  if (body.customer_id && !one('SELECT 1 FROM customers WHERE id = ? AND company_id = ?', body.customer_id, company.id)) throw notFound('Klant');

  const start = `${body.date} ${body.time}`;
  const id = tx(() => {
    const end = assertBookable(company, start, service.duration_min, {
      employeeId: body.employee_id ?? null, enforceHours: !body.allow_outside_hours, enforceNotice: false,
    });
    let customerId = body.customer_id;
    if (!customerId) {
      const c = body.new_customer;
      customerId = Number(run(`INSERT INTO customers (company_id, name, email, phone, address, source) VALUES (?, ?, ?, ?, ?, 'manual')`,
        company.id, c.name, c.email, c.phone, body.address).lastInsertRowid);
    }
    const price = body.price !== undefined ? Math.round(body.price * 100) : service.price_cents;
    const info = run(`INSERT INTO bookings (company_id, reference, customer_id, service_id, employee_id, starts_at, ends_at, address, instructions, status, price_cents, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
    company.id, bookingReference(), customerId, service.id, body.employee_id ?? null, start, end, body.address, body.instructions, body.status, price);
    return Number(info.lastInsertRowid);
  });
  const b = one(`${BOOKING_SELECT} WHERE b.id = ?`, id);
  logActivity(company.id, req.user.id, 'created', 'booking', id, `${req.user.name} heeft boeking ${b.reference} voor ${b.customer_name} aangemaakt`);
  if (b.employee_id) notifyAssignment(company, b);
  if (b.status === 'confirmed') notifyConfirmed(company, b);
  res.status(201).json({ booking: b });
});

router.patch('/:id', admin, (req, res) => {
  const id = idParam(req.params.id);
  const body = parse(z.object({
    date: v.date.optional(), time: v.time.optional(),
    service_id: z.number().int().optional(),
    address: v.text(300).min(3).optional(),
    instructions: v.optText(1000),
    employee_id: z.number().int().nullable().optional(),
    price: v.money.optional(),
    allow_outside_hours: z.boolean().default(false),
  }), req.body);
  const company = getCompany(req.user.companyId);
  const before = loadBooking(req, id);
  if (['completed', 'cancelled'].includes(before.status) && (body.date || body.time || body.employee_id !== undefined || body.service_id)) {
    throw badRequest(`Een ${STATUS_NL[before.status]} boeking kan niet meer worden verzet of toegewezen.`);
  }
  const service = body.service_id ? one('SELECT * FROM services WHERE id = ? AND company_id = ?', body.service_id, company.id) : one('SELECT * FROM services WHERE id = ?', before.service_id);
  if (!service) throw notFound('Dienst');
  if (body.employee_id && !one('SELECT 1 FROM employees WHERE id = ? AND company_id = ?', body.employee_id, company.id)) throw notFound('Medewerker');

  const start = `${body.date ?? before.starts_at.slice(0, 10)} ${body.time ?? before.starts_at.slice(11)}`;
  const employeeId = body.employee_id !== undefined ? body.employee_id : before.employee_id;
  const timeChanged = start !== before.starts_at || service.id !== before.service_id;
  const employeeChanged = employeeId !== before.employee_id;

  tx(() => {
    let end = before.ends_at;
    if (timeChanged || employeeChanged) {
      end = assertBookable(company, start, service.duration_min, {
        employeeId, excludeId: id, enforceHours: timeChanged && !body.allow_outside_hours, enforceNotice: false,
      });
    }
    run(`UPDATE bookings SET starts_at = ?, ends_at = ?, service_id = ?, employee_id = ?, address = ?, instructions = ?, price_cents = ?, updated_at = datetime('now') WHERE id = ?`,
      start, end, service.id, employeeId, body.address ?? before.address,
      body.instructions !== undefined ? body.instructions : before.instructions,
      body.price !== undefined ? Math.round(body.price * 100) : (body.service_id && body.service_id !== before.service_id ? service.price_cents : before.price_cents),
      id);
    if (timeChanged) run('DELETE FROM reminder_log WHERE booking_id = ?', id);
  });
  const b = one(`${BOOKING_SELECT} WHERE b.id = ?`, id);
  if (timeChanged) {
    logActivity(company.id, req.user.id, 'rescheduled', 'booking', id, `${req.user.name} heeft ${b.reference} verzet naar ${fmtShort(b.starts_at)}`);
    notifySafe(company.id, 'booking_confirmed', {
      title: `Boeking ${b.reference} verzet`, body: `${b.customer_name} · nu ${fmtShort(b.starts_at)}`, link: `/app/bookings?open=${id}`,
      emailTo: [b.customer_email], smsTo: [b.customer_phone],
      emailSubject: `Je afspraak voor ${b.service_name} is verzet`,
      emailBody: `Hallo ${b.customer_name},\n\nJe afspraak voor ${b.service_name} (${b.reference}) is verzet naar ${fmtWhen(b.starts_at)}.\nAdres: ${b.address}\n\nMet vriendelijke groet,\n${company.name}`,
    });
  }
  if (employeeChanged && b.employee_id) {
    logActivity(company.id, req.user.id, 'assigned', 'booking', id, `${req.user.name} heeft ${b.employee_name} toegewezen aan ${b.reference}`);
    notifyAssignment(company, b);
  }
  res.json({ booking: b });
});

const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const EMPLOYEE_TRANSITIONS = { confirmed: ['in_progress'], in_progress: ['completed'] };

router.post('/:id/status', (req, res) => {
  const id = idParam(req.params.id);
  const body = parse(z.object({
    status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']),
    reason: v.optText(500),
  }), req.body);
  const company = getCompany(req.user.companyId);
  const b = loadBooking(req, id);
  const allowed = isStaffAdmin(req.user) ? TRANSITIONS[b.status] : (EMPLOYEE_TRANSITIONS[b.status] || []);
  if (!allowed.includes(body.status)) {
    if (!isStaffAdmin(req.user)) throw forbidden('Je kunt alleen je eigen klussen starten of afronden.');
    throw badRequest(`Een ${STATUS_NL[b.status]} boeking kan niet worden gewijzigd naar "${STATUS_TO[body.status]}".`);
  }
  if (body.status === 'confirmed') {
    // Re-validate availability at confirmation time (opening hours were already checked on request).
    tx(() => {
      assertBookable(company, b.starts_at, b.duration_min, { employeeId: b.employee_id, excludeId: id, enforceHours: false, enforceNotice: false });
      run(`UPDATE bookings SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`, id);
    });
  } else {
    run(`UPDATE bookings SET status = ?, cancel_reason = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END, updated_at = datetime('now') WHERE id = ?`,
      body.status, body.status === 'cancelled' ? body.reason : b.cancel_reason, body.status, id);
  }
  const fresh = one(`${BOOKING_SELECT} WHERE b.id = ?`, id);
  const verb = { confirmed: b.status === 'pending' ? 'accepted' : 'confirmed', in_progress: 'started', completed: 'completed', cancelled: b.status === 'pending' ? 'rejected' : 'cancelled', pending: 'reopened' }[body.status];
  const verbNl = { accepted: 'geaccepteerd', confirmed: 'bevestigd', started: 'gestart', completed: 'afgerond', rejected: 'geweigerd', cancelled: 'geannuleerd', reopened: 'heropend' }[verb];
  logActivity(company.id, req.user.id, verb, 'booking', id, `${req.user.name} heeft boeking ${fresh.reference} (${fresh.customer_name}) ${verbNl}`);

  if (body.status === 'confirmed') notifyConfirmed(company, fresh);
  if (body.status === 'cancelled') {
    notifySafe(company.id, 'booking_cancelled', {
      title: `Boeking ${fresh.reference} ${verbNl}`, body: `${fresh.customer_name} · ${fresh.service_name} · ${fmtShort(fresh.starts_at)}${body.reason ? ` · ${body.reason}` : ''}`,
      link: `/app/bookings?open=${id}`, emailTo: [fresh.customer_email], smsTo: [fresh.customer_phone],
      emailSubject: `Je afspraak voor ${fresh.service_name} is geannuleerd`,
      emailBody: `Hallo ${fresh.customer_name},\n\nJe afspraak voor ${fresh.service_name} op ${fmtWhen(fresh.starts_at)} (${fresh.reference}) is geannuleerd.${body.reason ? `\nReden: ${body.reason}` : ''}\n\nHeb je vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n${company.name}`,
    });
    if (fresh.employee_id) {
      const user = one('SELECT id FROM users WHERE employee_id = ?', fresh.employee_id);
      if (user) notifySafe(company.id, 'booking_cancelled', { title: `Klus geannuleerd: ${fresh.service_name}`, body: `${fmtShort(fresh.starts_at)} · ${fresh.address}`, link: '/app/bookings', userId: user.id });
    }
  }
  if (body.status === 'completed') {
    notifySafe(company.id, 'job_completed', {
      title: `Klus afgerond: ${fresh.reference}`, body: `${fresh.employee_name || req.user.name} heeft ${fresh.service_name} voor ${fresh.customer_name} afgerond`,
      link: `/app/bookings?open=${id}`,
    });
  }
  res.json({ booking: shapeFor(req.user, fresh) });
});

router.post('/:id/payments', admin, (req, res) => {
  const id = idParam(req.params.id);
  const body = parse(z.object({
    amount: v.money.refine((n) => n > 0, 'moet meer dan 0 zijn'),
    method: z.enum(['cash', 'card', 'bank_transfer', 'other']),
    paid_at: v.date.optional(), note: v.optText(300),
  }), req.body);
  const b = loadBooking(req, id);
  if (b.status === 'cancelled') throw badRequest('Je kunt geen betaling registreren voor een geannuleerde boeking.');
  const company = getCompany(req.user.companyId);
  run(`INSERT INTO payments (company_id, booking_id, customer_id, amount_cents, method, paid_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    company.id, id, b.customer_id, Math.round(body.amount * 100), body.method, `${body.paid_at ?? todayIn(company.timezone)} 12:00`, body.note);
  logActivity(company.id, req.user.id, 'paid', 'booking', id, `${req.user.name} heeft een betaling geregistreerd voor ${b.reference}`);
  res.status(201).json({ booking: one(`${BOOKING_SELECT} WHERE b.id = ?`, id), payments: all('SELECT * FROM payments WHERE booking_id = ?', id) });
});

router.delete('/:id/payments/:pid', admin, (req, res) => {
  const id = idParam(req.params.id);
  loadBooking(req, id);
  const info = run('DELETE FROM payments WHERE id = ? AND booking_id = ? AND company_id = ?', idParam(req.params.pid), id, req.user.companyId);
  if (!info.changes) throw notFound('Betaling');
  res.json({ ok: true });
});

export function notifyConfirmed(company, b) {
  notifySafe(company.id, 'booking_confirmed', {
    title: `Boeking ${b.reference} bevestigd`, body: `${b.customer_name} · ${b.service_name} · ${fmtShort(b.starts_at)}`,
    link: `/app/bookings?open=${b.id}`, emailTo: [b.customer_email], smsTo: [b.customer_phone],
    emailSubject: `Je afspraak voor ${b.service_name} is bevestigd`,
    emailBody: `Hallo ${b.customer_name},\n\nJe afspraak voor ${b.service_name} is bevestigd: ${fmtWhen(b.starts_at)}.\nAdres: ${b.address}\nReferentie: ${b.reference}\n\nTot dan!\n${company.name}`,
  });
}

export function notifyAssignment(company, b) {
  const user = one(`SELECT id FROM users WHERE employee_id = ? AND status = 'active'`, b.employee_id);
  const emp = one('SELECT email, phone FROM employees WHERE id = ?', b.employee_id);
  notifySafe(company.id, 'employee_assigned', {
    title: `Nieuwe klus: ${b.service_name}`, body: `${fmtShort(b.starts_at)} · ${b.address}`, link: `/app/bookings?open=${b.id}`,
    userId: user?.id ?? null, emailTo: [emp?.email], smsTo: [emp?.phone],
    emailSubject: `Nieuwe klus: ${b.service_name} op ${fmtShort(b.starts_at)}`,
    emailBody: `Er is een nieuwe klus aan je toegewezen.\n\nDienst: ${b.service_name}\nWanneer: ${fmtWhen(b.starts_at)} – ${b.ends_at.slice(11)}\nAdres: ${b.address}\n${b.instructions ? `Bijzonderheden: ${b.instructions}\n` : ''}\n${company.name}`,
  });
}

export { addMinutes };
export default router;
