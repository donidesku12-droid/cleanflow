import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Pencil, Trash2, CalendarCheck, CheckCircle2, Clock, Activity } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { fmtDate, fmtTime, timeAgo } from '../../lib/format.js';
import { Button, Card, CardHeader, StatCard, StatusBadge, EmptyState, ErrorState, PageLoader, Avatar, Badge, ConfirmDialog, Tabs } from '../../components/ui.jsx';
import { EmployeeForm, EMP_STATUS } from './Employees.jsx';
import { RevenueBars } from '../../components/charts.jsx';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

function JobList({ items, empty }) {
  if (!items.length) return <EmptyState icon={CalendarCheck} title={empty} />;
  return (
    <ul className="divide-y divide-navy-100">
      {items.map((b) => (
        <li key={b.id}>
          <Link to={`/app/bookings?open=${b.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-navy-50/60">
            <div className="w-24 shrink-0 text-sm"><p className="font-semibold">{fmtDate(b.starts_at)}</p><p className="text-xs text-navy-400">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</p></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{b.service_name} · {b.customer_name}</p><p className="truncate text-xs text-navy-400">{b.address}</p></div>
            <StatusBadge status={b.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const res = useApi(`/employees/${id}`, [id]);
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const [busy, setBusy] = useState(false);
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const { employee: e, upcoming, completed, weekly, activity } = res.data;

  const remove = async () => {
    setBusy(true);
    try { await api.del(`/employees/${e.id}`); toast.success('Employee removed'); navigate('/app/employees'); }
    catch (err) { toast.error(err.message); setDeleting(false); } finally { setBusy(false); }
  };

  return (
    <div>
      {isAdmin && <Link to="/app/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-900"><ArrowLeft className="size-4" />Employees</Link>}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={e.name} color={e.color} size="size-14" className="text-lg" />
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{e.name}</h1><Badge color={EMP_STATUS[e.status][1]}>{EMP_STATUS[e.status][0]}</Badge></div>
            <p className="text-sm text-navy-400">{e.job_title}</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(true)}>Remove</Button>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming jobs" value={e.upcoming_jobs} icon={CalendarCheck} tone="sky" />
        <StatCard label="Completed (30 days)" value={e.completed_30d} icon={CheckCircle2} />
        <StatCard label="Completed all time" value={e.completed_jobs} icon={Activity} tone="violet" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="space-y-3 p-5 text-sm">
              <p className="flex items-center gap-3"><Mail className="size-4 text-navy-300" />{e.email ? <a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a> : '—'}</p>
              <p className="flex items-center gap-3"><Phone className="size-4 text-navy-300" />{e.phone ? <a href={`tel:${e.phone}`} className="hover:underline">{e.phone}</a> : '—'}</p>
              {isAdmin && <p className="text-xs text-navy-400">{e.user_id ? `Has a ${e.user_role} login (${e.user_status})` : 'No login account – invite them from Settings → Team.'}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Work schedule" />
            <ul className="divide-y divide-navy-50 px-5 py-2 text-sm">
              {DAYS.map(([d, l]) => (
                <li key={d} className="flex justify-between py-2"><span className="text-navy-500">{l}</span>
                  <span className={e.work_schedule[d].off ? 'text-navy-300' : 'flex items-center gap-1.5 font-medium'}>{e.work_schedule[d].off ? 'Off' : <><Clock className="size-3.5 text-navy-300" />{e.work_schedule[d].start} – {e.work_schedule[d].end}</>}</span></li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Completed jobs per week" description="Last 4 weeks" />
            <div className="p-4"><RevenueBars data={weekly} xKey="week" dataKey="jobs" height={180} /></div>
          </Card>
          <Card>
            <div className="px-4 pt-2"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'upcoming', label: 'Assigned jobs', count: upcoming.length }, { value: 'completed', label: 'Completed', count: completed.length }, { value: 'activity', label: 'Activity' }]} /></div>
            {tab === 'upcoming' && <JobList items={upcoming} empty="No upcoming jobs assigned" />}
            {tab === 'completed' && <JobList items={completed} empty="No completed jobs yet" />}
            {tab === 'activity' && (activity.length === 0 ? <EmptyState icon={Activity} title="No activity yet" /> : (
              <ul className="space-y-1 p-4">{activity.map((a) => <li key={a.id} className="flex justify-between gap-4 rounded-lg px-2 py-1.5 text-sm"><span className="text-navy-700">{a.summary}</span><span className="shrink-0 text-xs text-navy-400">{timeAgo(a.created_at)}</span></li>)}</ul>
            ))}
          </Card>
        </div>
      </div>
      {isAdmin && <EmployeeForm open={editing} initial={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); res.reload(true); }} />}
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={remove} loading={busy} danger title={`Remove ${e.name}?`} confirmLabel="Remove"
        message="Team members with job history can't be removed – set their status to Inactive instead. Removing also deletes their login." />
    </div>
  );
}
