import { Router } from 'express';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { parse, v, idParam, notFound, badRequest, logActivity } from '../lib/core.js';
import { requireRole } from '../lib/auth.js';
import { BOOKING_SELECT } from './bookings.js';

const router = Router();
router.use(requireRole('owner', 'manager'));

const STATS = `
  (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.customer_id = c.id AND p.status = 'paid') AS total_spent_cents,
  (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status != 'cancelled') AS booking_count,
  (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status = 'completed') AS completed_count,
  (SELECT MAX(b.starts_at) FROM bookings b WHERE b.customer_id = c.id AND b.status != 'cancelled') AS last_booking_at`;

router.get('/', (req, res) => {
  const q = parse(z.object({
    q: z.string().max(100).optional(),
    segment: z.enum(['all', 'new', 'repeat', 'inactive', 'no_bookings']).default('all'),
    city: z.string().max(80).optional(),
    sort: z.enum(['name', 'recent', 'spend', 'bookings']).default('name'),
  }), req.query);
  const where = ['c.company_id = ?']; const params = [req.user.companyId];
  if (q.q) {
    where.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.address LIKE ? OR c.city LIKE ?)');
    const like = `%${q.q}%`; params.push(like, like, like, like, like);
  }
  if (q.city) { where.push('c.city = ?'); params.push(q.city); }
  const having = {
    all: '', new: `WHERE created_at >= datetime('now','-30 days')`, repeat: 'WHERE booking_count >= 2',
    inactive: `WHERE booking_count > 0 AND last_booking_at < strftime('%Y-%m-%d %H:%M', 'now', '-90 days')`, no_bookings: 'WHERE booking_count = 0',
  }[q.segment];
  const order = { name: 'name COLLATE NOCASE', recent: 'created_at DESC', spend: 'total_spent_cents DESC', bookings: 'booking_count DESC' }[q.sort];
  const rows = all(`SELECT * FROM (SELECT c.*, ${STATS} FROM customers c WHERE ${where.join(' AND ')}) ${having} ORDER BY ${order} LIMIT 1000`, ...params);
  const cities = all(`SELECT DISTINCT city FROM customers WHERE company_id = ? AND city IS NOT NULL AND city != '' ORDER BY city`, req.user.companyId).map((r) => r.city);
  res.json({ customers: rows, cities });
});

router.get('/:id', (req, res) => {
  const id = idParam(req.params.id);
  const customer = one(`SELECT c.*, ${STATS} FROM customers c WHERE c.id = ? AND c.company_id = ?`, id, req.user.companyId);
  if (!customer) throw notFound('Customer');
  const bookings = all(`${BOOKING_SELECT} WHERE b.customer_id = ? AND b.company_id = ? ORDER BY b.starts_at DESC`, id, req.user.companyId);
  const payments = all('SELECT * FROM payments WHERE customer_id = ? AND company_id = ? ORDER BY paid_at DESC', id, req.user.companyId);
  res.json({ customer, bookings, payments });
});

const schema = z.object({
  name: v.name, email: v.optEmail, phone: v.optPhone,
  address: v.optText(300), city: v.optText(80), postal_code: v.optText(20),
  notes: v.optText(4000), tags: v.optText(200),
});

function assertUniqueEmail(companyId, email, exceptId = 0) {
  if (email && one('SELECT 1 FROM customers WHERE company_id = ? AND email = ? AND id != ?', companyId, email, exceptId)) {
    throw badRequest('Email: a customer with this email already exists');
  }
}

router.post('/', (req, res) => {
  const b = parse(schema, req.body);
  assertUniqueEmail(req.user.companyId, b.email);
  const info = run(`INSERT INTO customers (company_id, name, email, phone, address, city, postal_code, notes, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.companyId, b.name, b.email, b.phone, b.address, b.city, b.postal_code, b.notes, b.tags);
  const id = Number(info.lastInsertRowid);
  logActivity(req.user.companyId, req.user.id, 'created', 'customer', id, `${req.user.name} added customer ${b.name}`);
  res.status(201).json({ customer: one('SELECT * FROM customers WHERE id = ?', id) });
});

router.patch('/:id', (req, res) => {
  const id = idParam(req.params.id);
  const existing = one('SELECT * FROM customers WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!existing) throw notFound('Customer');
  const b = parse(schema.partial(), req.body);
  const merged = { ...existing, ...Object.fromEntries(Object.entries(b).filter(([, val]) => val !== undefined)) };
  assertUniqueEmail(req.user.companyId, merged.email, id);
  run(`UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, postal_code = ?, notes = ?, tags = ? WHERE id = ?`,
    merged.name, merged.email, merged.phone, merged.address, merged.city, merged.postal_code, merged.notes, merged.tags, id);
  logActivity(req.user.companyId, req.user.id, 'updated', 'customer', id, `${req.user.name} updated customer ${merged.name}`);
  res.json({ customer: one('SELECT * FROM customers WHERE id = ?', id) });
});

router.delete('/:id', (req, res) => {
  const id = idParam(req.params.id);
  const c = one('SELECT * FROM customers WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!c) throw notFound('Customer');
  const n = one(`SELECT COUNT(*) n FROM bookings WHERE customer_id = ?`, id).n;
  if (n > 0) throw badRequest('This customer has booking history and cannot be deleted. Remove their bookings first or keep the record.');
  run('DELETE FROM customers WHERE id = ?', id);
  logActivity(req.user.companyId, req.user.id, 'deleted', 'customer', id, `${req.user.name} deleted customer ${c.name}`);
  res.json({ ok: true });
});

export default router;
