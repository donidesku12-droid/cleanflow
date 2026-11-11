import { all, one } from '../db.js';
import {
  conflict, badRequest, toMin, fromMin, weekdayOf, addMinutes, nowIn, addDays, todayIn,
} from './core.js';

export function getCompany(companyId) {
  const c = one('SELECT * FROM companies WHERE id = ?', companyId);
  if (c) c.opening_hours = JSON.parse(c.opening_hours);
  return c;
}

function activeEmployees(companyId) {
  return all(`SELECT id, name, work_schedule FROM employees WHERE company_id = ? AND status = 'active'`, companyId)
    .map((e) => ({ ...e, work_schedule: JSON.parse(e.work_schedule) }));
}

function overlapping(companyId, start, end, excludeId) {
  return all(`SELECT id, employee_id FROM bookings
     WHERE company_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ? AND id != ?`,
  companyId, end, start, excludeId ?? 0);
}

export function scheduleCovers(schedule, start, end) {
  const date = start.slice(0, 10);
  if (end.slice(0, 10) !== date) return false;
  const day = schedule[weekdayOf(date)];
  if (!day || day.off) return false;
  return toMin(start.slice(11)) >= toMin(day.start) && toMin(end.slice(11)) <= toMin(day.end);
}

export function withinOpeningHours(company, start, end) {
  const date = start.slice(0, 10);
  if (end.slice(0, 10) !== date) return false;
  const h = company.opening_hours[weekdayOf(date)];
  if (!h || h.closed) return false;
  return toMin(start.slice(11)) >= toMin(h.open) && toMin(end.slice(11)) <= toMin(h.close);
}

/**
 * Capacity model: every active employee whose work schedule covers the slot can
 * take one job at a time. Bookings already assigned occupy that employee;
 * unassigned (e.g. pending online requests) occupy "any" free employee.
 * Companies with no employees on file are treated as a single-person operation.
 */
function capacityCheck(companyId, start, end, { employeeId = null, excludeId = null } = {}) {
  const busy = overlapping(companyId, start, end, excludeId);
  const employees = activeEmployees(companyId);
  if (employees.length === 0) {
    return { ok: busy.length === 0, reason: 'Die tijd is al geboekt.' };
  }
  const busyEmployees = new Set(busy.filter((b) => b.employee_id).map((b) => b.employee_id));
  const unassigned = busy.filter((b) => !b.employee_id).length;
  const free = employees.filter((e) => scheduleCovers(e.work_schedule, start, end) && !busyEmployees.has(e.id));

  if (employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return { ok: false, reason: 'Die medewerker is niet actief.' };
    if (busyEmployees.has(employeeId)) return { ok: false, reason: `${emp.name} heeft op dat moment al een klus.` };
    if (!scheduleCovers(emp.work_schedule, start, end)) return { ok: false, reason: `${emp.name} is op dat moment niet ingeroosterd.` };
    // Taking this employee must still leave room for unassigned requests.
    const remaining = free.filter((e) => e.id !== employeeId).length;
    if (remaining < unassigned) return { ok: false, reason: 'Er is niet genoeg personeel over voor de openstaande aanvragen op dat moment.' };
    return { ok: true };
  }
  return { ok: free.length > unassigned, reason: 'Er is op dat moment geen medewerker beschikbaar.' };
}

/**
 * Throws 409 if the booking cannot be placed. Must be called inside tx() together
 * with the INSERT/UPDATE so two concurrent requests cannot both pass the check.
 */
export function assertBookable(company, start, durationMin, opts = {}) {
  const { employeeId = null, excludeId = null, enforceHours = true, enforceNotice = true } = opts;
  const end = addMinutes(start, durationMin);
  if (end.slice(0, 10) !== start.slice(0, 10)) throw badRequest('Een afspraak moet op dezelfde dag beginnen en eindigen.');
  const now = nowIn(company.timezone);
  if (start < now) throw badRequest('Die tijd ligt in het verleden.');
  if (enforceNotice && start < addMinutes(now, company.min_notice_hours * 60)) {
    throw conflict(`Je moet minimaal ${company.min_notice_hours} uur van tevoren boeken.`);
  }
  if (enforceHours && !withinOpeningHours(company, start, end)) {
    throw conflict('Die tijd valt buiten de openingstijden.');
  }
  const cap = capacityCheck(company.id, start, end, { employeeId, excludeId });
  if (!cap.ok) throw conflict(cap.reason);
  return end;
}

/** Public slot list for a date and service. Only returns slots that pass every rule. */
export function availableSlots(company, service, date) {
  const now = nowIn(company.timezone);
  const earliest = addMinutes(now, company.min_notice_hours * 60);
  const lastDay = addDays(todayIn(company.timezone), company.booking_horizon_days);
  if (date < todayIn(company.timezone) || date > lastDay) return [];
  const hours = company.opening_hours[weekdayOf(date)];
  if (!hours || hours.closed) return [];
  const slots = [];
  for (let m = toMin(hours.open); m + service.duration_min <= toMin(hours.close); m += company.slot_interval_min) {
    const start = `${date} ${fromMin(m)}`;
    if (start < earliest) continue;
    const end = addMinutes(start, service.duration_min);
    if (capacityCheck(company.id, start, end).ok) slots.push(fromMin(m));
  }
  return slots;
}

/** Which dates in [from, from+days) have at least one free slot. */
export function availableDates(company, service, from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    if (availableSlots(company, service, d).length) out.push(d);
  }
  return out;
}

/** Employees free for a given booking window (used by the assign dropdown). */
export function employeeAvailability(company, start, end, excludeId) {
  const busy = overlapping(company.id, start, end, excludeId);
  const busyIds = new Set(busy.filter((b) => b.employee_id).map((b) => b.employee_id));
  return activeEmployees(company.id).map((e) => ({
    id: e.id, name: e.name,
    available: scheduleCovers(e.work_schedule, start, end) && !busyIds.has(e.id),
    reason: busyIds.has(e.id) ? 'Heeft al een klus' : (!scheduleCovers(e.work_schedule, start, end) ? 'Niet ingeroosterd' : null),
  }));
}
