export const money = (cents, currency = 'EUR', opts = {}) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency, minimumFractionDigits: opts.compact ? 0 : 2, maximumFractionDigits: opts.compact ? 0 : 2 }).format((cents || 0) / 100);

export const moneyUnits = (units, currency = 'EUR') =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(units || 0);

export function priceLabel(s, currency) {
  const p = money(s.price_cents, currency);
  return s.price_unit === 'from' ? `vanaf ${p}` : s.price_unit === 'per_hour' ? `${p}/uur` : p;
}

// Booking times are company-local strings 'YYYY-MM-DD HH:MM'; format without timezone shifts.
const asDate = (d) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
export const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  d ? asDate(d).toLocaleDateString('nl-NL', { ...opts, timeZone: 'UTC' }) : '';
export const fmtDateLong = (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (dt) => (dt ? dt.slice(11, 16) : '');
export const fmtDateTime = (dt) => (dt ? `${fmtDate(dt)} · ${fmtTime(dt)}` : '');
export const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)} u${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

/** Relative time for server timestamps stored in UTC ('YYYY-MM-DD HH:MM:SS'). */
export function timeAgo(ts) {
  if (!ts) return '';
  const t = new Date(ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'zojuist';
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)} uur geleden`;
  if (s < 604800) { const d = Math.floor(s / 86400); return `${d} dag${d === 1 ? '' : 'en'} geleden`; }
  return new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const STATUS = {
  pending: { label: 'In afwachting', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500', color: '#f59e0b' },
  confirmed: { label: 'Bevestigd', cls: 'bg-sky-50 text-sky-700 ring-sky-600/20', dot: 'bg-sky-500', color: '#0ea5e9' },
  in_progress: { label: 'Bezig', cls: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500', color: '#8b5cf6' },
  completed: { label: 'Voltooid', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500', color: '#10b981' },
  cancelled: { label: 'Geannuleerd', cls: 'bg-navy-50 text-navy-500 ring-navy-500/20', dot: 'bg-navy-300', color: '#9aa8c3' },
};

export const todayLocal = () => new Date().toLocaleDateString('en-CA');
export const addDaysStr = (d, n) => { const x = asDate(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
