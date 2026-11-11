import { Router } from 'express';
import { z } from 'zod';
import { all, one } from '../db.js';
import { parse, v, todayIn, nowIn, addDays, weekdayOf, badRequest } from '../lib/core.js';
import { requireRole, requireFeature } from '../lib/auth.js';
import { getCompany, scheduleCovers } from '../lib/availability.js';
import { visibleClause } from '../lib/notify.js';
import { BOOKING_SELECT } from './bookings.js';

const router = Router();

const monthStart = (d) => `${d.slice(0, 7)}-01`;
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
/** Monday of the week containing date. */
function weekStart(date) {
  const idx = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(weekdayOf(date));
  return addDays(date, -idx);
}
const sumPayments = (companyId, from, to) => one(`SELECT COALESCE(SUM(amount_cents),0) s FROM payments
  WHERE company_id = ? AND status = 'paid' AND paid_at >= ? AND paid_at < ?`, companyId, from, to).s;

export function revenueSeries(companyId, today, { weeks = 8, months = 12 } = {}) {
  const weekly = [];
  const thisWeek = weekStart(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    weekly.push({ label: from.slice(5).replace('-', '/'), from, revenue: sumPayments(companyId, from, addDays(from, 7)) / 100 });
  }
  const monthly = [];
  const ym = today.slice(0, 7);
  for (let i = months - 1; i >= 0; i--) {
    const m = shiftMonth(ym, -i);
    const label = new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
    monthly.push({ label: `${label} ${m.slice(2, 4)}`, month: m, revenue: sumPayments(companyId, `${m}-01`, `${shiftMonth(m, 1)}-01`) / 100 });
  }
  return { weekly, monthly };
}

router.get('/', (req, res) => {
  const company = getCompany(req.user.companyId);
  const today = todayIn(company.timezone);
  const now = nowIn(company.timezone);

  if (req.user.role === 'employee') {
    const eid = req.user.employeeId ?? -1;
    const todayJobs = all(`${BOOKING_SELECT} WHERE b.employee_id = ? AND substr(b.starts_at,1,10) = ? AND b.status != 'cancelled' ORDER BY b.starts_at`, eid, today);
    const upcoming = all(`${BOOKING_SELECT} WHERE b.employee_id = ? AND b.starts_at > ? AND b.status IN ('pending','confirmed') ORDER BY b.starts_at LIMIT 10`, eid, `${today} 23:59`);
    const completedMonth = one(`SELECT COUNT(*) n FROM bookings WHERE employee_id = ? AND status = 'completed' AND starts_at >= ?`, eid, monthStart(today)).n;
    const completedTotal = one(`SELECT COUNT(*) n FROM bookings WHERE employee_id = ? AND status = 'completed'`, eid).n;
    const strip = ({ customer_email, price_cents, paid_cents, ...r }) => r;
    return res.json({ role: 'employee', today, todayJobs: todayJobs.map(strip), upcoming: upcoming.map(strip), completedMonth, completedTotal });
  }

  const cid = company.id;
  const mStart = monthStart(today);
  const prevStart = `${shiftMonth(today.slice(0, 7), -1)}-01`;
  const nextStart = `${shiftMonth(today.slice(0, 7), 1)}-01`;
  const revenueMonth = sumPayments(cid, mStart, nextStart);
  // Compare month-to-date with the same number of days last month (not the full month).
  const dayOfMonth = Number(today.slice(8, 10));
  const prevSameDay = addDays(prevStart, dayOfMonth); // exclusive bound
  const revenuePrev = sumPayments(cid, prevStart, prevSameDay < mStart ? prevSameDay : mStart);
  const count = (sql, ...p) => one(sql, ...p).n;

  const stats = {
    revenueMonth, revenuePrevMonth: revenuePrev,
    bookingsMonth: count(`SELECT COUNT(*) n FROM bookings WHERE company_id = ? AND status != 'cancelled' AND starts_at >= ? AND starts_at < ?`, cid, mStart, nextStart),
    bookingsTotal: count(`SELECT COUNT(*) n FROM bookings WHERE company_id = ? AND status != 'cancelled'`, cid),
    pending: count(`SELECT COUNT(*) n FROM bookings WHERE company_id = ? AND status = 'pending'`, cid),
    completedMonth: count(`SELECT COUNT(*) n FROM bookings WHERE company_id = ? AND status = 'completed' AND starts_at >= ? AND starts_at < ?`, cid, mStart, nextStart),
    completedTotal: count(`SELECT COUNT(*) n FROM bookings WHERE company_id = ? AND status = 'completed'`, cid),
    activeCustomers: count(`SELECT COUNT(DISTINCT customer_id) n FROM bookings WHERE company_id = ? AND status != 'cancelled' AND starts_at >= ?`, cid, `${addDays(today, -90)} 00:00`),
    totalCustomers: count('SELECT COUNT(*) n FROM customers WHERE company_id = ?', cid),
    employees: count(`SELECT COUNT(*) n FROM employees WHERE company_id = ? AND status = 'active'`, cid),
    employeesTotal: count('SELECT COUNT(*) n FROM employees WHERE company_id = ?', cid),
  };

  const statusOverview = all(`SELECT status, COUNT(*) n FROM bookings WHERE company_id = ? AND starts_at >= ? AND starts_at < ? GROUP BY status`, cid, mStart, nextStart);
  const upcoming = all(`${BOOKING_SELECT} WHERE b.company_id = ? AND b.ends_at >= ? AND b.status IN ('pending','confirmed','in_progress') ORDER BY b.starts_at LIMIT 8`, cid, now);
  const activity = all(`SELECT a.*, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.company_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 10`, cid);
  const notifications = all(`SELECT n.*, (r.notification_id IS NOT NULL) AS is_read FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.company_id = ? AND ${visibleClause(req.user)} ORDER BY n.created_at DESC, n.id DESC LIMIT 6`, req.user.id, cid);

  const employees = all(`SELECT * FROM employees WHERE company_id = ? AND status != 'inactive' ORDER BY name`, cid).map((e) => {
    const sched = JSON.parse(e.work_schedule)[weekdayOf(today)];
    const current = one(`SELECT b.reference, s.name AS service_name, b.ends_at FROM bookings b JOIN services s ON s.id = b.service_id
      WHERE b.employee_id = ? AND b.status != 'cancelled' AND b.starts_at <= ? AND b.ends_at > ?`, e.id, now, now);
    const jobsToday = one(`SELECT COUNT(*) n FROM bookings WHERE employee_id = ? AND status != 'cancelled' AND substr(starts_at,1,10) = ?`, e.id, today).n;
    let state = 'available';
    if (e.status === 'on_leave') state = 'on_leave';
    else if (!sched || sched.off) state = 'off';
    else if (current) state = 'on_job';
    else if (!scheduleCovers(JSON.parse(e.work_schedule), now, now)) state = 'off_shift';
    return { id: e.id, name: e.name, color: e.color, job_title: e.job_title, state, current, jobsToday, shift: sched && !sched.off ? `${sched.start}–${sched.end}` : null };
  });

  res.json({
    role: req.user.role, today, currency: company.currency, stats, statusOverview, upcoming, activity, notifications, employees,
    revenue: revenueSeries(cid, today),
    showEmployees: req.subscription.features.includes('employees'),
  });
});

// ---------------- Analytics ----------------
const analyticsQuery = z.object({ from: v.date, to: v.date, group: z.enum(['day', 'week', 'month']).optional() });

function rangeOrDefault(req, company) {
  const today = todayIn(company.timezone);
  const q = parse(analyticsQuery.partial(), req.query);
  const from = q.from || addDays(today, -89);
  const to = q.to || today;
  if (from > to) throw badRequest('The start date must be before the end date.');
  return { from, to, group: q.group };
}

function bucketKey(date, group) {
  if (group === 'month') return date.slice(0, 7);
  if (group === 'week') return weekStart(date);
  return date;
}
function buckets(from, to, group) {
  const keys = [];
  let d = group === 'week' ? weekStart(from) : group === 'month' ? `${from.slice(0, 7)}-01` : from;
  while (d <= to) {
    keys.push(bucketKey(d, group));
    d = group === 'month' ? `${shiftMonth(d.slice(0, 7), 1)}-01` : addDays(d, group === 'week' ? 7 : 1);
  }
  return [...new Set(keys)];
}

router.get('/analytics', requireRole('owner', 'manager'), (req, res) => {
  const company = getCompany(req.user.companyId);
  const { from, to, group: g } = rangeOrDefault(req, company);
  const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
  const group = g || (days <= 31 ? 'day' : days <= 180 ? 'week' : 'month');
  const advanced = req.subscription.features.includes('advanced_analytics');
  const cid = company.id;
  const lo = `${from} 00:00`; const hi = `${to} 23:59`;

  const payments = all(`SELECT paid_at, amount_cents FROM payments WHERE company_id = ? AND status = 'paid' AND paid_at BETWEEN ? AND ?`, cid, lo, hi);
  const bookings = all(`SELECT b.starts_at, b.status, b.price_cents, b.service_id, b.employee_id FROM bookings b WHERE b.company_id = ? AND b.starts_at BETWEEN ? AND ?`, cid, lo, hi);

  const keys = buckets(from, to, group);
  const series = Object.fromEntries(keys.map((k) => [k, { key: k, revenue: 0, bookings: 0, completed: 0, newCustomers: 0 }]));
  for (const p of payments) { const k = bucketKey(p.paid_at.slice(0, 10), group); if (series[k]) series[k].revenue += p.amount_cents / 100; }
  for (const b of bookings) {
    const k = bucketKey(b.starts_at.slice(0, 10), group);
    if (!series[k]) continue;
    if (b.status !== 'cancelled') series[k].bookings += 1;
    if (b.status === 'completed') series[k].completed += 1;
  }

  const totalRevenue = payments.reduce((s, p) => s + p.amount_cents, 0);
  const nonCancelled = bookings.filter((b) => b.status !== 'cancelled');
  const completed = bookings.filter((b) => b.status === 'completed');
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
  const kpis = {
    totalRevenue,
    bookings: nonCancelled.length,
    completed: completed.length,
    averageBookingValue: nonCancelled.length ? Math.round(nonCancelled.reduce((s, b) => s + b.price_cents, 0) / nonCancelled.length) : 0,
    cancellationRate: bookings.length ? Math.round((cancelled / bookings.length) * 1000) / 10 : 0,
    newCustomers: one(`SELECT COUNT(*) n FROM customers WHERE company_id = ? AND created_at BETWEEN ? AND ?`, cid, `${from} 00:00:00`, `${to} 23:59:59`).n,
  };
  const monthly = revenueSeries(cid, todayIn(company.timezone), { weeks: 1, months: 12 }).monthly;

  const result = { from, to, group, currency: company.currency, advanced, kpis, series: Object.values(series), monthly };

  if (advanced) {
    result.popularServices = all(`SELECT s.name, COUNT(b.id) AS bookings, COALESCE(SUM(CASE WHEN b.status='completed' THEN b.price_cents END),0) AS revenue_cents
      FROM services s LEFT JOIN bookings b ON b.service_id = s.id AND b.status != 'cancelled' AND b.starts_at BETWEEN ? AND ?
      WHERE s.company_id = ? GROUP BY s.id ORDER BY bookings DESC`, lo, hi, cid);
    const custs = all(`SELECT substr(created_at,1,10) d FROM customers WHERE company_id = ? AND created_at <= ? ORDER BY created_at`, cid, `${to} 23:59:59`);
    let running = custs.filter((c) => c.d < from).length;
    const growth = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const c of custs) if (c.d >= from) { const k = bucketKey(c.d, group); if (k in growth) growth[k] += 1; }
    result.customerGrowth = keys.map((k) => { running += growth[k]; series[k].newCustomers = growth[k]; return { key: k, newCustomers: growth[k], total: running }; });
    result.employeeActivity = all(`SELECT e.name, e.color,
        SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN b.status IN ('confirmed','in_progress','pending') THEN 1 ELSE 0 END) AS scheduled,
        ROUND(COALESCE(SUM(CASE WHEN b.status = 'completed' THEN (julianday(replace(b.ends_at,' ','T')) - julianday(replace(b.starts_at,' ','T'))) * 24 END),0), 1) AS hours,
        COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.price_cents END),0) AS revenue_cents
      FROM employees e LEFT JOIN bookings b ON b.employee_id = e.id AND b.starts_at BETWEEN ? AND ?
      WHERE e.company_id = ? GROUP BY e.id ORDER BY completed DESC`, lo, hi, cid);
    result.statusBreakdown = all(`SELECT status, COUNT(*) n FROM bookings WHERE company_id = ? AND starts_at BETWEEN ? AND ? GROUP BY status`, cid, lo, hi);
    result.sourceBreakdown = all(`SELECT source, COUNT(*) n FROM bookings WHERE company_id = ? AND starts_at BETWEEN ? AND ? AND status != 'cancelled' GROUP BY source`, cid, lo, hi);
  }
  res.json(result);
});

// ---------------- CSV export (Business plan) ----------------
const csvCell = (val) => {
  if (val === null || val === undefined) return '';
  let s = String(val);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.map((c) => c[0]).join(','), ...rows.map((r) => cols.map((c) => csvCell(c[1](r))).join(','))].join('\n');

router.get('/export/:report', requireRole('owner', 'manager'), requireFeature('advanced_reporting'), (req, res) => {
  const company = getCompany(req.user.companyId);
  const { from, to } = rangeOrDefault(req, company);
  const lo = `${from} 00:00`; const hi = `${to} 23:59`;
  const money = (c) => (c / 100).toFixed(2);
  let csv;
  if (req.params.report === 'bookings') {
    const rows = all(`${BOOKING_SELECT} WHERE b.company_id = ? AND b.starts_at BETWEEN ? AND ? ORDER BY b.starts_at`, company.id, lo, hi);
    csv = toCsv(rows, [['Reference', (r) => r.reference], ['Start', (r) => r.starts_at], ['End', (r) => r.ends_at], ['Status', (r) => r.status],
      ['Service', (r) => r.service_name], ['Customer', (r) => r.customer_name], ['Customer email', (r) => r.customer_email], ['Address', (r) => r.address],
      ['Employee', (r) => r.employee_name], ['Price', (r) => money(r.price_cents)], ['Paid', (r) => money(r.paid_cents)], ['Source', (r) => r.source]]);
  } else if (req.params.report === 'payments') {
    const rows = all(`SELECT p.*, b.reference, c.name AS customer_name FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.company_id = ? AND p.paid_at BETWEEN ? AND ? ORDER BY p.paid_at`, company.id, lo, hi);
    csv = toCsv(rows, [['Date', (r) => r.paid_at.slice(0, 10)], ['Booking', (r) => r.reference], ['Customer', (r) => r.customer_name],
      ['Amount', (r) => money(r.amount_cents)], ['Method', (r) => r.method], ['Status', (r) => r.status], ['Note', (r) => r.note]]);
  } else if (req.params.report === 'customers') {
    const rows = all(`SELECT c.*, (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.customer_id = c.id AND p.status='paid') spent,
      (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status != 'cancelled') bookings FROM customers c WHERE c.company_id = ? ORDER BY c.name`, company.id);
    csv = toCsv(rows, [['Name', (r) => r.name], ['Email', (r) => r.email], ['Phone', (r) => r.phone], ['Address', (r) => r.address], ['City', (r) => r.city],
      ['Bookings', (r) => r.bookings], ['Total spent', (r) => money(r.spent)], ['Customer since', (r) => r.created_at.slice(0, 10)]]);
  } else {
    throw badRequest('Unknown report');
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cleanflow-${req.params.report}-${from}-to-${to}.csv"`);
  res.send(`﻿${csv}`);
});

export default router;
