import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, Clock, MapPin, Phone, Mail, CalendarDays, CheckCircle2, ArrowLeft, AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { priceLabel, duration, fmtDateLong, addDaysStr } from '../../lib/format.js';
import { Button, Input, Textarea, Checkbox, PageLoader, Spinner, ErrorState, cx, useForm } from '../../components/ui.jsx';
import ChatLauncher from '../../components/ChatWidget.jsx';
import Logo from '../../components/Logo.jsx';

const STEPS = ['Service', 'Date & time', 'Your details', 'Review'];
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function Calendar({ month, setMonth, available, selected, onSelect, today, maxDate, loading }) {
  const first = `${month}-01`;
  const startIdx = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells = [...Array(startIdx).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n) => { const d = new Date(`${first}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const label = new Date(`${first}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)} className="rounded-lg p-2 hover:bg-navy-50 disabled:opacity-30" aria-label="Previous month"><ChevronLeft className="size-5" /></button>
        <p className="flex items-center gap-2 font-semibold">{label}{loading && <Spinner className="size-4" />}</p>
        <button onClick={() => shift(1)} disabled={month >= maxDate.slice(0, 7)} className="rounded-lg p-2 hover:bg-navy-50 disabled:opacity-30" aria-label="Next month"><ChevronRight className="size-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((d) => <div key={d} className="py-1 text-xs font-semibold text-navy-400">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const ok = available.has(d);
          return (
            <button key={d} disabled={!ok} onClick={() => onSelect(d)} aria-label={fmtDateLong(d)} aria-pressed={selected === d}
              className={cx('aspect-square rounded-xl text-sm font-medium transition',
                selected === d ? 'bg-emerald-500 text-white shadow-glow' : ok ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'text-navy-200',
                d === today && selected !== d && 'ring-1 ring-navy-300')}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BookingPage() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState(0);
  const [service, setService] = useState(null);
  const [month, setMonth] = useState(null);
  const [dates, setDates] = useState(new Set());
  const [datesLoading, setDatesLoading] = useState(false);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const form = useForm({ name: '', email: '', phone: '', address: '', postal_code: '', city: '', instructions: '', privacy_consent: false, website: '' });

  const load = () => api.get(`/public/company/${slug}`).then((d) => { setInfo(d); setMonth(d.company.today.slice(0, 7)); }).catch(setLoadError);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);
  useEffect(() => { if (info) document.title = `Book a cleaning – ${info.company.name}`; }, [info]);

  const today = info?.company.today;
  const maxDate = today ? addDaysStr(today, info.company.booking_horizon_days) : null;

  // Load available dates for the visible month.
  useEffect(() => {
    if (!service || !month) return;
    let cancelled = false;
    setDatesLoading(true);
    const from = `${month}-01` < today ? today : `${month}-01`;
    api.get(`/public/company/${slug}/dates?service_id=${service.id}&from=${from}&days=31`)
      .then((d) => { if (!cancelled) setDates((prev) => new Set([...[...prev].filter((x) => !x.startsWith(month)), ...d.dates])); })
      .catch(() => {})
      .finally(() => !cancelled && setDatesLoading(false));
    return () => { cancelled = true; };
  }, [service, month, slug, today]);

  useEffect(() => {
    if (!service || !date) return;
    setSlots(null); setTime(null);
    api.get(`/public/company/${slug}/slots?service_id=${service.id}&date=${date}`).then((d) => setSlots(d.slots)).catch(() => setSlots([]));
  }, [service, date, slug]);

  const chooseService = (s) => { setService(s); setDates(new Set()); setDate(null); setTime(null); setStep(1); };

  const validateDetails = () => {
    const v = form.values; const e = {};
    if (!v.name.trim()) e.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Please enter a valid email address';
    if (!/^[+()\d\s.-]{6,32}$/.test(v.phone)) e.phone = 'Please enter a valid phone number';
    if (v.address.trim().length < 3) e.address = 'Please enter the address to be cleaned';
    if (!v.privacy_consent) e.privacy_consent = 'Please agree so we can process your request';
    form.setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const d = await api.post(`/public/company/${slug}/bookings`, { ...form.values, service_id: service.id, date, time, instructions: form.values.instructions || null });
      setResult(d.booking);
    } catch (err) {
      setSubmitError(err.message);
      form.applyServerError(err);
      if (err.status === 409) { setStep(1); setTime(null); setSlots(null); api.get(`/public/company/${slug}/slots?service_id=${service.id}&date=${date}`).then((x) => setSlots(x.slots)); }
    } finally { setSubmitting(false); }
  };

  const hours = useMemo(() => info && ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, i) => [DAY_LABELS[i], info.company.opening_hours[d]]), [info]);

  if (loadError) return <div className="min-h-screen pt-20"><ErrorState error={loadError.status === 404 ? { message: 'This booking page does not exist.' } : loadError} /></div>;
  if (!info) return <PageLoader />;
  const c = info.company;

  return (
    <div className="min-h-screen bg-navy-50/60">
      <header className="border-b border-navy-100 bg-white">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {c.logo ? <img src={c.logo} alt="" className="size-9 rounded-lg object-contain" /> : <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 font-bold text-white">{c.name[0]}</span>}
            <span className="truncate font-bold">{c.name}</span>
          </div>
          {c.phone && <a href={`tel:${c.phone}`} className="hidden items-center gap-2 text-sm font-medium text-navy-500 hover:text-navy-900 sm:flex"><Phone className="size-4" />{c.phone}</a>}
        </div>
      </header>
      {c.is_demo && <div className="bg-amber-50 py-2 text-center text-xs font-medium text-amber-800">Demo company – requests made here go to the CLEANFLOW demo workspace.</div>}

      <div className="container-x grid gap-8 py-8 lg:grid-cols-3 lg:py-12">
        <main className="lg:col-span-2">
          {result ? (
            <div className="card animate-slide-up p-8 text-center sm:p-12">
              <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="size-9 text-emerald-600" /></span>
              <h1 className="mt-5 text-2xl font-bold">Booking request received</h1>
              <p className="mx-auto mt-2 max-w-md text-navy-500">Thank you! {c.name} will review your request and confirm it by email. Your time slot is held while the request is reviewed.</p>
              <dl className="mx-auto mt-8 max-w-sm space-y-2 rounded-2xl bg-navy-50 p-5 text-left text-sm">
                <div className="flex justify-between"><dt className="text-navy-400">Reference</dt><dd className="font-mono font-semibold">{result.reference}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-navy-400">Service</dt><dd className="text-right font-medium">{result.service}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-navy-400">When</dt><dd className="text-right font-medium">{fmtDateLong(result.starts_at)}, {result.starts_at.slice(11)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-navy-400">Status</dt><dd className="font-medium text-amber-600">Awaiting confirmation</dd></div>
              </dl>
              <Button variant="secondary" className="mt-8" onClick={() => { setResult(null); setStep(0); setService(null); setDate(null); setTime(null); form.setValues((v) => ({ ...v, instructions: '' })); }}>Make another booking</Button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <ol className="flex border-b border-navy-100" aria-label="Booking steps">
                {STEPS.map((s, i) => (
                  <li key={s} className={cx('flex flex-1 items-center justify-center gap-2 py-3.5 text-xs font-semibold sm:text-sm', i === step ? 'text-navy-900' : i < step ? 'text-emerald-600' : 'text-navy-300')}>
                    <span className={cx('flex size-6 items-center justify-center rounded-full text-xs', i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-navy-900 text-white' : 'bg-navy-100')}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
                    <span className="hidden sm:inline">{s}</span>
                  </li>
                ))}
              </ol>
              <div className="p-5 sm:p-8">
                {!c.booking_enabled ? (
                  <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><AlertCircle className="size-5 shrink-0" />Online booking is currently unavailable. Please contact {c.name} directly{c.phone ? ` on ${c.phone}` : ''}.</div>
                ) : step === 0 ? (
                  <div className="animate-fade-in">
                    <h1 className="text-xl font-bold">Choose a service</h1>
                    <p className="mt-1 text-sm text-navy-500">Prices as listed by {c.name}.</p>
                    {info.services.length === 0 ? <p className="mt-6 text-sm text-navy-400">No services are available for online booking at the moment.</p> : (
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {info.services.map((s) => (
                          <button key={s.id} onClick={() => chooseService(s)} className={cx('group rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-soft', service?.id === s.id ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-navy-100')}>
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-semibold">{s.name}</p>
                              <p className="shrink-0 font-bold text-emerald-600">{priceLabel(s, c.currency)}</p>
                            </div>
                            {s.description && <p className="mt-1.5 line-clamp-2 text-sm text-navy-500">{s.description}</p>}
                            <p className="mt-3 flex items-center gap-1.5 text-xs text-navy-400"><Clock className="size-3.5" />approx. {duration(s.duration_min)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : step === 1 ? (
                  <div className="animate-fade-in">
                    <h2 className="text-xl font-bold">Pick a date and time</h2>
                    <p className="mt-1 text-sm text-navy-500">Only times when a cleaner is actually available are shown.</p>
                    {submitError && <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>}
                    <div className="mt-6 grid gap-8 md:grid-cols-2">
                      <Calendar month={month} setMonth={setMonth} available={dates} selected={date} onSelect={setDate} today={today} maxDate={maxDate} loading={datesLoading} />
                      <div>
                        <p className="mb-3 font-semibold">{date ? fmtDateLong(date) : 'Select a date'}</p>
                        {!date ? <p className="text-sm text-navy-400">Highlighted dates have free time slots.</p>
                          : slots === null ? <Spinner />
                            : slots.length === 0 ? <p className="text-sm text-navy-400">No free times left on this day. Please choose another date.</p>
                              : (
                                <div className="grid grid-cols-3 gap-2">
                                  {slots.map((t) => (
                                    <button key={t} onClick={() => setTime(t)} aria-pressed={time === t}
                                      className={cx('rounded-xl border py-2.5 text-sm font-semibold transition', time === t ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-navy-200 hover:border-emerald-400 hover:bg-emerald-50')}>{t}</button>
                                  ))}
                                </div>
                              )}
                      </div>
                    </div>
                    <div className="mt-8 flex justify-between">
                      <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(0)}>Back</Button>
                      <Button disabled={!time} onClick={() => { setSubmitError(''); setStep(2); }}>Continue</Button>
                    </div>
                  </div>
                ) : step === 2 ? (
                  <div className="animate-fade-in">
                    <h2 className="text-xl font-bold">Your details</h2>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <Input label="Full name" value={form.values.name} onChange={form.set('name')} error={form.errors.name} autoComplete="name" required className="sm:col-span-2" />
                      <Input label="Email" type="email" value={form.values.email} onChange={form.set('email')} error={form.errors.email} autoComplete="email" required />
                      <Input label="Phone" type="tel" value={form.values.phone} onChange={form.set('phone')} error={form.errors.phone} autoComplete="tel" required />
                      <Input label="Street address" value={form.values.address} onChange={form.set('address')} error={form.errors.address} autoComplete="street-address" required className="sm:col-span-2" />
                      <Input label="Postal code" value={form.values.postal_code} onChange={form.set('postal_code')} error={form.errors.postal_code} autoComplete="postal-code" />
                      <Input label="City" value={form.values.city} onChange={form.set('city')} error={form.errors.city} autoComplete="address-level2" />
                      <Textarea label="Special instructions (optional)" className="sm:col-span-2" placeholder="Access codes, pets, areas to focus on…" value={form.values.instructions} onChange={form.set('instructions')} error={form.errors.instructions} />
                      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={form.values.website} onChange={form.set('website')} aria-hidden="true" />
                      <div className="sm:col-span-2">
                        <Checkbox checked={form.values.privacy_consent} onChange={form.set('privacy_consent')} label={`I agree that ${c.name} stores my details to handle this booking.`} />
                        {form.errors.privacy_consent && <p className="mt-1 text-xs font-medium text-red-600">{form.errors.privacy_consent}</p>}
                      </div>
                    </div>
                    <div className="mt-8 flex justify-between">
                      <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)}>Back</Button>
                      <Button onClick={() => validateDetails() && setStep(3)}>Review booking</Button>
                    </div>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <h2 className="text-xl font-bold">Review your booking</h2>
                    <p className="mt-1 text-sm text-navy-500">Please check everything before sending your request.</p>
                    {submitError && <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>}
                    <dl className="mt-6 divide-y divide-navy-100 rounded-2xl border border-navy-100 text-sm">
                      {[
                        ['Service', service.name, () => setStep(0)],
                        ['Date & time', `${fmtDateLong(date)} at ${time} (approx. ${duration(service.duration_min)})`, () => setStep(1)],
                        ['Address', [form.values.address, form.values.postal_code, form.values.city].filter(Boolean).join(', '), () => setStep(2)],
                        ['Contact', `${form.values.name} · ${form.values.email} · ${form.values.phone}`, () => setStep(2)],
                        ['Instructions', form.values.instructions || '—', () => setStep(2)],
                        ['Price', priceLabel(service, c.currency), null],
                      ].map(([k, v, edit]) => (
                        <div key={k} className="flex items-start gap-4 px-5 py-3.5">
                          <dt className="w-28 shrink-0 text-navy-400">{k}</dt>
                          <dd className="flex-1 font-medium break-words">{v}</dd>
                          {edit && <button onClick={edit} className="text-xs font-semibold text-emerald-600 hover:underline">Edit</button>}
                        </div>
                      ))}
                    </dl>
                    {service.price_unit !== 'fixed' && <p className="mt-3 text-xs text-navy-400">The final price depends on the work required{service.price_unit === 'per_hour' ? ' and the hours worked' : ''}; {c.name} will confirm it with you.</p>}
                    <div className="mt-8 flex justify-between">
                      <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(2)}>Back</Button>
                      <Button size="lg" loading={submitting} onClick={submit}>Send booking request</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="space-y-6">
          {service && !result && (
            <div className="card p-5">
              <p className="text-xs font-semibold tracking-wide text-navy-400 uppercase">Your selection</p>
              <p className="mt-2 font-semibold">{service.name}</p>
              <p className="text-sm text-navy-500">{priceLabel(service, c.currency)} · {duration(service.duration_min)}</p>
              {date && <p className="mt-2 flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-emerald-500" />{fmtDateLong(date)}{time && `, ${time}`}</p>}
            </div>
          )}
          <div className="card p-5">
            <p className="font-semibold">{c.name}</p>
            <div className="mt-3 space-y-2 text-sm text-navy-500">
              {(c.address || c.city) && <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-navy-300" />{[c.address, c.city].filter(Boolean).join(', ')}</p>}
              {c.phone && <p className="flex gap-2"><Phone className="size-4 shrink-0 text-navy-300" /><a href={`tel:${c.phone}`} className="hover:text-navy-900">{c.phone}</a></p>}
              {c.email && <p className="flex gap-2"><Mail className="size-4 shrink-0 text-navy-300" /><a href={`mailto:${c.email}`} className="break-all hover:text-navy-900">{c.email}</a></p>}
            </div>
            <p className="mt-5 text-xs font-semibold tracking-wide text-navy-400 uppercase">Opening hours</p>
            <dl className="mt-2 space-y-1 text-sm">
              {hours.map(([d, h]) => <div key={d} className="flex justify-between"><dt className="text-navy-500">{d}</dt><dd className={h.closed ? 'text-navy-300' : 'font-medium'}>{h.closed ? 'Closed' : `${h.open} – ${h.close}`}</dd></div>)}
            </dl>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-navy-400">Powered by <a href="/" className="inline-flex"><Logo size="size-5" className="scale-90" /></a></p>
        </aside>
      </div>
      {info.assistant && <ChatLauncher slug={slug} assistantName={info.assistant.name} welcome={info.assistant.welcome} onBook={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); if (!result) setStep(service ? 1 : 0); }} />}
    </div>
  );
}
