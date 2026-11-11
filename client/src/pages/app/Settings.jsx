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

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const TIMEZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['Europe/Amsterdam']; } })();

function CompanyTab({ company, reload }) {
  const toast = useToast();
  const { can, user, refresh } = useAuth();
  const f = useForm(company);
  const [saving, setSaving] = useState(false);
  const fields = ['name', 'email', 'phone', 'website', 'address', 'city', 'postal_code', 'country', 'currency', 'timezone'];
  const save = async () => {
    setSaving(true);
    try { await api.patch('/settings/company', Object.fromEntries(fields.map((k) => [k, f.values[k] ?? null]))); toast.success('Company details saved'); reload(); refresh(); }
    catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  const uploadLogo = (file) => {
    if (!file) return;
    if (file.size > 300 * 1024) return toast.error('Logo must be smaller than 300 KB');
    const reader = new FileReader();
    reader.onload = async () => {
      try { await api.put('/settings/company/logo', { dataUrl: reader.result }); toast.success('Logo updated'); reload(); refresh(); } catch (err) { toast.error(err.message); }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Company details" description="Shown on your booking page and used by your AI assistant." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Input label="Company name" value={f.values.name || ''} onChange={f.set('name')} error={f.errors.name} className="sm:col-span-2" />
          <Input label="Contact email" type="email" value={f.values.email || ''} onChange={f.set('email')} error={f.errors.email} hint="New booking requests are sent here." />
          <Input label="Phone" value={f.values.phone || ''} onChange={f.set('phone')} error={f.errors.phone} />
          <Input label="Website" value={f.values.website || ''} onChange={f.set('website')} error={f.errors.website} className="sm:col-span-2" />
          <Input label="Business address" value={f.values.address || ''} onChange={f.set('address')} error={f.errors.address} className="sm:col-span-2" />
          <Input label="Postal code" value={f.values.postal_code || ''} onChange={f.set('postal_code')} error={f.errors.postal_code} />
          <Input label="City" value={f.values.city || ''} onChange={f.set('city')} error={f.errors.city} />
          <Input label="Country" value={f.values.country || ''} onChange={f.set('country')} error={f.errors.country} />
          <Select label="Currency" value={f.values.currency} onChange={f.set('currency')}>{['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN'].map((c) => <option key={c}>{c}</option>)}</Select>
          <Select label="Timezone" value={f.values.timezone} onChange={f.set('timezone')} error={f.errors.timezone} className="sm:col-span-2">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select>
          <div className="flex justify-end sm:col-span-2"><Button onClick={save} loading={saving}>Save changes</Button></div>
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Company logo" description="Shown on your booking page." />
        <div className="p-5">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-navy-200 bg-navy-50">
            {company.logo_data_url ? <img src={company.logo_data_url} alt="Company logo" className="size-full object-contain" /> : <Building2 className="size-8 text-navy-300" />}
          </div>
          {can('custom_branding') && user.role === 'owner' ? (
            <div className="mt-4 flex gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-navy-200 px-3 text-xs font-semibold text-navy-700 hover:bg-navy-50">
                <Upload className="size-4" />Upload<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadLogo(e.target.files[0])} />
              </label>
              {company.logo_data_url && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={async () => { await api.put('/settings/company/logo', { dataUrl: null }); reload(); refresh(); }}>Remove</Button>}
            </div>
          ) : <p className="mt-4 flex items-center gap-1.5 text-xs text-navy-400"><Lock className="size-3.5" />{user.role !== 'owner' ? 'Only the owner can change the logo.' : 'Custom branding is part of the Business plan.'}</p>}
          <p className="mt-2 text-xs text-navy-400">PNG, JPEG or WebP, max 300 KB.</p>
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
    try { await api.patch('/settings/company', { opening_hours: hours, ...booking, slot_interval_min: Number(booking.slot_interval_min), min_notice_hours: Number(booking.min_notice_hours), booking_horizon_days: Number(booking.booking_horizon_days) }); toast.success('Opening hours & booking rules saved'); reload(); }
    catch (err) { setError(err.message); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Opening hours" description="Online bookings are only offered within these hours." />
        <div className="divide-y divide-navy-100">
          {DAYS.map(([d, label]) => (
            <div key={d} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-24 text-sm font-medium">{label}</span>
              <Toggle checked={!hours[d].closed} onChange={(open) => set(d, 'closed', !open)} />
              {hours[d].closed ? <span className="text-sm text-navy-300">Closed</span> : (
                <div className="flex items-center gap-2">
                  <input type="time" className="input w-28 py-1.5" value={hours[d].open} onChange={(e) => set(d, 'open', e.target.value)} aria-label={`${label} opens`} />
                  <span className="text-navy-300">–</span>
                  <input type="time" className="input w-28 py-1.5" value={hours[d].close} onChange={(e) => set(d, 'close', e.target.value)} aria-label={`${label} closes`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Online booking rules" />
        <div className="space-y-4 p-5">
          <Toggle checked={booking.booking_enabled} onChange={(v) => setBooking({ ...booking, booking_enabled: v })} label="Accept online bookings" description="When off, your booking page shows your contact details instead." />
          <Select label="Time slot interval" value={booking.slot_interval_min} onChange={(e) => setBooking({ ...booking, slot_interval_min: e.target.value })}>
            <option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={60}>Every hour</option>
          </Select>
          <Input label="Minimum notice (hours)" type="number" min="0" max="168" value={booking.min_notice_hours} onChange={(e) => setBooking({ ...booking, min_notice_hours: e.target.value })} hint="How far in advance customers must book." />
          <Input label="Booking window (days)" type="number" min="7" max="365" value={booking.booking_horizon_days} onChange={(e) => setBooking({ ...booking, booking_horizon_days: e.target.value })} hint="How far ahead customers can book." />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end"><Button onClick={save} loading={saving}>Save</Button></div>
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
    try { await api.put('/settings/notifications', { settings: rows.map(({ type, in_app, email, sms }) => ({ type, in_app, email, sms })) }); toast.success('Notification preferences saved'); res.reload(true); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {[[Mail, 'Email delivery', d.providers.email, 'SMTP is configured. Emails are sent to customers, employees and your company inbox.', 'Not configured. Set SMTP_HOST (and credentials) on the server to send emails. Until then, messages are logged below and not delivered.'],
          [MessageSquare, 'SMS delivery', d.providers.sms, 'Twilio is configured.', 'Not configured (optional). Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM to enable SMS.']].map(([Icon, title, ok, yes, no]) => (
          <Card key={title} className="flex gap-4 p-5">
            <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', ok ? 'bg-emerald-50 text-emerald-600' : 'bg-navy-50 text-navy-400')}><Icon className="size-5" /></span>
            <div><p className="flex items-center gap-2 font-semibold">{title}<Badge color={ok ? 'emerald' : 'navy'}>{ok ? 'Connected' : 'Not connected'}</Badge></p><p className="mt-1 text-sm text-navy-500">{ok ? yes : no}</p></div>
          </Card>
        ))}
      </div>
      {!d.automated && <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Sparkles className="size-5" />Automated email & SMS notifications are part of the Professional plan. In-app notifications work on every plan.</div>}
      <Card>
        <CardHeader title="Notification preferences" description="Choose how each event is delivered." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead className="border-b border-navy-100"><tr><th className="table-th">Event</th><th className="table-th text-center">In-app</th><th className="table-th text-center">Email</th><th className="table-th text-center">SMS</th></tr></thead>
            <tbody className="divide-y divide-navy-50">
              {rows?.map((r, i) => (
                <tr key={r.type}><td className="table-td font-medium">{r.label}</td>
                  {['in_app', 'email', 'sms'].map((k) => <td key={k} className="table-td"><div className="flex justify-center"><Toggle checked={r[k]} onChange={(v) => set(i, k, v)} disabled={k !== 'in_app' && !d.automated} /></div></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-navy-100 p-4"><Button onClick={save} loading={saving}>Save preferences</Button></div>
      </Card>
      <Card>
        <CardHeader title="Delivery log" description="The last 50 email and SMS messages." />
        {d.outbox.length === 0 ? <EmptyState icon={Send} title="No messages yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-navy-100"><tr><th className="table-th">When</th><th className="table-th">Channel</th><th className="table-th">Recipient</th><th className="table-th">Subject</th><th className="table-th">Status</th></tr></thead>
              <tbody className="divide-y divide-navy-50">
                {d.outbox.map((m) => (
                  <tr key={m.id}><td className="table-td text-xs text-navy-400">{timeAgo(m.created_at)}</td><td className="table-td uppercase text-xs">{m.channel}</td><td className="table-td">{m.recipient}</td><td className="table-td max-w-xs truncate">{m.subject || '—'}</td>
                    <td className="table-td"><Badge color={m.status === 'sent' ? 'emerald' : m.status === 'failed' ? 'red' : 'navy'}>{m.status === 'not_configured' ? 'Not sent – provider not configured' : m.status}</Badge></td></tr>
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
        {[['Owner', 'Full access including billing, permissions and company settings.', ShieldCheck],
          ['Manager', 'Manages bookings, customers, employees, services, analytics and the AI assistant. No billing or role changes.', Users],
          ['Employee', 'Sees only jobs assigned to them, and can start and complete them. No financial or customer-list access.', UserCircle]].map(([r, t, Icon]) => (
          <Card key={r} className="p-5"><Icon className="size-5 text-emerald-500" /><p className="mt-2 font-semibold">{r}</p><p className="mt-1 text-sm text-navy-500">{t}</p></Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Team logins" description={`${d.users.filter((u) => u.status !== 'disabled').length} of ${d.limit} accounts on your plan`}
          action={<Button size="sm" icon={UserPlus} onClick={() => setInvite({ name: '', email: '', role: 'employee', employee_id: '' })}>Invite</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-navy-100"><tr><th className="table-th">User</th><th className="table-th">Role</th><th className="table-th">Status</th><th className="table-th">Last login</th><th className="table-th" /></tr></thead>
            <tbody className="divide-y divide-navy-50">
              {d.users.map((u) => (
                <tr key={u.id}>
                  <td className="table-td"><div className="flex items-center gap-3"><Avatar name={u.name} size="size-8" color="#344363" /><div><p className="font-semibold text-navy-900">{u.name}{u.id === user.id && <span className="ml-1 text-xs font-normal text-navy-400">(you)</span>}</p><p className="text-xs text-navy-400">{u.email}</p></div></div></td>
                  <td className="table-td">{isOwner && u.role !== 'owner' ? (
                    <select className="input w-32 py-1.5" value={u.role} onChange={(e) => update(u, { role: e.target.value }, 'Role updated')} aria-label={`Role for ${u.name}`}>
                      <option value="manager">Manager</option><option value="employee">Employee</option>
                    </select>) : <span className="capitalize">{u.role}</span>}</td>
                  <td className="table-td"><Badge color={u.status === 'active' ? 'emerald' : u.status === 'invited' ? 'amber' : 'navy'}>{u.status}</Badge></td>
                  <td className="table-td text-xs text-navy-400">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</td>
                  <td className="table-td text-right">
                    {u.role !== 'owner' && (
                      <div className="flex justify-end gap-1">
                        {u.status === 'invited' && <Button size="sm" variant="ghost" onClick={() => resend(u)}>New link</Button>}
                        {isOwner && u.status === 'active' && <Button size="sm" variant="ghost" onClick={() => update(u, { status: 'disabled' }, 'Access disabled')}>Disable</Button>}
                        {isOwner && u.status === 'disabled' && <Button size="sm" variant="ghost" onClick={() => update(u, { status: 'active' }, 'Access restored')}>Enable</Button>}
                        {isOwner && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setRemoving(u)} aria-label={`Remove ${u.name}`} />}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Invite a team member" description="They'll set their own password with a secure link."
        footer={<><Button variant="secondary" onClick={() => setInvite(null)}>Cancel</Button><Button onClick={sendInvite} loading={saving}>Create invitation</Button></>}>
        {invite && (
          <div className="space-y-4">
            <Select label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="employee">Employee</option>{isOwner && <option value="manager">Manager</option>}
            </Select>
            {invite.role === 'employee' && d.employeesWithoutLogin.length > 0 && (
              <Select label="Link to existing employee profile" value={invite.employee_id} onChange={(e) => {
                const emp = d.employeesWithoutLogin.find((x) => String(x.id) === e.target.value);
                setInvite({ ...invite, employee_id: e.target.value, name: emp?.name || invite.name, email: emp?.email || invite.email });
              }}>
                <option value="">Create a new employee profile</option>{d.employeesWithoutLogin.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            )}
            <Input label="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            <Input label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
        )}
      </Modal>
      <Modal open={!!inviteResult} onClose={() => setInviteResult(null)} title="Invitation created" footer={<Button onClick={() => setInviteResult(null)}>Done</Button>}>
        {inviteResult && (
          <div className="space-y-3 text-sm">
            <p className="text-navy-600">{inviteResult.emailDelivered ? 'We emailed the invitation link. You can also share it directly:' : 'Email delivery is not configured, so share this link with them yourself (valid for 72 hours):'}</p>
            <div className="flex gap-2"><input readOnly value={inviteResult.link} className="input text-xs" onFocus={(e) => e.target.select()} aria-label="Invitation link" />
              <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(inviteResult.link).then(() => toast.success('Link copied'), () => toast.error('Could not copy'))} aria-label="Copy link" /></div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger title={`Remove ${removing?.name}'s login?`} confirmLabel="Remove login"
        message="They will be signed out and lose access immediately. Their employee profile and job history are kept."
        onConfirm={async () => { try { await api.del(`/settings/team/${removing.id}`); toast.success('Login removed'); setRemoving(null); res.reload(true); } catch (err) { toast.error(err.message); } }} />
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
      toast.success(body.newPassword ? 'Account updated. Other devices were signed out.' : 'Account updated');
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  const needsPassword = f.values.email !== user.email || f.values.newPassword;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Your account" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Input label="Name" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
          <Input label="Email" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
          <Input label="New password" type="password" autoComplete="new-password" value={f.values.newPassword} onChange={f.set('newPassword')} error={f.errors.newPassword} hint="Leave empty to keep your current password." />
          <Input label={`Current password${needsPassword ? ' (required)' : ''}`} type="password" autoComplete="current-password" value={f.values.currentPassword} onChange={f.set('currentPassword')} error={f.errors.currentPassword} />
          <div className="flex justify-end sm:col-span-2"><Button onClick={save} loading={saving}>Save account</Button></div>
        </div>
      </Card>
      <Card className="h-fit p-5">
        <LogOut className="size-5 text-navy-400" />
        <p className="mt-2 font-semibold">Sessions</p>
        <p className="mt-1 text-sm text-navy-500">Signed in on a shared or lost device? Sign out everywhere.</p>
        <Button variant="secondary" className="mt-4" onClick={async () => { await api.post('/auth/logout-everywhere'); await logout(); window.location.href = '/login'; }}>Sign out of all devices</Button>
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
      {params.get('checkout') === 'success' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Thanks! Your payment is being processed – your plan updates as soon as Stripe confirms it.</div>}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-navy-400">Current plan</p>
            <p className="mt-1 text-2xl font-bold">{PLANS.find((p) => p.id === s.plan)?.name} <span className="text-base font-medium text-navy-400">€{PLANS.find((p) => p.id === s.plan)?.price}/month</span></p>
            <p className="mt-1 text-sm">
              {s.status === 'trialing' && (s.trialExpired ? <span className="text-red-600">Your trial has ended. Starter features remain available; choose a plan to continue.</span> : <span className="text-navy-500">Free trial{company.is_demo ? ' (demo workspace)' : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left. No payment has been taken.</span>)}
              {s.status === 'active' && <span className="text-emerald-600">Active subscription{s.current_period_end ? ` · renews ${new Date(s.current_period_end).toLocaleDateString('en-GB')}` : ''}</span>}
              {s.status === 'past_due' && <span className="text-amber-600">Payment past due – please update your payment method.</span>}
              {s.status === 'canceled' && <span className="text-navy-500">Subscription canceled.</span>}
            </p>
          </div>
          {stripeConfigured && s.stripe_customer_id && <Button variant="secondary" icon={CreditCard} loading={busy === 'portal'} onClick={async () => { setBusy('portal'); try { const r = await api.post('/billing/portal'); window.location.href = r.redirectUrl; } catch (err) { toast.error(err.message); setBusy(null); } }}>Manage billing</Button>}
        </div>
      </Card>
      {!stripeConfigured && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p><strong>Online payments are not active yet.</strong> Stripe has not been configured for this installation, so no card can be charged. During your trial you can switch plans freely to try features. After the trial, contact CLEANFLOW to activate a paid plan.</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === s.plan;
          return (
            <Card key={p.id} className={cx('flex flex-col p-6', current && 'border-emerald-500 ring-1 ring-emerald-500')}>
              <div className="flex items-center justify-between"><p className="font-bold">{p.name}</p>{current && <Badge color="emerald"><Check className="size-3" />Current</Badge>}</div>
              <p className="mt-2 text-3xl font-extrabold">€{p.price}<span className="text-sm font-medium text-navy-400">/month</span></p>
              <ul className="mt-4 flex-1 space-y-2">{p.features.map((x) => <li key={x} className="flex gap-2 text-sm text-navy-600"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />{x}</li>)}</ul>
              <Button className="mt-6 w-full" variant={current ? 'secondary' : 'primary'} disabled={current && (s.status === 'active' || (s.status === 'trialing' && !s.trialExpired))} loading={busy === p.id} onClick={() => choose(p.id)}>
                {current ? (s.status === 'active' || !s.trialExpired ? 'Current plan' : `Subscribe to ${p.name}`) : stripeConfigured ? `Choose ${p.name}` : s.status === 'trialing' && !s.trialExpired ? `Switch trial to ${p.name}` : `Choose ${p.name}`}
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-xs text-navy-400"><Bot className="size-4" />Prices exclude VAT. Payments are processed by Stripe when enabled; CLEANFLOW never stores card details.</p>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = ['owner', 'manager'].includes(user.role);
  const tabs = [
    isAdmin && { value: 'company', label: 'Company', icon: Building2 },
    isAdmin && { value: 'hours', label: 'Hours & booking', icon: Clock },
    isAdmin && { value: 'notifications', label: 'Notifications', icon: Bell },
    isAdmin && { value: 'team', label: 'Team & permissions', icon: Users },
    { value: 'account', label: 'Account', icon: UserCircle },
    user.role === 'owner' && { value: 'billing', label: 'Billing', icon: CreditCard },
  ].filter(Boolean);
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : tabs[0].value;
  const company = useApi(isAdmin ? '/settings/company' : null);
  const needsCompany = ['company', 'hours'].includes(tab);
  return (
    <div>
      <PageHeader title="Settings" description="Company profile, opening hours, team permissions, notifications and billing." />
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
          <div className="flex items-center gap-3"><Bot className="size-5 text-emerald-500" /><p className="text-sm text-navy-600">Services & prices and AI assistant settings have their own pages.</p></div>
          <div className="flex gap-2"><Button size="sm" variant="secondary" to="/app/services">Services & prices</Button><Button size="sm" variant="secondary" to="/app/assistant">AI assistant</Button></div>
        </Card>
      )}
    </div>
  );
}
