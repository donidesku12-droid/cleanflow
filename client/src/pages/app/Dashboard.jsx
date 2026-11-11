import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Euro, CalendarCheck, Hourglass, CheckCircle2, Users, UserCog, ArrowRight, Clock, MapPin, Activity, Bell, PartyPopper, Copy, Sparkles, Settings2, Play,
} from 'lucide-react';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { api } from '../../lib/api.js';
import { money, fmtDate, fmtTime, timeAgo } from '../../lib/format.js';
import {
  Card, CardHeader, StatCard, StatusBadge, Avatar, Badge, Button, EmptyState, ErrorState, Skeleton, Segmented, PageHeader, cx,
} from '../../components/ui.jsx';
import { RevenueBars, StatusBreakdown } from '../../components/charts.jsx';

const EMP_STATE = {
  available: ['Available', 'emerald'], on_job: ['On a job', 'violet'], off: ['Day off', 'navy'], off_shift: ['Off shift', 'navy'], on_leave: ['On leave', 'amber'],
};

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-60" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function AppointmentRow({ b, showEmployee = true }) {
  return (
    <Link to={`/app/bookings?open=${b.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-navy-50/60">
      <div className="w-14 shrink-0 text-center">
        <p className="text-xs font-semibold text-navy-400 uppercase">{fmtDate(b.starts_at, { weekday: 'short' })}</p>
        <p className="text-lg leading-tight font-bold text-navy-900">{b.starts_at.slice(8, 10)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900">{b.service_name} <span className="font-normal text-navy-400">· {b.customer_name}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-navy-400">
          <span className="flex items-center gap-1"><Clock className="size-3" />{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span>
          <span className="flex min-w-0 items-center gap-1"><MapPin className="size-3 shrink-0" /><span className="truncate">{b.address}</span></span>
        </p>
      </div>
      {showEmployee && (b.employee_name ? <Avatar name={b.employee_name} color={b.employee_color} size="size-7" className="hidden sm:inline-flex" />
        : <Badge color="amber" className="hidden sm:inline-flex">Unassigned</Badge>)}
      <StatusBadge status={b.status} />
    </Link>
  );
}

function EmployeeDashboard({ data }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const { reload } = data;
  const setStatus = async (b, status) => {
    setBusy(b.id);
    try { await api.post(`/bookings/${b.id}/status`, { status }); toast.success(status === 'completed' ? 'Job marked as completed' : 'Job started'); reload(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  const d = data.data;
  return (
    <div>
      <PageHeader title={`Hi ${user.name.split(' ')[0]} 👋`} description={`Here are your jobs for ${fmtDate(d.today, { weekday: 'long', day: 'numeric', month: 'long' })}.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Jobs today" value={d.todayJobs.filter((j) => j.status !== 'cancelled').length} icon={CalendarCheck} />
        <StatCard label="Completed this month" value={d.completedMonth} icon={CheckCircle2} tone="sky" />
        <StatCard label="Completed all time" value={d.completedTotal} icon={Sparkles} tone="violet" />
      </div>
      <Card className="mb-6">
        <CardHeader title="Today" description="Start and complete your jobs as you go." />
        {d.todayJobs.length === 0 ? <EmptyState icon={CalendarCheck} title="No jobs today" description="Enjoy your day! New assignments will appear here." /> : (
          <ul className="divide-y divide-navy-100">
            {d.todayJobs.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)} · {b.service_name}</p>
                  <p className="text-sm text-navy-500">{b.customer_name} · {b.address}</p>
                  {b.instructions && <p className="mt-1 text-sm text-amber-700">Note: {b.instructions}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === 'confirmed' && <Button size="sm" icon={Play} loading={busy === b.id} onClick={() => setStatus(b, 'in_progress')}>Start</Button>}
                  {b.status === 'in_progress' && <Button size="sm" icon={CheckCircle2} loading={busy === b.id} onClick={() => setStatus(b, 'completed')}>Complete</Button>}
                  <Button size="sm" variant="secondary" to={`/app/bookings?open=${b.id}`}>Details</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Upcoming jobs" action={<Button size="sm" variant="ghost" to="/app/bookings">All my jobs <ArrowRight className="size-4" /></Button>} />
        {d.upcoming.length === 0 ? <EmptyState title="Nothing scheduled yet" description="Jobs assigned to you will show up here." /> : <div className="divide-y divide-navy-100">{d.upcoming.map((b) => <AppointmentRow key={b.id} b={b} showEmployee={false} />)}</div>}
      </Card>
    </div>
  );
}

function Welcome({ company }) {
  const toast = useToast();
  const link = `${window.location.origin}/book/${company.slug}`;
  return (
    <Card className="mb-6 overflow-hidden border-emerald-200">
      <div className="flex flex-col gap-6 bg-gradient-to-br from-emerald-50 to-white p-6 md:flex-row md:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white"><PartyPopper className="size-6" /></span>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Welcome to CLEANFLOW!</h2>
          <p className="mt-1 text-sm text-navy-500">Your workspace is ready. We added six example services you can edit. Next steps:</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Sparkles} to="/app/services">Review services & prices</Button>
            <Button size="sm" variant="secondary" icon={Settings2} to="/app/settings?tab=hours">Set opening hours</Button>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Booking link copied'), () => toast.error('Could not copy the link'))}>Copy booking link</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const res = useApi('/dashboard');
  const { user, company } = useAuth();
  const [range, setRange] = useState('weekly');
  const [params] = useSearchParams();
  if (res.loading && !res.data) return <DashboardSkeleton />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const d = res.data;
  if (d.role === 'employee') return <EmployeeDashboard data={res} />;

  const cur = d.currency;
  const s = d.stats;
  const trend = s.revenuePrevMonth ? Math.round(((s.revenueMonth - s.revenuePrevMonth) / s.revenuePrevMonth) * 100) : null;
  const monthName = new Date(`${d.today}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

  return (
    <div>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        description={`Here's what's happening at ${company.name} today.`}
        actions={<><Button variant="secondary" to="/app/bookings?status=pending" icon={Hourglass}>Review requests</Button><Button to="/app/bookings?new=1" icon={CalendarCheck}>New booking</Button></>} />
      {(params.get('welcome') || s.bookingsTotal === 0) && <Welcome company={company} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={`Revenue in ${monthName}`} value={money(s.revenueMonth, cur, { compact: true })} icon={Euro} trend={trend} sub={trend !== null ? 'vs same period last month' : 'Recorded payments'} />
        <StatCard label="Bookings this month" value={s.bookingsMonth} icon={CalendarCheck} tone="sky" sub={`${s.bookingsTotal} all time`} />
        <StatCard label="Pending requests" value={s.pending} icon={Hourglass} tone="amber" sub={s.pending ? 'Awaiting your response' : 'All caught up'} />
        <StatCard label="Completed jobs" value={s.completedMonth} icon={CheckCircle2} tone="violet" sub={`this month · ${s.completedTotal} all time`} />
        <StatCard label="Active customers" value={s.activeCustomers} icon={Users} tone="pink" sub={`last 90 days · ${s.totalCustomers} total`} />
        <StatCard label="Employees" value={s.employees} icon={UserCog} tone="navy" sub={`active · ${s.employeesTotal} total`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue" description={range === 'weekly' ? 'Recorded payments per week, last 8 weeks' : 'Recorded payments per month, last 12 months'}
            action={<Segmented value={range} onChange={setRange} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />} />
          <div className="p-4 pt-5">
            {d.revenue[range].every((r) => r.revenue === 0)
              ? <EmptyState icon={Euro} title="No revenue recorded yet" description="Record payments on completed bookings to see revenue here." />
              : <RevenueBars data={d.revenue[range]} currency={cur} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Booking status" description={`All bookings in ${monthName}`} />
          <div className="p-5"><StatusBreakdown rows={d.statusOverview} /></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Upcoming appointments" action={<Button size="sm" variant="ghost" to="/app/bookings">View all <ArrowRight className="size-4" /></Button>} />
          {d.upcoming.length === 0 ? <EmptyState icon={CalendarCheck} title="No upcoming appointments" description="New bookings from your booking page or added manually will appear here." action={<Button to="/app/bookings?new=1" size="sm">Add a booking</Button>} />
            : <div className="divide-y divide-navy-100">{d.upcoming.map((b) => <AppointmentRow key={b.id} b={b} />)}</div>}
        </Card>
        <Card>
          <CardHeader title="Team today" description="Live availability" action={d.showEmployees && <Button size="sm" variant="ghost" to="/app/employees">Manage</Button>} />
          {!d.showEmployees ? <EmptyState icon={UserCog} title="Employee management" description="Available on the Professional plan." action={<Button size="sm" variant="secondary" to="/app/settings?tab=billing">View plans</Button>} />
            : d.employees.length === 0 ? <EmptyState icon={UserCog} title="No team members yet" action={<Button size="sm" to="/app/employees?new=1">Add employee</Button>} />
              : (
                <ul className="divide-y divide-navy-100">
                  {d.employees.map((e) => (
                    <li key={e.id}>
                      <Link to={`/app/employees/${e.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-navy-50/60">
                        <Avatar name={e.name} color={e.color} size="size-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{e.name}</p>
                          <p className="truncate text-xs text-navy-400">{e.current ? `${e.current.service_name} until ${fmtTime(e.current.ends_at)}` : e.shift ? `Shift ${e.shift} · ${e.jobsToday} job${e.jobsToday === 1 ? '' : 's'}` : e.job_title}</p>
                        </div>
                        <Badge color={EMP_STATE[e.state][1]}>{EMP_STATE[e.state][0]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent activity" />
          {d.activity.length === 0 ? <EmptyState icon={Activity} title="No activity yet" /> : (
            <ul className="space-y-0.5 p-3">
              {d.activity.map((a) => (
                <li key={a.id} className="flex gap-3 rounded-xl px-2 py-2">
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', { completed: 'bg-emerald-500', cancelled: 'bg-navy-300', rejected: 'bg-navy-300', requested: 'bg-amber-500', created: 'bg-sky-500' }[a.action] || 'bg-violet-500')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy-700">{a.summary}</p>
                    <p className="text-xs text-navy-400">{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Notifications" action={<Button size="sm" variant="ghost" to="/app/notifications">View all</Button>} />
          {d.notifications.length === 0 ? <EmptyState icon={Bell} title="No notifications" /> : (
            <ul className="divide-y divide-navy-100">
              {d.notifications.map((n) => (
                <li key={n.id}>
                  <Link to={n.link || '/app/notifications'} className="flex gap-3 px-5 py-3 transition hover:bg-navy-50/60">
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-navy-200' : 'bg-emerald-500')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-navy-400">{n.body}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-navy-300">{timeAgo(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
