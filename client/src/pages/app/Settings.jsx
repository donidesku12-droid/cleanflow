import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2, Clock, Bell, Users, UserCircle, CreditCard, Upload, Trash2, Mail, MessageSquare, Check, Copy, UserPlus, Send, ShieldCheck, AlertTriangle, LogOut, Sparkles, Bot, Lock,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { timeAgo } from '../../lib/format.js';
import { PLANS } from '../../lib/plans.js';
import {
  Button, Card, CardHeader, Input, Select, Toggle, Modal, Tabs, EmptyState, ErrorState, PageLoader, PageHeader, Badge, ConfirmDialog, Avatar, cx, useForm,
} from '../../components/ui.jsx';

const DAYS = [['mon', 'Maandag'], ['tue', 'Dinsdag'], ['wed', 'Woensdag'], ['thu', 'Donderdag'], ['fri', 'Vrijdag'], ['sat', 'Zaterdag'], ['sun', 'Zondag']];
const ROLE_NL = { owner: 'Eigenaar', manager: 'Manager', employee: 'Medewerker' };
const NOTIF_LABEL = {
  booking_new: 'Nieuwe boekingsaanvragen', booking_confirmed: 'Bevestigde boekingen', booking_cancelled: 'Geannuleerde boekingen',
  booking_reminder: 'Herinneringen voor komende afspraken', employee_assigned: 'Nieuwe klus voor medewerker', job_completed: 'Afgeronde klussen',
  chat_escalated: 'Doorgestuurde chats van de AI-assistent',
};
const TIMEZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['Europe/Amsterdam']; } })();

function CompanyTab({ company, reload }) {
  const toast = useToast();
  const { can, user, refresh } = useAuth();
  const f = useForm(company);
  const [saving, setSaving] = useState(false);
  const fields = ['name', 'email', 'phone', 'website', 'address', 'city', 'postal_code', 'country', 'currency', 'timezone'];
  const save = async () => {
    setSaving(true);
    try { await api.patch('/settings/company', Object.fromEntries(fields.map((k) => [k, f.values[k] ?? null]))); toast.success('Bedrijfsgegevens opgeslagen'); reload(); refresh(); }
    catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  const uploadLogo = (file) => {
    if (!file) return;
    if (file.size > 300 * 1024) return toast.error('Het logo moet kleiner zijn dan 300 KB');
    const reader = new FileReader();
    reader.onload = async () => {
      try { await api.put('/settings/company/logo', { dataUrl: reader.result }); toast.success('Logo bijgewerkt'); reload(); refresh(); } catch (err) { toast.error(err.message); }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Bedrijfsgegevens" description="Staan op je boekingspagina en worden gebruikt door je AI-assistent." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Input label="Bedrijfsnaam" value={f.values.name || ''} onChange={f.set('name')} error={f.errors.name} className="sm:col-span-2" />
          <Input label="Contact-e-mailadres" type="email" value={f.values.email || ''} onChange={f.set('email')} error={f.errors.email} hint="Nieuwe boekingsaanvragen worden hierheen gestuurd." />
          <Input label="Telefoonnummer" value={f.values.phone || ''} onChange={f.set('phone')} error={f.errors.phone} />
          <Input label="Website" value={f.values.website || ''} onChange={f.set('website')} error={f.errors.website} className="sm:col-span-2" />
          <Input label="Bedrijfsadres" value={f.values.address || ''} onChange={f.set('address')} error={f.errors.address} className="sm:col-span-2" />
          <Input label="Postcode" value={f.values.postal_code || ''} onChange={f.set('postal_code')} error={f.errors.postal_code} />
          <Input label="Plaats" value={f.values.city || ''} onChange={f.set('city')} error={f.errors.city} />
          <Input label="Land" value={f.values.country || ''} onChange={f.set('country')} error={f.errors.country} />
          <Select label="Valuta" value={f.values.currency} onChange={f.set('currency')}>{['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN'].map((c) => <option key={c}>{c}</option>)}</Select>
          <Select label="Tijdzone" value={f.values.timezone} onChange={f.set('timezone')} error={f.errors.timezone} className="sm:col-span-2">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select>
          <div className="flex justify-end sm:col-span-2"><Button onClick={save} loading={saving}>Wijzigingen opslaan</Button></div>
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Bedrijfslogo" description="Staat op je boekingspagina." />
        <div className="p-5">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-navy-200 bg-navy-50">
            {company.logo_data_url ? <img src={company.logo_data_url} alt="Bedrijfslogo" className="size-full object-contain" /> : <Building2 className="size-8 text-navy-300" />}
          </div>
          {can('custom_branding') && user.role === 'owner' ? (
            <div className="mt-4 flex gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-navy-200 px-3 text-xs font-semibold text-navy-700 hover:bg-navy-50">
                <Upload className="size-4" />Uploaden<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadLogo(e.target.files[0])} />
              </label>
              {company.logo_data_url && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={async () => { await api.put('/settings/company/logo', { dataUrl: null }); reload(); refresh(); }}>Verwijderen</Button>}
            </div>
          ) : <p className="mt-4 flex items-center gap-1.5 text-xs text-navy-400"><Lock className="size-3.5" />{user.role !== 'owner' ? 'Alleen de eigenaar kan het logo wijzigen.' : 'Een eigen logo zit in het Business-abonnement.'}</p>}
          <p className="mt-2 text-xs text-navy-400">PNG, JPEG of WebP, maximaal 300 KB.</p>
        </div>
      </Card>
    </div>
  );
}

function HoursTab({ company, reload }) {
  const toast = useToast();
  const [hours, setHours] = useState(company.opening_hours);
  const [booking, setBooking] = useState({ slot_interval_min: company.slot_interval_min, min_notice_hours: company.min_notice_hours, booking_horizon_days: company.booking_horizon_days, booking_enabled: !!company.booking_enabled });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (d, k, v) => setHours({ ...hours, [d]: { ...hours[d], [k]: v } });
  const save = async () => {
    setSaving(true); setError('');
    try { await api.patch('/settings/company', { opening_hours: hours, ...booking, slot_interval_min: Number(booking.slot_interval_min), min_notice_hours: Number(booking.min_notice_hours), booking_horizon_days: Number(booking.booking_horizon_days) }); toast.success('Openingstijden & boekingsregels opgeslagen'); reload(); }
    catch (err) { setError(err.message); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Openingstijden" description="Online boeken kan alleen binnen deze tijden." />
        <div className="divide-y divide-navy-100">
          {DAYS.map(([d, label]) => (
            <div key={d} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-24 text-sm font-medium">{label}</span>
              <Toggle checked={!hours[d].closed} onChange={(open) => set(d, 'closed', !open)} />
              {hours[d].closed ? <span className="text-sm text-navy-300">Gesloten</span> : (
                <div className="flex items-center gap-2">
                  <input type="time" className="input w-28 py-1.5" value={hours[d].open} onChange={(e) => set(d, 'open', e.target.value)} aria-label={`${label} open`} />
                  <span className="text-navy-300">–</span>
                  <input type="time" className="input w-28 py-1.5" value={hours[d].close} onChange={(e) => set(d, 'close', e.target.value)} aria-label={`${label} dicht`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Regels voor online boeken" />
        <div className="space-y-4 p-5">
          <Toggle checked={booking.booking_enabled} onChange={(v) => setBooking({ ...booking, booking_enabled: v })} label="Online boekingen aannemen" description="Staat dit uit, dan toont je boekingspagina alleen je contactgegevens." />
          <Select label="Tijd tussen tijdsloten" value={booking.slot_interval_min} onChange={(e) => setBooking({ ...booking, slot_interval_min: e.target.value })}>
            <option value={15}>Elke 15 minuten</option><option value={30}>Elke 30 minuten</option><option value={60}>Elk uur</option>
          </Select>
          <Input label="Minimale boektijd vooraf (uren)" type="number" min="0" max="168" value={booking.min_notice_hours} onChange={(e) => setBooking({ ...booking, min_notice_hours: e.target.value })} hint="Hoeveel uur van tevoren klanten minimaal moeten boeken." />
          <Input label="Vooruit boeken (dagen)" type="number" min="7" max="365" value={booking.booking_horizon_days} onChange={(e) => setBooking({ ...booking, booking_horizon_days: e.target.value })} hint="Hoe ver vooruit klanten kunnen boeken." />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end"><Button onClick={save} loading={saving}>Opslaan</Button></div>
        </div>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const res = useApi('/settings/notifications');
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (res.data) setRows(res.data.settings.map((s) => ({ ...s, in_app: !!s.in_app, email: !!s.email, sms: !!s.sms }))); }, [res.data]);
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const d = res.data;
  const save = async () => {
    setSaving(true);
    try { await api.put('/settings/notifications', { settings: rows.map(({ type, in_app, email, sms }) => ({ type, in_app, email, sms })) }); toast.success('Voorkeuren voor meldingen opgeslagen'); res.reload(true); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {[[Mail, 'E-mail', d.providers.email, 'SMTP is ingesteld. E-mails gaan naar klanten, medewerkers en je bedrijfsinbox.', 'Niet ingesteld. Stel SMTP_HOST (en inloggegevens) in op de server om e-mails te versturen. Tot die tijd worden berichten hieronder gelogd en niet verstuurd.'],
          [MessageSquare, 'Sms', d.providers.sms, 'Twilio is ingesteld.', 'Niet ingesteld (optioneel). Stel TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en TWILIO_FROM in om sms te versturen.']].map(([Icon, title, ok, yes, no]) => (
          <Card key={title} className="flex gap-4 p-5">
            <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', ok ? 'bg-emerald-50 text-emerald-600' : 'bg-navy-50 text-navy-400')}><Icon className="size-5" /></span>
            <div><p className="flex items-center gap-2 font-semibold">{title}<Badge color={ok ? 'emerald' : 'navy'}>{ok ? 'Gekoppeld' : 'Niet gekoppeld'}</Badge></p><p className="mt-1 text-sm text-navy-500">{ok ? yes : no}</p></div>
          </Card>
        ))}
      </div>
      {!d.automated && <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Sparkles className="size-5" />Automatische e-mail- en sms-meldingen zitten in het Professional-abonnement. Meldingen in de app werken bij elk abonnement.</div>}
      <Card>
        <CardHeader title="Voorkeuren voor meldingen" description="Kies per gebeurtenis hoe je een melding krijgt." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead className="border-b border-navy-100"><tr><th className="table-th">Gebeurtenis</th><th className="table-th text-center">In de app</th><th className="table-th text-center">E-mail</th><th className="table-th text-center">Sms</th></tr></thead>
            <tbody className="divide-y divide-navy-50">
              {rows?.map((r, i) => (
                <tr key={r.type}><td className="table-td font-medium">{NOTIF_LABEL[r.type] || r.label}</td>
                  {['in_app', 'email', 'sms'].map((k) => <td key={k} className="table-td"><div className="flex justify-center"><Toggle checked={r[k]} onChange={(v) => set(i, k, v)} disabled={k !== 'in_app' && !d.automated} /></div></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-navy-100 p-4"><Button onClick={save} loading={saving}>Voorkeuren opslaan</Button></div>
      </Card>
      <Card>
        <CardHeader title="Verzendlog" description="De laatste 50 e-mails en sms'jes." />
        {d.outbox.length === 0 ? <EmptyState icon={Send} title="Nog geen berichten" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-navy-100"><tr><th className="table-th">Wanneer</th><th className="table-th">Kanaal</th><th className="table-th">Ontvanger</th><th className="table-th">Onderwerp</th><th className="table-th">Status</th></tr></thead>
              <tbody className="divide-y divide-navy-50">
                {d.outbox.map((m) => (
                  <tr key={m.id}><td className="table-td text-xs text-navy-400">{timeAgo(m.created_at)}</td><td className="table-td uppercase text-xs">{m.channel}</td><td className="table-td">{m.recipient}</td><td className="table-td max-w-xs truncate">{m.subject || '—'}</td>
                    <td className="table-td"><Badge color={m.status === 'sent' ? 'emerald' : m.status === 'failed' ? 'red' : 'navy'}>{{ not_configured: 'Niet verstuurd – niet ingesteld', sent: 'Verstuurd', failed: 'Mislukt' }[m.status] || m.status}</Badge></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function TeamTab() {
  const res = useApi('/settings/team');
  const { user } = useAuth();
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const d = res.data;
  const isOwner = user.role === 'owner';

  const sendInvite = async () => {
    setSaving(true);
    try {
      const r = await api.post('/settings/team/invite', { name: invite.name, email: invite.email, role: invite.role, employee_id: invite.employee_id ? Number(invite.employee_id) : null });
      setInvite(null); setInviteResult(r.invite); res.reload(true);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const update = async (u, body, msg) => {
    try { await api.patch(`/settings/team/${u.id}`, body); toast.success(msg); res.reload(true); } catch (err) { toast.error(err.message); }
  };
  const resend = async (u) => {
    try { const r = await api.post(`/settings/team/${u.id}/resend-invite`); setInviteResult(r.invite); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[['Eigenaar', 'Volledige toegang, inclusief abonnement, rechten en bedrijfsinstellingen.', ShieldCheck],
          ['Manager', 'Beheert boekingen, klanten, medewerkers, diensten, analyses en de AI-assistent. Geen toegang tot het abonnement of tot rollen.', Users],
          ['Medewerker', 'Ziet alleen de eigen klussen en kan die starten en afronden. Geen toegang tot financiële gegevens of de klantenlijst.', UserCircle]].map(([r, t, Icon]) => (
          <Card key={r} className="p-5"><Icon className="size-5 text-emerald-500" /><p className="mt-2 font-semibold">{r}</p><p className="mt-1 text-sm text-navy-500">{t}</p></Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Inlogaccounts van je team" description={`${d.users.filter((u) => u.status !== 'disabled').length} van ${d.limit} accounts in je abonnement`}
          action={<Button size="sm" icon={UserPlus} onClick={() => setInvite({ name: '', email: '', role: 'employee', employee_id: '' })}>Uitnodigen</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-navy-100"><tr><th className="table-th">Gebruiker</th><th className="table-th">Rol</th><th className="table-th">Status</th><th className="table-th">Laatst ingelogd</th><th className="table-th" /></tr></thead>
            <tbody className="divide-y divide-navy-50">
              {d.users.map((u) => (
                <tr key={u.id}>
                  <td className="table-td"><div className="flex items-center gap-3"><Avatar name={u.name} size="size-8" color="#344363" /><div><p className="font-semibold text-navy-900">{u.name}{u.id === user.id && <span className="ml-1 text-xs font-normal text-navy-400">(jij)</span>}</p><p className="text-xs text-navy-400">{u.email}</p></div></div></td>
                  <td className="table-td">{isOwner && u.role !== 'owner' ? (
                    <select className="input w-32 py-1.5" value={u.role} onChange={(e) => update(u, { role: e.target.value }, 'Rol aangepast')} aria-label={`Rol van ${u.name}`}>
                      <option value="manager">Manager</option><option value="employee">Medewerker</option>
                    </select>) : <span>{ROLE_NL[u.role]}</span>}</td>
                  <td className="table-td"><Badge color={u.status === 'active' ? 'emerald' : u.status === 'invited' ? 'amber' : 'navy'}>{{ active: 'Actief', invited: 'Uitgenodigd', disabled: 'Geblokkeerd' }[u.status]}</Badge></td>
                  <td className="table-td text-xs text-navy-400">{u.last_login_at ? timeAgo(u.last_login_at) : 'Nooit'}</td>
                  <td className="table-td text-right">
                    {u.role !== 'owner' && (
                      <div className="flex justify-end gap-1">
                        {u.status === 'invited' && <Button size="sm" variant="ghost" onClick={() => resend(u)}>Nieuwe link</Button>}
                        {isOwner && u.status === 'active' && <Button size="sm" variant="ghost" onClick={() => update(u, { status: 'disabled' }, 'Toegang geblokkeerd')}>Blokkeren</Button>}
                        {isOwner && u.status === 'disabled' && <Button size="sm" variant="ghost" onClick={() => update(u, { status: 'active' }, 'Toegang hersteld')}>Deblokkeren</Button>}
                        {isOwner && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setRemoving(u)} aria-label={`${u.name} verwijderen`} />}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Teamlid uitnodigen" description="Diegene kiest zelf een wachtwoord via een beveiligde link."
        footer={<><Button variant="secondary" onClick={() => setInvite(null)}>Annuleren</Button><Button onClick={sendInvite} loading={saving}>Uitnodiging maken</Button></>}>
        {invite && (
          <div className="space-y-4">
            <Select label="Rol" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="employee">Medewerker</option>{isOwner && <option value="manager">Manager</option>}
            </Select>
            {invite.role === 'employee' && d.employeesWithoutLogin.length > 0 && (
              <Select label="Koppelen aan bestaande medewerker" value={invite.employee_id} onChange={(e) => {
                const emp = d.employeesWithoutLogin.find((x) => String(x.id) === e.target.value);
                setInvite({ ...invite, employee_id: e.target.value, name: emp?.name || invite.name, email: emp?.email || invite.email });
              }}>
                <option value="">Nieuwe medewerker aanmaken</option>{d.employeesWithoutLogin.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            )}
            <Input label="Volledige naam" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            <Input label="E-mailadres" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
        )}
      </Modal>
      <Modal open={!!inviteResult} onClose={() => setInviteResult(null)} title="Uitnodiging gemaakt" footer={<Button onClick={() => setInviteResult(null)}>Klaar</Button>}>
        {inviteResult && (
          <div className="space-y-3 text-sm">
            <p className="text-navy-600">{inviteResult.emailDelivered ? 'We hebben de uitnodiging gemaild. Je kunt de link ook zelf delen:' : 'E-mail is niet ingesteld, dus stuur deze link zelf door (72 uur geldig):'}</p>
            <div className="flex gap-2"><input readOnly value={inviteResult.link} className="input text-xs" onFocus={(e) => e.target.select()} aria-label="Uitnodigingslink" />
              <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(inviteResult.link).then(() => toast.success('Link gekopieerd'), () => toast.error('Kopiëren is mislukt'))} aria-label="Link kopiëren" /></div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger title={`Inlogaccount van ${removing?.name} verwijderen?`} confirmLabel="Account verwijderen"
        message="Diegene wordt direct uitgelogd en kan er niet meer in. Het medewerkersprofiel en de klusgeschiedenis blijven bewaard."
        onConfirm={async () => { try { await api.del(`/settings/team/${removing.id}`); toast.success('Inlogaccount verwijderd'); setRemoving(null); res.reload(true); } catch (err) { toast.error(err.message); } }} />
    </div>
  );
}

function AccountTab() {
  const { user, setSession, logout } = useAuth();
  const toast = useToast();
  const f = useForm({ name: user.name, email: user.email, currentPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const body = { name: f.values.name, email: f.values.email };
      if (f.values.newPassword) body.newPassword = f.values.newPassword;
      if (f.values.currentPassword) body.currentPassword = f.values.currentPassword;
      const d = await api.patch('/auth/account', body);
      setSession(d); f.setValues((v) => ({ ...v, currentPassword: '', newPassword: '' }));
      toast.success(body.newPassword ? 'Account bijgewerkt. Je bent op andere apparaten uitgelogd.' : 'Account bijgewerkt');
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  const needsPassword = f.values.email !== user.email || f.values.newPassword;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Je account" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Input label="Naam" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
          <Input label="E-mailadres" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
          <Input label="Nieuw wachtwoord" type="password" autoComplete="new-password" value={f.values.newPassword} onChange={f.set('newPassword')} error={f.errors.newPassword} hint="Laat leeg om je huidige wachtwoord te houden." />
          <Input label={`Huidig wachtwoord${needsPassword ? ' (verplicht)' : ''}`} type="password" autoComplete="current-password" value={f.values.currentPassword} onChange={f.set('currentPassword')} error={f.errors.currentPassword} />
          <div className="flex justify-end sm:col-span-2"><Button onClick={save} loading={saving}>Account opslaan</Button></div>
        </div>
      </Card>
      <Card className="h-fit p-5">
        <LogOut className="size-5 text-navy-400" />
        <p className="mt-2 font-semibold">Sessies</p>
        <p className="mt-1 text-sm text-navy-500">Ingelogd op een gedeeld of kwijtgeraakt apparaat? Log overal uit.</p>
        <Button variant="secondary" className="mt-4" onClick={async () => { await api.post('/auth/logout-everywhere'); await logout(); window.location.href = '/login'; }}>Overal uitloggen</Button>
      </Card>
    </div>
  );
}

function BillingTab() {
  const res = useApi('/billing');
  const { refresh, company } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(null);
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const { subscription: s, stripeConfigured } = res.data;
  const daysLeft = s.trial_ends_at ? Math.max(0, Math.ceil((new Date(s.trial_ends_at) - Date.now()) / 864e5)) : null;
  const choose = async (plan) => {
    setBusy(plan);
    try {
      const r = await api.post('/billing/change-plan', { plan });
      if (r.redirectUrl) { window.location.href = r.redirectUrl; return; }
      toast.success(r.message); res.reload(true); refresh();
    } catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-6">
      {params.get('checkout') === 'success' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Bedankt! Je betaling wordt verwerkt. Je abonnement wordt bijgewerkt zodra Stripe de betaling bevestigt.</div>}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-navy-400">Huidig abonnement</p>
            <p className="mt-1 text-2xl font-bold">{PLANS.find((p) => p.id === s.plan)?.name} <span className="text-base font-medium text-navy-400">€{PLANS.find((p) => p.id === s.plan)?.price}/maand</span></p>
            <p className="mt-1 text-sm">
              {s.status === 'trialing' && (s.trialExpired ? <span className="text-red-600">Je proefperiode is afgelopen. De Starter-functies blijven beschikbaar; kies een abonnement om verder te gaan.</span> : <span className="text-navy-500">Gratis proefperiode{company.is_demo ? ' (demo-omgeving)' : ''} · nog {daysLeft} {daysLeft === 1 ? 'dag' : 'dagen'}. Er is niets afgeschreven.</span>)}
              {s.status === 'active' && <span className="text-emerald-600">Actief abonnement{s.current_period_end ? ` · wordt verlengd op ${new Date(s.current_period_end).toLocaleDateString('nl-NL')}` : ''}</span>}
              {s.status === 'past_due' && <span className="text-amber-600">Betaling achterstallig – werk je betaalgegevens bij.</span>}
              {s.status === 'canceled' && <span className="text-navy-500">Abonnement opgezegd.</span>}
            </p>
          </div>
          {stripeConfigured && s.stripe_customer_id && <Button variant="secondary" icon={CreditCard} loading={busy === 'portal'} onClick={async () => { setBusy('portal'); try { const r = await api.post('/billing/portal'); window.location.href = r.redirectUrl; } catch (err) { toast.error(err.message); setBusy(null); } }}>Betalingen beheren</Button>}
        </div>
      </Card>
      {!stripeConfigured && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p><strong>Online betalen is nog niet actief.</strong> Stripe is nog niet ingesteld, dus er kan niets worden afgeschreven. Tijdens je proefperiode kun je vrij wisselen van abonnement om functies uit te proberen. Neem na de proefperiode contact op met CLEANFLOW om een betaald abonnement te activeren.</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === s.plan;
          return (
            <Card key={p.id} className={cx('flex flex-col p-6', current && 'border-emerald-500 ring-1 ring-emerald-500')}>
              <div className="flex items-center justify-between"><p className="font-bold">{p.name}</p>{current && <Badge color="emerald"><Check className="size-3" />Huidig</Badge>}</div>
              <p className="mt-2 text-3xl font-extrabold">€{p.price}<span className="text-sm font-medium text-navy-400">/maand</span></p>
              <ul className="mt-4 flex-1 space-y-2">{p.features.map((x) => <li key={x} className="flex gap-2 text-sm text-navy-600"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />{x}</li>)}</ul>
              <Button className="mt-6 w-full" variant={current ? 'secondary' : 'primary'} disabled={current && (s.status === 'active' || (s.status === 'trialing' && !s.trialExpired))} loading={busy === p.id} onClick={() => choose(p.id)}>
                {current ? (s.status === 'active' || !s.trialExpired ? 'Huidig abonnement' : `${p.name} afsluiten`) : stripeConfigured ? `Kies ${p.name}` : s.status === 'trialing' && !s.trialExpired ? `Proefperiode naar ${p.name}` : `Kies ${p.name}`}
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-xs text-navy-400"><Bot className="size-4" />Prijzen exclusief btw. Betalingen worden verwerkt door Stripe zodra dat is ingesteld; CLEANFLOW slaat nooit kaartgegevens op.</p>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = ['owner', 'manager'].includes(user.role);
  const tabs = [
    isAdmin && { value: 'company', label: 'Bedrijf', icon: Building2 },
    isAdmin && { value: 'hours', label: 'Openingstijden & boeken', icon: Clock },
    isAdmin && { value: 'notifications', label: 'Meldingen', icon: Bell },
    isAdmin && { value: 'team', label: 'Team & rechten', icon: Users },
    { value: 'account', label: 'Account', icon: UserCircle },
    user.role === 'owner' && { value: 'billing', label: 'Abonnement', icon: CreditCard },
  ].filter(Boolean);
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : tabs[0].value;
  const company = useApi(isAdmin ? '/settings/company' : null);
  const needsCompany = ['company', 'hours'].includes(tab);
  return (
    <div>
      <PageHeader title="Instellingen" description="Bedrijfsgegevens, openingstijden, rechten van je team, meldingen en je abonnement." />
      <Tabs className="mb-6" value={tab} onChange={(v) => setParams({ tab: v })} tabs={tabs} />
      {needsCompany && (company.loading && !company.data ? <PageLoader /> : company.error ? <ErrorState error={company.error} onRetry={company.reload} /> : (
        tab === 'company' ? <CompanyTab key={company.data.company.name} company={company.data.company} reload={() => company.reload(true)} /> : <HoursTab company={company.data.company} reload={() => company.reload(true)} />
      ))}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'account' && <AccountTab />}
      {tab === 'billing' && <BillingTab />}
      {isAdmin && tab === 'company' && (
        <Card className="mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><Bot className="size-5 text-emerald-500" /><p className="text-sm text-navy-600">Diensten & prijzen en de AI-assistent hebben een eigen pagina.</p></div>
          <div className="flex gap-2"><Button size="sm" variant="secondary" to="/app/services">Diensten & prijzen</Button><Button size="sm" variant="secondary" to="/app/assistant">AI-assistent</Button></div>
        </Card>
      )}
    </div>
  );
}
