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
  available: ['Beschikbaar', 'emerald'], on_job: ['Aan het werk', 'violet'], off: ['Vrije dag', 'navy'], off_shift: ['Buiten dienst', 'navy'], on_leave: ['Met verlof', 'amber'],
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
        : <Badge color="amber" className="hidden sm:inline-flex">Niet toegewezen</Badge>)}
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
    try { await api.post(`/bookings/${b.id}/status`, { status }); toast.success(status === 'completed' ? 'Klus afgerond' : 'Klus gestart'); reload(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  const d = data.data;
  return (
    <div>
      <PageHeader title={`Hoi ${user.name.split(' ')[0]} 👋`} description={`Dit zijn je klussen voor ${fmtDate(d.today, { weekday: 'long', day: 'numeric', month: 'long' })}.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Klussen vandaag" value={d.todayJobs.filter((j) => j.status !== 'cancelled').length} icon={CalendarCheck} />
        <StatCard label="Afgerond deze maand" value={d.completedMonth} icon={CheckCircle2} tone="sky" />
        <StatCard label="Totaal afgerond" value={d.completedTotal} icon={Sparkles} tone="violet" />
      </div>
      <Card className="mb-6">
        <CardHeader title="Vandaag" description="Start en rond je klussen af terwijl je bezig bent." />
        {d.todayJobs.length === 0 ? <EmptyState icon={CalendarCheck} title="Geen klussen vandaag" description="Geniet van je dag! Nieuwe klussen verschijnen hier." /> : (
          <ul className="divide-y divide-navy-100">
            {d.todayJobs.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)} · {b.service_name}</p>
                  <p className="text-sm text-navy-500">{b.customer_name} · {b.address}</p>
                  {b.instructions && <p className="mt-1 text-sm text-amber-700">Let op: {b.instructions}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === 'confirmed' && <Button size="sm" icon={Play} loading={busy === b.id} onClick={() => setStatus(b, 'in_progress')}>Starten</Button>}
                  {b.status === 'in_progress' && <Button size="sm" icon={CheckCircle2} loading={busy === b.id} onClick={() => setStatus(b, 'completed')}>Afronden</Button>}
                  <Button size="sm" variant="secondary" to={`/app/bookings?open=${b.id}`}>Details</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Komende klussen" action={<Button size="sm" variant="ghost" to="/app/bookings">Al mijn klussen <ArrowRight className="size-4" /></Button>} />
        {d.upcoming.length === 0 ? <EmptyState title="Nog niets ingepland" description="Klussen die aan jou worden toegewezen, verschijnen hier." /> : <div className="divide-y divide-navy-100">{d.upcoming.map((b) => <AppointmentRow key={b.id} b={b} showEmployee={false} />)}</div>}
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
          <h2 className="text-lg font-bold">Welkom bij CLEANFLOW!</h2>
          <p className="mt-1 text-sm text-navy-500">Je account is klaar. We hebben zes voorbeelddiensten toegevoegd die je kunt aanpassen. Volgende stappen:</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Sparkles} to="/app/services">Diensten & prijzen bekijken</Button>
            <Button size="sm" variant="secondary" icon={Settings2} to="/app/settings?tab=hours">Openingstijden instellen</Button>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Boekingslink gekopieerd'), () => toast.error('Kopiëren is mislukt'))}>Boekingslink kopiëren</Button>
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
  const monthName = new Date(`${d.today}T12:00:00Z`).toLocaleDateString('nl-NL', { month: 'long', timeZone: 'UTC' });

  return (
    <div>
      <PageHeader title={`Goede${new Date().getHours() < 12 ? 'morgen' : new Date().getHours() < 18 ? 'middag' : 'navond'}, ${user.name.split(' ')[0]}`}
        description={`Dit gebeurt er vandaag bij ${company.name}.`}
        actions={<><Button variant="secondary" to="/app/bookings?status=pending" icon={Hourglass}>Aanvragen bekijken</Button><Button to="/app/bookings?new=1" icon={CalendarCheck}>Nieuwe boeking</Button></>} />
      {(params.get('welcome') || s.bookingsTotal === 0) && <Welcome company={company} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={`Omzet in ${monthName}`} value={money(s.revenueMonth, cur, { compact: true })} icon={Euro} trend={trend} sub={trend !== null ? 't.o.v. zelfde periode vorige maand' : 'Geregistreerde betalingen'} />
        <StatCard label="Boekingen deze maand" value={s.bookingsMonth} icon={CalendarCheck} tone="sky" sub={`${s.bookingsTotal} in totaal`} />
        <StatCard label="Openstaande aanvragen" value={s.pending} icon={Hourglass} tone="amber" sub={s.pending ? 'Wachten op jouw reactie' : 'Alles bijgewerkt'} />
        <StatCard label="Afgeronde klussen" value={s.completedMonth} icon={CheckCircle2} tone="violet" sub={`deze maand · ${s.completedTotal} in totaal`} />
        <StatCard label="Actieve klanten" value={s.activeCustomers} icon={Users} tone="pink" sub={`laatste 90 dagen · ${s.totalCustomers} in totaal`} />
        <StatCard label="Medewerkers" value={s.employees} icon={UserCog} tone="navy" sub={`actief · ${s.employeesTotal} in totaal`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Omzet" description={range === 'weekly' ? 'Geregistreerde betalingen per week, laatste 8 weken' : 'Geregistreerde betalingen per maand, laatste 12 maanden'}
            action={<Segmented value={range} onChange={setRange} options={[{ value: 'weekly', label: 'Per week' }, { value: 'monthly', label: 'Per maand' }]} />} />
          <div className="p-4 pt-5">
            {d.revenue[range].every((r) => r.revenue === 0)
              ? <EmptyState icon={Euro} title="Nog geen omzet geregistreerd" description="Registreer betalingen bij afgeronde boekingen om hier je omzet te zien." />
              : <RevenueBars data={d.revenue[range]} currency={cur} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Status van boekingen" description={`Alle boekingen in ${monthName}`} />
          <div className="p-5"><StatusBreakdown rows={d.statusOverview} /></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Komende afspraken" action={<Button size="sm" variant="ghost" to="/app/bookings">Alles bekijken <ArrowRight className="size-4" /></Button>} />
          {d.upcoming.length === 0 ? <EmptyState icon={CalendarCheck} title="Geen komende afspraken" description="Nieuwe boekingen via je boekingspagina of die je zelf toevoegt, verschijnen hier." action={<Button to="/app/bookings?new=1" size="sm">Boeking toevoegen</Button>} />
            : <div className="divide-y divide-navy-100">{d.upcoming.map((b) => <AppointmentRow key={b.id} b={b} />)}</div>}
        </Card>
        <Card>
          <CardHeader title="Team vandaag" description="Actuele beschikbaarheid" action={d.showEmployees && <Button size="sm" variant="ghost" to="/app/employees">Beheren</Button>} />
          {!d.showEmployees ? <EmptyState icon={UserCog} title="Personeelsbeheer" description="Beschikbaar in het Professional-abonnement." action={<Button size="sm" variant="secondary" to="/app/settings?tab=billing">Abonnementen bekijken</Button>} />
            : d.employees.length === 0 ? <EmptyState icon={UserCog} title="Nog geen teamleden" action={<Button size="sm" to="/app/employees?new=1">Medewerker toevoegen</Button>} />
              : (
                <ul className="divide-y divide-navy-100">
                  {d.employees.map((e) => (
                    <li key={e.id}>
                      <Link to={`/app/employees/${e.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-navy-50/60">
                        <Avatar name={e.name} color={e.color} size="size-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{e.name}</p>
                          <p className="truncate text-xs text-navy-400">{e.current ? `${e.current.service_name} tot ${fmtTime(e.current.ends_at)}` : e.shift ? `Dienst ${e.shift} · ${e.jobsToday} klus${e.jobsToday === 1 ? '' : 'sen'}` : e.job_title}</p>
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
          <CardHeader title="Recente activiteit" />
          {d.activity.length === 0 ? <EmptyState icon={Activity} title="Nog geen activiteit" /> : (
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
          <CardHeader title="Meldingen" action={<Button size="sm" variant="ghost" to="/app/notifications">Alles bekijken</Button>} />
          {d.notifications.length === 0 ? <EmptyState icon={Bell} title="Geen meldingen" /> : (
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
