import { Router } from 'express';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { parse, v, idParam, notFound, logActivity } from '../lib/core.js';
import { requireRole } from '../lib/auth.js';

const router = Router();
const admin = requireRole('owner', 'manager');

const STATS = `(SELECT COUNT(*) FROM bookings b WHERE b.service_id = s.id AND b.status != 'cancelled') AS booking_count`;

router.get('/', (req, res) => {
  res.json({ services: all(`SELECT s.*, ${STATS} FROM services s WHERE s.company_id = ? ORDER BY s.active DESC, s.sort_order, s.name`, req.user.companyId) });
});

const schema = z.object({
  name: v.name,
  description: v.optText(1000),
  price: v.money,
  price_unit: z.enum(['fixed', 'from', 'per_hour']).default('fixed'),
  duration_min: z.coerce.number().int().min(15, 'moet minimaal 15 minuten zijn').max(720, 'mag maximaal 12 uur zijn'),
  active: z.boolean().default(true),
});

router.post('/', admin, (req, res) => {
  const b = parse(schema, req.body);
  const order = one('SELECT COALESCE(MAX(sort_order),0)+1 n FROM services WHERE company_id = ?', req.user.companyId).n;
  const info = run(`INSERT INTO services (company_id, name, description, price_cents, price_unit, duration_min, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.companyId, b.name, b.description, Math.round(b.price * 100), b.price_unit, b.duration_min, b.active ? 1 : 0, order);
  const id = Number(info.lastInsertRowid);
  logActivity(req.user.companyId, req.user.id, 'created', 'service', id, `${req.user.name} heeft dienst ${b.name} toegevoegd`);
  res.status(201).json({ service: one('SELECT * FROM services WHERE id = ?', id) });
});

router.patch('/:id', admin, (req, res) => {
  const id = idParam(req.params.id);
  const s = one('SELECT * FROM services WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!s) throw notFound('Dienst');
  const b = parse(schema.partial(), req.body);
  run(`UPDATE services SET name = ?, description = ?, price_cents = ?, price_unit = ?, duration_min = ?, active = ? WHERE id = ?`,
    b.name ?? s.name, b.description !== undefined ? b.description : s.description,
    b.price !== undefined ? Math.round(b.price * 100) : s.price_cents, b.price_unit ?? s.price_unit,
    b.duration_min ?? s.duration_min, b.active !== undefined ? (b.active ? 1 : 0) : s.active, id);
  logActivity(req.user.companyId, req.user.id, 'updated', 'service', id, `${req.user.name} heeft dienst ${b.name ?? s.name} gewijzigd`);
  res.json({ service: one('SELECT * FROM services WHERE id = ?', id) });
});

router.delete('/:id', admin, (req, res) => {
  const id = idParam(req.params.id);
  const s = one('SELECT * FROM services WHERE id = ? AND company_id = ?', id, req.user.companyId);
  if (!s) throw notFound('Dienst');
  if (one('SELECT 1 FROM bookings WHERE service_id = ?', id)) {
    run('UPDATE services SET active = 0 WHERE id = ?', id);
    return res.json({ ok: true, deactivated: true, message: 'Deze dienst heeft boekingen en is daarom uitgezet in plaats van verwijderd.' });
  }
  run('DELETE FROM services WHERE id = ?', id);
  logActivity(req.user.companyId, req.user.id, 'deleted', 'service', id, `${req.user.name} heeft dienst ${s.name} verwijderd`);
  res.json({ ok: true });
});

export default router;
