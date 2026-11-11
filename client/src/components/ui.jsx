import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Loader2, X, AlertTriangle, Sparkles, RefreshCw, Inbox } from 'lucide-react';
import { STATUS, initials } from '../lib/format.js';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const VARIANTS = {
  primary: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20',
  dark: 'bg-navy-900 text-white hover:bg-navy-800',
  secondary: 'bg-white text-navy-700 border border-navy-200 hover:bg-navy-50 hover:border-navy-300',
  ghost: 'text-navy-600 hover:bg-navy-50 hover:text-navy-900',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-ghost': 'text-red-600 hover:bg-red-50',
};
const SIZES = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' };

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className, to, href, ...props }) {
  const cls = cx('inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant], SIZES[size], className);
  const content = <>{loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}{children}</>;
  if (to) return <Link to={to} className={cls} {...props}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...props}>{content}</a>;
  return <button type="button" className={cls} disabled={loading || props.disabled} {...props}>{content}</button>;
}

export function IconButton({ icon: Icon, label, className, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex size-9 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-50 hover:text-navy-900', className)} {...props}>
      <Icon className="size-[18px]" />
    </button>
  );
}

export function Field({ label, error, hint, children, className, required }) {
  return (
    <div className={className}>
      {label && <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>}
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-navy-400">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, error, hint, className, required, ...props }) {
  const id = useId();
  return (
    <Field label={label && <label htmlFor={id}>{label}</label>} error={error} hint={hint} className={className} required={required}>
      <input id={id} className={cx('input', error && 'border-red-300 focus:border-red-500 focus:ring-red-500/15')} aria-invalid={!!error} required={required} {...props} />
    </Field>
  );
}

export function Textarea({ label, error, hint, className, rows = 3, ...props }) {
  const id = useId();
  return (
    <Field label={label && <label htmlFor={id}>{label}</label>} error={error} hint={hint} className={className}>
      <textarea id={id} rows={rows} className={cx('input resize-y', error && 'border-red-300')} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, className, children, ...props }) {
  const id = useId();
  return (
    <Field label={label && <label htmlFor={id}>{label}</label>} error={error} hint={hint} className={className}>
      <select id={id} className={cx('input pr-8', error && 'border-red-300')} {...props}>{children}</select>
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx('flex items-start gap-3', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-emerald-500' : 'bg-navy-200')}>
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition', checked && 'translate-x-5')} />
      </button>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium text-navy-800">{label}</span>}
          {description && <span className="block text-xs text-navy-400">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2.5 text-sm text-navy-600', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 rounded border-navy-300 accent-emerald-500" />
      <span>{label}</span>
    </label>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cx('card', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 border-b border-navy-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="font-semibold text-navy-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-navy-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, className, color = 'navy' }) {
  const colors = {
    navy: 'bg-navy-50 text-navy-600 ring-navy-500/15', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20', red: 'bg-red-50 text-red-700 ring-red-600/20', sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', colors[color], className)}>{children}</span>;
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', s.cls)}>
      <span className={cx('size-1.5 rounded-full', s.dot)} />{s.label}
    </span>
  );
}

export function Avatar({ name, color, size = 'size-9', className }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', size, className)}
      style={{ background: color || '#24324f' }}>
      {initials(name)}
    </span>
  );
}

export function Spinner({ className = 'size-6' }) {
  return <Loader2 className={cx('animate-spin text-emerald-500', className)} />;
}

export function PageLoader() {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="size-8" /></div>;
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-navy-100/70', className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="size-6" /></div>
      <h3 className="font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-navy-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><AlertTriangle className="size-6" /></div>
      <h3 className="font-semibold text-navy-900">Laden mislukt</h3>
      <p className="mt-1 max-w-sm text-sm text-navy-400">{error?.message || 'Er ging iets mis.'}</p>
      {onRetry && <Button variant="secondary" className="mt-5" icon={RefreshCw} onClick={() => onRetry()}>Opnieuw proberen</Button>}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-navy-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('-mx-1 flex gap-1 overflow-x-auto border-b border-navy-100 px-1 scrollbar-thin', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition',
            value === t.value ? 'border-emerald-500 text-navy-900' : 'border-transparent text-navy-400 hover:text-navy-700')}>
          {t.icon && <t.icon className="size-4" />}{t.label}
          {t.count !== undefined && <span className={cx('rounded-full px-1.5 text-xs', value === t.value ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-50 text-navy-400')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-navy-50 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', value === o.value ? 'bg-white text-navy-900 shadow-card' : 'text-navy-400 hover:text-navy-700')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, description, children, footer, size = 'max-w-lg' }) {
  useEscape(open, onClose);
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.querySelector('input,select,textarea,button')?.focus(); }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} className={cx('relative flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-2xl bg-white shadow-soft sm:rounded-2xl', size)}>
        <div className="flex items-start justify-between gap-4 border-b border-navy-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-navy-400">{description}</p>}
          </div>
          <IconButton icon={X} label="Sluiten" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-navy-100 bg-navy-50/50 px-5 py-3.5 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, footer, width = 'max-w-xl' }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative flex h-full w-full animate-slide-in-right flex-col bg-white shadow-soft', width)}>
        <div className="flex items-center justify-between gap-4 border-b border-navy-100 px-5 py-4">
          <h2 className="truncate text-lg font-semibold text-navy-900">{title}</h2>
          <IconButton icon={X} label="Sluiten" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-navy-100 bg-navy-50/50 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Bevestigen', danger, loading, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Terug</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {message && <p className="text-sm text-navy-500">{message}</p>}
      {children}
    </Modal>
  );
}

export function UpgradeNotice({ feature, plan = 'Professional' }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow"><Sparkles className="size-6" /></div>
        <h3 className="text-lg font-semibold text-navy-900">{feature} zit in het {plan}-abonnement</h3>
        <p className="mt-1 max-w-md text-sm text-navy-400">Upgrade je abonnement om deze module te gebruiken. Je gegevens blijven gewoon bewaard.</p>
        <Button to="/app/settings?tab=billing" className="mt-6">Abonnementen bekijken</Button>
      </div>
    </Card>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'emerald', trend }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-600', sky: 'bg-sky-50 text-sky-600', amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600', navy: 'bg-navy-50 text-navy-600', pink: 'bg-pink-50 text-pink-600' };
  return (
    <Card className="p-5 transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-navy-400">{label}</p>
        {Icon && <span className={cx('flex size-9 items-center justify-center rounded-xl', tones[tone])}><Icon className="size-[18px]" /></span>}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-navy-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend !== undefined && trend !== null && (
          <span className={cx('font-semibold', trend >= 0 ? 'text-emerald-600' : 'text-red-500')}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%</span>
        )}
        {sub && <span className="text-navy-400">{sub}</span>}
      </div>
    </Card>
  );
}

/** Local form-state helper with server field errors. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => {
    const val = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((v) => ({ ...v, [k]: val }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const applyServerError = (err) => {
    const fields = err?.details?.fields;
    if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, m]) => [k.split('.').pop(), m])));
  };
  return { values, setValues, errors, setErrors, set, applyServerError };
}
