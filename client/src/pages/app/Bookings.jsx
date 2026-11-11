import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, CalendarCheck, Clock, MapPin, Phone, Mail, User, Check, X, Play, CheckCircle2, CalendarClock, UserPlus, Euro, Trash2,
  StickyNote, Ban, Filter,
} from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import {
  money, fmtDate, fmtDateLong, fmtTime, duration, todayLocal, timeAgo,
} from '../../lib/format.js';
import {
  Button, Card, Drawer, Modal, Input, Select, Textarea, Toggle, StatusBadge, Avatar, Badge, EmptyState, ErrorState, Skeleton, PageHeader, Tabs,
  ConfirmDialog, cx, useForm, Spinner,
} from '../../components/ui.jsx';

const METHOD_LABEL = { card: 'Pin/kaart', bank_transfer: 'Overboeking', cash: 'Contant', other: 'Anders' };

const EMPTY_TITLE = { active: 'Geen komende boekingen', pending: 'Geen openstaande aanvragen', confirmed: 'Geen bevestigde boekingen', in_progress: 'Geen klussen die bezig zijn', completed: 'Geen voltooide boekingen', cancelled: 'Geen geannuleerde boekingen', all: 'Nog geen boekingen' };

const TABS = [
  { value: 'active', label: 'Komend' }, { value: 'pending', label: 'In afwachting' }, { value: 'confirmed', label: 'Bevestigd' },
  { value: 'in_progress', label: 'Bezig' }, { value: 'completed', label: 'Voltooid' }, { value: 'cancelled', label: 'Geannuleerd' }, { value: 'all', label: 'Alles' },
];

function SlotPicker({ serviceId, date, value, onChange, excludeHint }) {
  const [slots, setSlots] = useState(null);
  useEffect(() => {
    if (!serviceId || !date) { setSlots(null); return; }
    setSlots(undefined);
    api.get(`/bookings/availability${qs({ service_id: serviceId, date })}`).then((d) => setSlots(d.slots)).catch(() => setSlots([]));
  }, [serviceId, date]);
  if (!serviceId || !date) return <p className="text-sm text-navy-400">Kies een dienst en datum om vrije tijden te zien.</p>;
  if (slots === undefined) return <Spinner className="size-5" />;
  if (!slots?.length) return <p className="text-sm text-navy-400">Geen vrije tijden op deze dag binnen de openingstijden. {excludeHint}</p>;
  return (
    <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6 scrollbar-thin">
      {slots.map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)} className={cx('rounded-lg border py-1.5 text-xs font-semibold transition', value === t ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-navy-200 hover:border-emerald-400 hover:bg-emerald-50')}>{t}</button>
      ))}
    </div>
  );
}

function NewBookingModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const { can } = useAuth();
  const services = useApi(open ? '/services' : null);
  const employees = useApi(open && can('employees') ? '/employees' : null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [mode, setMode] = useState('existing');
  const [customTime, setCustomTime] = useState(false);
  const f = useForm({ customer_id: '', name: '', email: '', phone: '', service_id: '', date: todayLocal(), time: '', address: '', instructions: '', employee_id: '', status: 'confirmed' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || mode !== 'existing') return undefined;
    const t = setTimeout(() => api.get(`/customers${qs({ q: customerQuery, sort: 'recent' })}`).then((d) => setCustomers(d.customers.slice(0, 50))).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [customerQuery, open, mode]);

  const pickCustomer = (id) => {
    const c = customers.find((x) => String(x.id) === String(id));
    f.setValues((v) => ({ ...v, customer_id: id, address: c ? [c.address, c.city].filter(Boolean).join(', ') : v.address }));
  };

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const body = {
        service_id: Number(f.values.service_id), date: f.values.date, time: f.values.time, address: f.values.address,
        instructions: f.values.instructions || null, employee_id: f.values.employee_id ? Number(f.values.employee_id) : null,
        status: f.values.status, allow_outside_hours: customTime,
        ...(mode === 'existing' ? { customer_id: Number(f.values.customer_id) || undefined } : { new_customer: { name: f.values.name, email: f.values.email, phone: f.values.phone } }),
      };
      const d = await api.post('/bookings', body);
      toast.success(`Boeking ${d.booking.reference} aangemaakt`);
      onCreated(d.booking);
    } catch (err) { setError(err.message); f.applyServerError(err); } finally { setSaving(false); }
  };

  const activeServices = services.data?.services.filter((s) => s.active) || [];
  const svc = activeServices.find((s) => String(s.id) === String(f.values.service_id));

  return (
    <Modal open={open} onClose={onClose} title="Nieuwe boeking" description="Voeg zelf een boeking toe, bijvoorbeeld een telefonische afspraak." size="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Annuleren</Button><Button onClick={submit} loading={saving}>Boeking aanmaken</Button></>}>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="label mb-0">Klant</span>
            <button type="button" className="text-xs font-semibold text-emerald-600 hover:underline" onClick={() => setMode(mode === 'existing' ? 'new' : 'existing')}>{mode === 'existing' ? '+ Nieuwe klant' : 'Bestaande klant kiezen'}</button>
          </div>
          {mode === 'existing' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Klanten zoeken…" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} aria-label="Klanten zoeken" />
              <Select value={f.values.customer_id} onChange={(e) => pickCustomer(e.target.value)} error={f.errors.customer_id} aria-label="Klant">
                <option value="">Kies een klant…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>)}
              </Select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="Volledige naam" value={f.values.name} onChange={f.set('name')} error={f.errors.name} aria-label="Naam" />
              <Input placeholder="E-mailadres" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} aria-label="E-mailadres" />
              <Input placeholder="Telefoonnummer" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} aria-label="Telefoonnummer" />
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Dienst" value={f.values.service_id} onChange={(e) => { f.set('service_id')(e); f.setValues((v) => ({ ...v, time: '' })); }} error={f.errors.service_id}>
            <option value="">Kies een dienst…</option>
            {activeServices.map((s) => <option key={s.id} value={s.id}>{s.name} – {duration(s.duration_min)}</option>)}
          </Select>
          <Input label="Datum" type="date" value={f.values.date} min={todayLocal()} onChange={(e) => { f.set('date')(e); f.setValues((v) => ({ ...v, time: '' })); }} error={f.errors.date} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="label mb-0">Tijd {f.values.time && <span className="text-emerald-600">· {f.values.time}{svc ? ` (${duration(svc.duration_min)})` : ''}</span>}</span>
            <Toggle checked={customTime} onChange={(v) => { setCustomTime(v); f.setValues((x) => ({ ...x, time: '' })); }} label="Eigen tijd" />
          </div>
          {customTime ? <Input type="time" value={f.values.time} onChange={f.set('time')} error={f.errors.time} hint="Een eigen tijd mag buiten de openingstijden vallen, maar dubbele boekingen van personeel worden nog steeds voorkomen." aria-label="Tijd" />
            : <SlotPicker serviceId={f.values.service_id} date={f.values.date} value={f.values.time} onChange={(t) => f.setValues((v) => ({ ...v, time: t }))} excludeHint="Kies een eigen tijd om buiten de openingstijden te plannen." />}
        </div>
        <Input label="Adres" value={f.values.address} onChange={f.set('address')} error={f.errors.address} />
        <div className="grid gap-4 sm:grid-cols-2">
          {can('employees') && (
            <Select label="Medewerker toewijzen (optioneel)" value={f.values.employee_id} onChange={f.set('employee_id')}>
              <option value="">Niet toegewezen</option>
              {employees.data?.employees.filter((e) => e.status === 'active').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          )}
          <Select label="Status" value={f.values.status} onChange={f.set('status')}>
            <option value="confirmed">Bevestigd</option><option value="pending">In afwachting</option>
          </Select>
        </div>
        <Textarea label="Bijzonderheden" value={f.values.instructions} onChange={f.set('instructions')} rows={2} />
      </div>
    </Modal>
  );
}

function BookingDrawer({ id, onClose, onChanged }) {
  const { isAdmin, can, company } = useAuth();
  const toast = useToast();
  const res = useApi(id ? `/bookings/${id}` : null, [id]);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const [resched, setResched] = useState(null);
  const [payment, setPayment] = useState(null);
  const [edit, setEdit] = useState(null);
  const [emps, setEmps] = useState(null);
  const b = res.data?.booking;
  const cur = company.currency;

  useEffect(() => {
    if (!b || !isAdmin || !can('employees') || ['completed', 'cancelled'].includes(b.status)) { setEmps(null); return; }
    api.get(`/bookings/${b.id}/employees`).then((d) => setEmps(d.employees)).catch(() => setEmps([]));
  }, [b?.id, b?.starts_at, b?.employee_id, b?.status, isAdmin, can]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key, fn, msg) => {
    setBusy(key);
    try { await fn(); if (msg) toast.success(msg); await res.reload(true); onChanged(); return true; } catch (err) { toast.error(err.message); return false; } finally { setBusy(''); }
  };
  const setStatus = (status, msg, extra = {}) => act(status, () => api.post(`/bookings/${id}/status`, { status, ...extra }), msg);

  if (!id) return null;
  return (
    <Drawer open={!!id} onClose={onClose} title={b ? `Boeking ${b.reference}` : 'Boeking'}
      footer={b && (
        <>
          {b.status === 'pending' && isAdmin && <>
            <Button variant="danger-ghost" icon={X} onClick={() => { setReason(''); setConfirm('reject'); }}>Weigeren</Button>
            <Button icon={Check} loading={busy === 'confirmed'} onClick={() => setStatus('confirmed', 'Boeking geaccepteerd en bevestigd')}>Accepteren</Button>
          </>}
          {b.status === 'confirmed' && <Button variant="secondary" icon={Play} loading={busy === 'in_progress'} onClick={() => setStatus('in_progress', 'Klus gestart')}>Klus starten</Button>}
          {['confirmed', 'in_progress'].includes(b.status) && <Button icon={CheckCircle2} loading={busy === 'completed'} onClick={() => setStatus('completed', 'Klus afgerond')}>Afronden</Button>}
        </>
      )}>
      {res.loading && !b ? <div className="space-y-4 p-5"><Skeleton className="h-6 w-40" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
          : (
            <div className="space-y-6 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={b.status} />
                <Badge>{b.source === 'online' ? 'Online geboekt' : b.source === 'assistant' ? 'Via assistent' : 'Handmatig toegevoegd'}</Badge>
                <span className="text-xs text-navy-400">Aangemaakt {timeAgo(b.created_at)}</span>
              </div>
              {b.status === 'cancelled' && b.cancel_reason && <div className="rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-600"><Ban className="mr-1.5 inline size-4" />Reden: {b.cancel_reason}</div>}

              <section className="rounded-2xl border border-navy-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{b.service_name}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-navy-600"><CalendarCheck className="size-4 text-navy-300" />{fmtDateLong(b.starts_at)}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-navy-600"><Clock className="size-4 text-navy-300" />{fmtTime(b.starts_at)} – {fmtTime(b.ends_at)} ({duration(b.duration_min)})</p>
                    <p className="mt-1 flex items-start gap-2 text-sm text-navy-600"><MapPin className="mt-0.5 size-4 shrink-0 text-navy-300" />{b.address}</p>
                  </div>
                  {isAdmin && b.price_cents !== undefined && <p className="text-lg font-bold">{money(b.price_cents, cur)}</p>}
                </div>
                {isAdmin && !['completed', 'cancelled'].includes(b.status) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-navy-100 pt-4">
                    <Button size="sm" variant="secondary" icon={CalendarClock} onClick={() => setResched({ date: b.starts_at.slice(0, 10), time: '', custom: false })}>Verzetten</Button>
                    <Button size="sm" variant="secondary" icon={StickyNote} onClick={() => setEdit({ address: b.address, instructions: b.instructions || '', price: (b.price_cents / 100).toFixed(2) })}>Gegevens wijzigen</Button>
                    <Button size="sm" variant="danger-ghost" icon={Ban} onClick={() => { setReason(''); setConfirm('cancel'); }}>Boeking annuleren</Button>
                  </div>
                )}
                {isAdmin && b.status === 'completed' && (
                  <div className="mt-4 border-t border-navy-100 pt-4"><Button size="sm" variant="secondary" icon={StickyNote} onClick={() => setEdit({ address: b.address, instructions: b.instructions || '', price: (b.price_cents / 100).toFixed(2) })}>Gegevens wijzigen</Button></div>
                )}
              </section>

              {b.instructions && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Bijzonderheden</h3>
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm whitespace-pre-line text-amber-900">{b.instructions}</p>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Klant</h3>
                <div className="rounded-2xl border border-navy-100 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold"><User className="size-4 text-navy-300" />
                    {isAdmin ? <Link to={`/app/customers/${b.customer_id}`} className="hover:text-emerald-600 hover:underline">{b.customer_name}</Link> : b.customer_name}</p>
                  {b.customer_phone && <p className="mt-1.5 flex items-center gap-2 text-navy-600"><Phone className="size-4 text-navy-300" /><a href={`tel:${b.customer_phone}`} className="hover:underline">{b.customer_phone}</a></p>}
                  {b.customer_email && <p className="mt-1.5 flex items-center gap-2 text-navy-600"><Mail className="size-4 text-navy-300" /><a href={`mailto:${b.customer_email}`} className="hover:underline">{b.customer_email}</a></p>}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Toegewezen medewerker</h3>
                {b.employee_name ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-navy-100 p-3"><Avatar name={b.employee_name} color={b.employee_color} size="size-8" /><span className="flex-1 text-sm font-medium">{b.employee_name}</span>
                    {emps && <Button size="sm" variant="ghost" onClick={() => act('assign', () => api.patch(`/bookings/${id}`, { employee_id: null }), 'Medewerker losgekoppeld')}>Loskoppelen</Button>}
                  </div>
                ) : <p className="text-sm text-navy-400">Nog niemand toegewezen.</p>}
                {emps && (
                  <div className="mt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-400 uppercase"><UserPlus className="size-3.5" />{b.employee_name ? 'Opnieuw toewijzen aan' : 'Toewijzen aan'}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {emps.filter((e) => e.id !== b.employee_id).map((e) => (
                        <button key={e.id} disabled={!e.available || busy === 'assign'} onClick={() => act('assign', () => api.patch(`/bookings/${id}`, { employee_id: e.id }), `${e.name} toegewezen`)}
                          className="flex items-center gap-2.5 rounded-xl border border-navy-100 px-3 py-2 text-left text-sm transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-navy-100 disabled:hover:bg-transparent">
                          <Avatar name={e.name} size="size-6" color="#4a5a7d" /><span className="flex-1 truncate">{e.name}</span>
                          <span className={cx('text-xs', e.available ? 'text-emerald-600' : 'text-navy-400')}>{e.available ? 'Vrij' : e.reason}</span>
                        </button>
                      ))}
                      {emps.length === 0 && <p className="text-sm text-navy-400">Voeg medewerkers toe om klussen toe te wijzen.</p>}
                    </div>
                  </div>
                )}
              </section>

              {isAdmin && (
                <section>
                  <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Betalingen</h3>
                    {b.status !== 'cancelled' && <Button size="sm" variant="ghost" icon={Euro} onClick={() => setPayment({ amount: (Math.max(0, b.price_cents - b.paid_cents) / 100).toFixed(2), method: 'card', note: '' })}>Betaling registreren</Button>}
                  </div>
                  <div className="rounded-2xl border border-navy-100">
                    {res.data.payments.length === 0 ? <p className="p-4 text-sm text-navy-400">Nog geen betalingen geregistreerd.</p> : res.data.payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 border-b border-navy-50 px-4 py-2.5 text-sm last:border-0">
                        <span className="flex-1">{fmtDate(p.paid_at)} · <span>{METHOD_LABEL[p.method]}</span>{p.note && <span className="text-navy-400"> · {p.note}</span>}</span>
                        <span className="font-semibold">{money(p.amount_cents, cur)}</span>
                        <button onClick={() => act('delpay', () => api.del(`/bookings/${id}/payments/${p.id}`), 'Betaling verwijderd')} className="text-navy-300 hover:text-red-600" aria-label="Betaling verwijderen"><Trash2 className="size-4" /></button>
                      </div>
                    ))}
                    <div className="flex justify-between bg-navy-50/60 px-4 py-2.5 text-sm"><span className="text-navy-500">Betaald / prijs</span>
                      <span className={cx('font-semibold', b.paid_cents >= b.price_cents ? 'text-emerald-600' : 'text-amber-600')}>{money(b.paid_cents, cur)} / {money(b.price_cents, cur)}</span></div>
                  </div>
                </section>
              )}
            </div>
          )}

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger loading={busy === 'cancelled'}
        title={confirm === 'reject' ? 'Deze aanvraag weigeren?' : 'Deze boeking annuleren?'}
        message="Het tijdslot komt weer vrij en de klant krijgt bericht (als e-mail is ingesteld)."
        confirmLabel={confirm === 'reject' ? 'Aanvraag weigeren' : 'Boeking annuleren'}
        onConfirm={async () => { if (await setStatus('cancelled', confirm === 'reject' ? 'Aanvraag geweigerd' : 'Boeking geannuleerd', { reason: reason || (confirm === 'reject' ? 'Aanvraag geweigerd' : null) })) setConfirm(null); }}>
        <Textarea className="mt-4" label="Reden (optioneel, wordt gedeeld met de klant)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </ConfirmDialog>

      {resched && b && (
        <Modal open onClose={() => setResched(null)} title="Boeking verzetten" description={`${b.service_name} · nu ${fmtDateLong(b.starts_at)} om ${fmtTime(b.starts_at)}`}
          footer={<><Button variant="secondary" onClick={() => setResched(null)}>Annuleren</Button>
            <Button disabled={!resched.time} loading={busy === 'resched'} onClick={async () => { if (await act('resched', () => api.patch(`/bookings/${id}`, { date: resched.date, time: resched.time, allow_outside_hours: resched.custom }), 'Boeking verzet')) setResched(null); }}>Nieuwe tijd opslaan</Button></>}>
          <div className="space-y-4">
            <Input label="Nieuwe datum" type="date" min={todayLocal()} value={resched.date} onChange={(e) => setResched({ ...resched, date: e.target.value, time: '' })} />
            <div className="flex items-center justify-between"><span className="label mb-0">Nieuwe tijd {resched.time && <span className="text-emerald-600">· {resched.time}</span>}</span>
              <Toggle checked={resched.custom} onChange={(v) => setResched({ ...resched, custom: v, time: '' })} label="Eigen tijd" /></div>
            {resched.custom ? <Input type="time" value={resched.time} onChange={(e) => setResched({ ...resched, time: e.target.value })} aria-label="Tijd" />
              : <SlotPicker serviceId={b.service_id} date={resched.date} value={resched.time} onChange={(t) => setResched({ ...resched, time: t })} />}
            <p className="text-xs text-navy-400">De huidige tijd van deze boeking telt als bezet. Is de toegewezen medewerker op de nieuwe tijd niet vrij, dan krijg je een melding en kun je iemand anders toewijzen.</p>
          </div>
        </Modal>
      )}

      {payment && (
        <Modal open onClose={() => setPayment(null)} title="Betaling registreren" size="max-w-md"
          footer={<><Button variant="secondary" onClick={() => setPayment(null)}>Annuleren</Button>
            <Button loading={busy === 'pay'} onClick={async () => { if (await act('pay', () => api.post(`/bookings/${id}/payments`, { amount: Number(payment.amount), method: payment.method, note: payment.note || null }), 'Betaling geregistreerd')) setPayment(null); }}>Betaling opslaan</Button></>}>
          <div className="space-y-4">
            <Input label={`Bedrag (${cur})`} type="number" step="0.01" min="0" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            <Select label="Betaalwijze" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
              <option value="card">Pin/kaart</option><option value="bank_transfer">Overboeking</option><option value="cash">Contant</option><option value="other">Anders</option>
            </Select>
            <Input label="Notitie (optioneel)" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} />
            <p className="text-xs text-navy-400">Hiermee registreer je een betaling die je hebt ontvangen. CLEANFLOW int zelf geen geld bij klanten.</p>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Boekingsgegevens wijzigen"
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Annuleren</Button>
            <Button loading={busy === 'edit'} onClick={async () => { if (await act('edit', () => api.patch(`/bookings/${id}`, { address: edit.address, instructions: edit.instructions || null, price: Number(edit.price) }), 'Boeking bijgewerkt')) setEdit(null); }}>Opslaan</Button></>}>
          <div className="space-y-4">
            <Input label="Adres" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            <Input label={`Prijs (${cur})`} type="number" min="0" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
            <Textarea label="Bijzonderheden" value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} />
          </div>
        </Modal>
      )}
    </Drawer>
  );
}

export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const { isAdmin, can, user, company } = useAuth();
  const currency = company.currency;
  const status = params.get('status') || 'active';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employee, setEmployee] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const past = ['completed', 'cancelled', 'all'].includes(status);
  const effectiveFrom = from || (status === 'active' || status === 'confirmed' || status === 'pending' ? todayLocal() : '');
  const url = `/bookings${qs({ status: status === 'all' ? '' : status, q: debounced, from: effectiveFrom, to, sort: past ? 'desc' : 'asc',
    employee_id: employee && employee !== 'none' ? employee : '', unassigned: employee === 'none' ? '1' : '' })}`;
  const res = useApi(url);
  const employees = useApi(isAdmin && can('employees') ? '/employees' : null);
  const openId = params.get('open');

  const groups = useMemo(() => {
    const g = new Map();
    for (const b of res.data?.bookings || []) {
      const d = b.starts_at.slice(0, 10);
      if (!g.has(d)) g.set(d, []);
      g.get(d).push(b);
    }
    return [...g.entries()];
  }, [res.data]);

  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: k === 'open' ? false : true }); };
  const counts = res.data?.counts || {};

  return (
    <div>
      <PageHeader title={user.role === 'employee' ? 'Mijn klussen' : 'Boekingen'} description={user.role === 'employee' ? 'Klussen die aan jou zijn toegewezen.' : 'Beheer aanvragen, afspraken en de status van klussen.'}
        actions={isAdmin && <Button icon={Plus} onClick={() => setParam('new', '1')}>Nieuwe boeking</Button>} />
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={status} onChange={(v) => setParam('status', v === 'active' ? '' : v)}
            tabs={TABS.map((t) => ({ ...t, count: isAdmin && t.value === 'pending' ? counts.pending || 0 : undefined }))} />
        </div>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-navy-300" />
            <input className="input pl-10" placeholder="Zoek op klant, referentie, adres of dienst…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Boekingen zoeken" />
          </div>
          <Button variant="secondary" icon={Filter} onClick={() => setShowFilters(!showFilters)}>Filters{(from || to || employee) ? ' •' : ''}</Button>
        </div>
        {showFilters && (
          <div className="grid animate-fade-in gap-3 border-b border-navy-100 bg-navy-50/40 p-4 sm:grid-cols-4">
            <Input label="Van" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Tot en met" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            {isAdmin && can('employees') && (
              <Select label="Medewerker" value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="">Iedereen</option><option value="none">Niet toegewezen</option>
                {employees.data?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            )}
            <div className="flex items-end"><Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setEmployee(''); }}>Filters wissen</Button></div>
          </div>
        )}
        {res.loading && !res.data ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
            : groups.length === 0 ? (
              <EmptyState icon={CalendarCheck} title={debounced || from || to || employee ? 'Geen boekingen gevonden met deze filters' : EMPTY_TITLE[status]}
                description={isAdmin ? 'Boekingen via je online boekingspagina en boekingen die je zelf toevoegt, verschijnen hier.' : 'Klussen die aan jou worden toegewezen, verschijnen hier.'}
                action={isAdmin && <Button size="sm" icon={Plus} onClick={() => setParam('new', '1')}>Nieuwe boeking</Button>} />
            ) : (
              <div className={cx('transition-opacity', res.loading && 'opacity-60')}>
                {groups.map(([date, items]) => (
                  <div key={date}>
                    <div className="sticky top-16 z-10 border-b border-navy-100 bg-navy-50/90 px-5 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase backdrop-blur">
                      {fmtDateLong(date)}{date === todayLocal() && <span className="ml-2 text-emerald-600">Vandaag</span>}
                    </div>
                    <ul className="divide-y divide-navy-100">
                      {items.map((b) => (
                        <li key={b.id}>
                          <button onClick={() => setParam('open', String(b.id))} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-navy-50/60">
                            <div className="w-20 shrink-0 text-sm"><p className="font-semibold">{fmtTime(b.starts_at)}</p><p className="text-xs text-navy-400">{duration(b.duration_min)}</p></div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{b.customer_name} <span className="font-normal text-navy-400">· {b.service_name}</span></p>
                              <p className="truncate text-xs text-navy-400">{b.reference} · {b.address}</p>
                            </div>
                            <div className="hidden w-36 items-center gap-2 md:flex">
                              {b.employee_name ? <><Avatar name={b.employee_name} color={b.employee_color} size="size-6" /><span className="truncate text-xs text-navy-600">{b.employee_name}</span></> : <Badge color="amber">Niet toegewezen</Badge>}
                            </div>
                            {isAdmin && <span className="hidden w-20 text-right text-sm font-medium sm:block">{money(b.price_cents, currency)}</span>}
                            <StatusBadge status={b.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {res.data.bookings.length >= 200 && <p className="p-4 text-center text-xs text-navy-400">De eerste 200 resultaten worden getoond. Kies een kortere periode om meer te zien.</p>}
              </div>
            )}
      </Card>
      <NewBookingModal open={params.get('new') === '1'} onClose={() => setParam('new', '')} onCreated={(b) => { const p = new URLSearchParams(params); p.delete('new'); p.set('open', b.id); setParams(p); res.reload(true); }} />
      <BookingDrawer id={openId} onClose={() => setParam('open', '')} onChanged={() => res.reload(true)} />
    </div>
  );
}
