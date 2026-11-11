import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, UserCog, Mail, Phone, CalendarCheck, CheckCircle2, KeyRound } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import {
  Button, Card, Modal, Input, Select, Textarea, Toggle, EmptyState, ErrorState, Skeleton, PageHeader, Avatar, Badge, UpgradeNotice, useForm,
} from '../../components/ui.jsx';

const DAYS = [['mon', 'Maandag'], ['tue', 'Dinsdag'], ['wed', 'Woensdag'], ['thu', 'Donderdag'], ['fri', 'Vrijdag'], ['sat', 'Zaterdag'], ['sun', 'Zondag']];
const DEFAULT_SCHEDULE = Object.fromEntries(DAYS.map(([d]) => [d, { start: '08:00', end: '17:00', off: ['sat', 'sun'].includes(d) }]));
const COLORS = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#ef4444'];
export const EMP_STATUS = { active: ['Actief', 'emerald'], on_leave: ['Met verlof', 'amber'], inactive: ['Inactief', 'navy'] };

export function ScheduleEditor({ value, onChange }) {
  const set = (d, k, v) => onChange({ ...value, [d]: { ...value[d], [k]: v } });
  return (
    <div className="divide-y divide-navy-100 rounded-2xl border border-navy-100">
      {DAYS.map(([d, label]) => (
        <div key={d} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <span className="w-24 text-sm font-medium">{label}</span>
          <Toggle checked={!value[d].off} onChange={(on) => set(d, 'off', !on)} />
          {value[d].off ? <span className="text-sm text-navy-300">Vrij</span> : (
            <div className="flex items-center gap-2">
              <input type="time" className="input w-28 py-1.5" value={value[d].start} onChange={(e) => set(d, 'start', e.target.value)} aria-label={`${label} begin`} />
              <span className="text-navy-300">–</span>
              <input type="time" className="input w-28 py-1.5" value={value[d].end} onChange={(e) => set(d, 'end', e.target.value)} aria-label={`${label} eind`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function EmployeeForm({ open, onClose, initial, onSaved }) {
  const toast = useToast();
  const f = useForm({});
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    f.setValues({ name: initial?.name || '', email: initial?.email || '', phone: initial?.phone || '', job_title: initial?.job_title || 'Schoonmaker',
      color: initial?.color || COLORS[Math.floor(Math.random() * COLORS.length)], status: initial?.status || 'active', notes: initial?.notes || '' });
    setSchedule(initial?.work_schedule || DEFAULT_SCHEDULE);
    f.setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setSaving(true);
    try {
      const body = { ...f.values, email: f.values.email || null, phone: f.values.phone || null, notes: f.values.notes || null, work_schedule: schedule };
      const d = initial?.id ? await api.patch(`/employees/${initial.id}`, body) : await api.post('/employees', body);
      toast.success(initial?.id ? 'Medewerker bijgewerkt' : 'Medewerker toegevoegd');
      onSaved(d.employee);
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Medewerker wijzigen' : 'Medewerker toevoegen'} size="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Annuleren</Button><Button onClick={submit} loading={saving}>{initial?.id ? 'Wijzigingen opslaan' : 'Medewerker toevoegen'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Volledige naam" value={f.values.name || ''} onChange={f.set('name')} error={f.errors.name} />
        <Input label="Functie" value={f.values.job_title || ''} onChange={f.set('job_title')} error={f.errors.job_title} placeholder="bijv. Schoonmaker, Teamleider" />
        <Input label="E-mailadres" type="email" value={f.values.email || ''} onChange={f.set('email')} error={f.errors.email} />
        <Input label="Telefoonnummer" value={f.values.phone || ''} onChange={f.set('phone')} error={f.errors.phone} />
        <Select label="Beschikbaarheid" value={f.values.status || 'active'} onChange={f.set('status')} hint={f.values.status !== 'active' && initial?.status === 'active' ? 'Toekomstige klussen worden losgekoppeld, zodat je ze aan iemand anders kunt toewijzen.' : undefined}>
          <option value="active">Actief</option><option value="on_leave">Met verlof</option><option value="inactive">Inactief</option>
        </Select>
        <div><span className="label">Kleur in de planning</span>
          <div className="flex flex-wrap gap-2">{COLORS.map((c) => (
            <button key={c} type="button" onClick={() => f.set('color')(c)} className="size-8 rounded-full ring-offset-2 transition" style={{ background: c, boxShadow: f.values.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }} aria-label={`Kleur ${c}`} />
          ))}</div>
        </div>
        <div className="sm:col-span-2"><span className="label">Werkrooster</span><ScheduleEditor value={schedule} onChange={setSchedule} />
          {Object.keys(f.errors).some((k) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(k)) && <p className="mt-1.5 text-xs font-medium text-red-600">Controleer het rooster: de eindtijd moet na de begintijd liggen.</p>}
        </div>
        <Textarea label="Interne notities" className="sm:col-span-2" value={f.values.notes || ''} onChange={f.set('notes')} rows={2} />
      </div>
    </Modal>
  );
}

export default function Employees() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const res = useApi(can('employees') ? '/employees' : null);
  if (!can('employees')) return <><PageHeader title="Medewerkers" /><UpgradeNotice feature="Personeelsbeheer" /></>;
  const list = res.data?.employees || [];
  return (
    <div>
      <PageHeader title="Medewerkers" description="Je team, hun roosters en hun klussen."
        actions={<><Button variant="secondary" icon={KeyRound} to="/app/settings?tab=team">Inloggen & rechten</Button><Button icon={Plus} onClick={() => setParams({ new: '1' })}>Medewerker toevoegen</Button></>} />
      {res.loading && !res.data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
        : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
          : list.length === 0 ? <Card><EmptyState icon={UserCog} title="Nog geen medewerkers" description="Voeg je team toe om klussen in te plannen en toe te wijzen." action={<Button size="sm" icon={Plus} onClick={() => setParams({ new: '1' })}>Medewerker toevoegen</Button>} /></Card>
            : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((e) => (
                  <Link key={e.id} to={`/app/employees/${e.id}`} className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-soft">
                    <div className="flex items-start gap-3">
                      <Avatar name={e.name} color={e.color} size="size-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold group-hover:text-emerald-700">{e.name}</p>
                        <p className="text-sm text-navy-400">{e.job_title}</p>
                      </div>
                      <Badge color={e.current_booking_id ? 'violet' : EMP_STATUS[e.status][1]}>{e.current_booking_id ? 'Aan het werk' : EMP_STATUS[e.status][0]}</Badge>
                    </div>
                    <div className="mt-4 space-y-1.5 text-xs text-navy-500">
                      <p className="flex items-center gap-2"><Mail className="size-3.5 text-navy-300" />{e.email || '—'}</p>
                      <p className="flex items-center gap-2"><Phone className="size-3.5 text-navy-300" />{e.phone || '—'}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-navy-100 pt-4 text-center">
                      <div><p className="text-lg font-bold">{e.jobs_today}</p><p className="text-[11px] text-navy-400">Vandaag</p></div>
                      <div><p className="flex items-center justify-center gap-1 text-lg font-bold"><CalendarCheck className="size-3.5 text-sky-500" />{e.upcoming_jobs}</p><p className="text-[11px] text-navy-400">Komend</p></div>
                      <div><p className="flex items-center justify-center gap-1 text-lg font-bold"><CheckCircle2 className="size-3.5 text-emerald-500" />{e.completed_jobs}</p><p className="text-[11px] text-navy-400">Voltooid</p></div>
                    </div>
                    <p className="mt-3 text-xs text-navy-400">{e.user_id ? `Login: ${{ owner: 'eigenaar', manager: 'manager', employee: 'medewerker' }[e.user_role]} (${{ active: 'actief', invited: 'uitgenodigd', disabled: 'geblokkeerd' }[e.user_status]})` : 'Geen inlogaccount'}</p>
                  </Link>
                ))}
              </div>
            )}
      <EmployeeForm open={params.get('new') === '1'} onClose={() => setParams({})} onSaved={() => { setParams({}); res.reload(true); }} />
    </div>
  );
}
