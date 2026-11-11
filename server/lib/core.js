import crypto from 'node:crypto';
import { z } from 'zod';
import { run } from '../db.js';

// ---------- Errors ----------
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Parse with zod; throws 400 with field errors. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = Object.entries(fields)[0];
    throw badRequest(first ? `${humanize(first[0])}: ${first[1]}` : 'Invalid input', { fields });
  }
  return result.data;
}
const humanize = (k) => (k === '_' ? 'Input' : k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));

export const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

// ---------- Validation primitives ----------
const trimmed = (max) => z.string().trim().max(max);
export const v = {
  name: trimmed(120).min(1, 'is required'),
  text: (max = 2000) => trimmed(max),
  optText: (max = 2000) => trimmed(max).optional().nullable().transform((s) => (s ? s : null)),
  email: z.string().trim().toLowerCase().max(254).email('must be a valid email address'),
  optEmail: z.union([z.literal(''), z.null(), z.string().trim().toLowerCase().max(254).email('must be a valid email address')])
    .optional().transform((s) => (s ? s : null)),
  phone: z.string().trim().max(32).regex(/^[+()\d\s.-]{6,32}$/, 'must be a valid phone number'),
  optPhone: z.union([z.literal(''), z.null(), z.string().trim().max(32).regex(/^[+()\d\s.-]{6,32}$/, 'must be a valid phone number')])
    .optional().transform((s) => (s ? s : null)),
  password: z.string().min(8, 'must be at least 8 characters').max(200)
    .regex(/[A-Za-z]/, 'must contain a letter').regex(/\d/, 'must contain a number'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time (HH:MM)'),
  money: z.coerce.number().min(0, 'cannot be negative').max(100000, 'is too large'),
};

// ---------- Plans & feature gating ----------
export const PLANS = {
  starter: {
    name: 'Starter', price: 19,
    features: ['dashboard', 'customers', 'bookings', 'services', 'basic_analytics', 'online_booking'],
    limits: { teamMembers: 2 },
  },
  professional: {
    name: 'Professional', price: 39,
    features: ['dashboard', 'customers', 'bookings', 'services', 'basic_analytics', 'online_booking',
      'ai_assistant', 'employees', 'advanced_analytics', 'automated_notifications'],
    limits: { teamMembers: 15 },
  },
  business: {
    name: 'Business', price: 69,
    features: ['dashboard', 'customers', 'bookings', 'services', 'basic_analytics', 'online_booking',
      'ai_assistant', 'employees', 'advanced_analytics', 'automated_notifications',
      'advanced_reporting', 'custom_branding', 'priority_support'],
    limits: { teamMembers: 100 },
  },
};
export const TRIAL_DAYS = 14;

// ---------- Crypto helpers ----------
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function bookingReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `CF-${s}`;
}

// ---------- Time helpers (all booking times are company-local 'YYYY-MM-DD HH:MM') ----------
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const pad = (n) => String(n).padStart(2, '0');
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const weekdayOf = (date) => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMinutes(dt, mins) {
  const [date, time] = dt.split(' ');
  const total = toMin(time) + mins;
  const dayShift = Math.floor(total / 1440);
  return `${addDays(date, dayShift)} ${fromMin(((total % 1440) + 1440) % 1440)}`;
}
/** Current wall-clock time in a timezone as 'YYYY-MM-DD HH:MM'. */
export function nowIn(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}
export const todayIn = (tz) => nowIn(tz).slice(0, 10);

export function formatMoney(cents, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100);
}

// ---------- Activity log ----------
export function logActivity(companyId, userId, action, entity, entityId, summary) {
  run(`INSERT INTO activity_log (company_id, user_id, action, entity, entity_id, summary)
       VALUES (?, ?, ?, ?, ?, ?)`, companyId, userId ?? null, action, entity, entityId ?? null, summary);
}

export const DEFAULT_OPENING_HOURS = {
  mon: { open: '08:00', close: '18:00', closed: false },
  tue: { open: '08:00', close: '18:00', closed: false },
  wed: { open: '08:00', close: '18:00', closed: false },
  thu: { open: '08:00', close: '18:00', closed: false },
  fri: { open: '08:00', close: '18:00', closed: false },
  sat: { open: '09:00', close: '14:00', closed: false },
  sun: { open: '09:00', close: '14:00', closed: true },
};
export const DEFAULT_WORK_SCHEDULE = {
  mon: { start: '08:00', end: '17:00', off: false },
  tue: { start: '08:00', end: '17:00', off: false },
  wed: { start: '08:00', end: '17:00', off: false },
  thu: { start: '08:00', end: '17:00', off: false },
  fri: { start: '08:00', end: '17:00', off: false },
  sat: { start: '09:00', end: '14:00', off: true },
  sun: { start: '09:00', end: '14:00', off: true },
};

export const hoursSchema = z.object(Object.fromEntries(DAYS.map((d) => [d, z.object({
  open: v.time, close: v.time, closed: z.boolean(),
}).refine((h) => h.closed || toMin(h.open) < toMin(h.close), 'closing time must be after opening time')])));

export const scheduleSchema = z.object(Object.fromEntries(DAYS.map((d) => [d, z.object({
  start: v.time, end: v.time, off: z.boolean(),
}).refine((h) => h.off || toMin(h.start) < toMin(h.end), 'end time must be after start time')])));
