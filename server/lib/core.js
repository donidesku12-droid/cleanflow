import crypto from 'node:crypto';
import { z } from 'zod';
import { run } from '../db.js';

z.config(z.locales.nl());

// ---------- Errors ----------
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Item') => new HttpError(404, `${what} niet gevonden`);
export const forbidden = (msg = 'Je hebt hier geen toestemming voor') => new HttpError(403, msg);
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
    throw badRequest(first ? `${humanize(first[0])}: ${first[1]}` : 'Ongeldige invoer', { fields });
  }
  return result.data;
}
const FIELD_NL = {
  name: 'Naam', email: 'E-mailadres', phone: 'Telefoonnummer', password: 'Wachtwoord', newPassword: 'Nieuw wachtwoord', currentPassword: 'Huidig wachtwoord',
  companyName: 'Bedrijfsnaam', acceptTerms: 'Voorwaarden', address: 'Adres', city: 'Plaats', postal_code: 'Postcode', country: 'Land', notes: 'Notities',
  tags: 'Labels', date: 'Datum', time: 'Tijd', service_id: 'Dienst', customer_id: 'Klant', employee_id: 'Medewerker', instructions: 'Bijzonderheden',
  price: 'Prijs', amount: 'Bedrag', method: 'Betaalwijze', duration_min: 'Duur', description: 'Omschrijving', job_title: 'Functie', status: 'Status',
  privacy_consent: 'Toestemming', consent: 'Toestemming', message: 'Bericht', question: 'Vraag', answer: 'Antwoord', website: 'Website',
  assistant_name: 'Naam van de assistent', welcome_message: 'Welkomstbericht', escalation_message: 'Bericht bij doorsturen', languages: 'Talen',
  timezone: 'Tijdzone', currency: 'Valuta', reason: 'Reden', from: 'Van', to: 'Tot', token: 'Link', role: 'Rol', plan: 'Abonnement',
  'new_customer.name': 'Naam klant', 'new_customer.email': 'E-mailadres klant', 'new_customer.phone': 'Telefoonnummer klant',
};
const humanize = (k) => (k === '_' ? 'Invoer' : FIELD_NL[k] || FIELD_NL[k.split('.').pop()] || k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));

export const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

// ---------- Validation primitives ----------
const trimmed = (max) => z.string().trim().max(max);
export const v = {
  name: trimmed(120).min(1, 'is verplicht'),
  text: (max = 2000) => trimmed(max),
  optText: (max = 2000) => trimmed(max).optional().nullable().transform((s) => (s ? s : null)),
  email: z.string().trim().toLowerCase().max(254).email('moet een geldig e-mailadres zijn'),
  optEmail: z.union([z.literal(''), z.null(), z.string().trim().toLowerCase().max(254).email('moet een geldig e-mailadres zijn')])
    .optional().transform((s) => (s ? s : null)),
  phone: z.string().trim().max(32).regex(/^[+()\d\s.-]{6,32}$/, 'moet een geldig telefoonnummer zijn'),
  optPhone: z.union([z.literal(''), z.null(), z.string().trim().max(32).regex(/^[+()\d\s.-]{6,32}$/, 'moet een geldig telefoonnummer zijn')])
    .optional().transform((s) => (s ? s : null)),
  password: z.string().min(8, 'moet minimaal 8 tekens hebben').max(200)
    .regex(/[A-Za-z]/, 'moet een letter bevatten').regex(/\d/, 'moet een cijfer bevatten'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'moet een datum zijn (JJJJ-MM-DD)'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'moet een tijd zijn (UU:MM)'),
  money: z.coerce.number().min(0, 'mag niet negatief zijn').max(100000, 'is te hoog'),
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
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(cents / 100);
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
}).refine((h) => h.closed || toMin(h.open) < toMin(h.close), 'de sluitingstijd moet na de openingstijd liggen')])));

export const scheduleSchema = z.object(Object.fromEntries(DAYS.map((d) => [d, z.object({
  start: v.time, end: v.time, off: z.boolean(),
}).refine((h) => h.off || toMin(h.start) < toMin(h.end), 'de eindtijd moet na de begintijd liggen')])));

/** 'YYYY-MM-DD HH:MM' → 'donderdag 12 november 2026 om 08:00' (for emails and notifications). */
export function fmtWhen(dt) {
  if (!dt) return '';
  const d = new Date(`${dt.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return dt.length > 10 ? `${d} om ${dt.slice(11, 16)}` : d;
}
/** Short form: 'do 12 nov 08:00'. */
export function fmtShort(dt) {
  if (!dt) return '';
  const d = new Date(`${dt.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return dt.length > 10 ? `${d} ${dt.slice(11, 16)}` : d;
}
