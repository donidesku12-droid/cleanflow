import { useState } from 'react';
import { Download, Euro, CalendarCheck, CheckCircle2, Receipt, UserPlus, Ban, Lock, Table2, BarChart3 } from 'lucide-react';
import { qs } from '../../lib/api.js';
import { useApi, useAuth } from '../../lib/context.jsx';
import { money, moneyUnits, todayLocal, addDaysStr, fmtDate } from '../../lib/format.js';
import { Button, Card, CardHeader, StatCard, ErrorState, Skeleton, PageHeader, Segmented, Input, Avatar, cx } from '../../components/ui.jsx';
import { RevenueBars, TrendArea, HBars, StatusBreakdown } from '../../components/charts.jsx';

const PRESETS = [
  { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '12 months' }, { value: 'ytd', label: 'Year to date' }, { value: 'custom', label: 'Custom' },
];

function labelFor(key, group) {
  if (group === 'month') return new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return fmtDate(key, { day: 'numeric', month: 'short' });
}

function Locked({ title }) {
  return (
    <Card className="flex flex-col items-center justify-center p-10 text-center">
      <Lock className="size-6 text-navy-300" />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-navy-400">Available with advanced analytics on the Professional plan.</p>
      <Button size="sm" variant="secondary" className="mt-4" to="/app/settings?tab=billing">View plans</Button>
    </Card>
  );
}

export default function Analytics() {
  const today = todayLocal();
  const [preset, setPreset] = useState('90');
  const [custom, setCustom] = useState({ from: addDaysStr(today, -29), to: today });
  const [showTable, setShowTable] = useState(false);
  const { can, company } = useAuth();
  const range = preset === 'custom' ? custom : preset === 'ytd' ? { from: `${today.slice(0, 4)}-01-01`, to: today } : { from: addDaysStr(today, -(Number(preset) - 1)), to: today };
  const res = useApi(`/dashboard/analytics${qs(range)}`);
  const d = res.data;
  const cur = company.currency;
  const exportUrl = (r) => `/api/dashboard/export/${r}${qs(range)}`;

  return (
    <div>
      <PageHeader title="Analytics" description="Performance of your business over time. Revenue is based on recorded payments."
        actions={can('advanced_reporting') ? <>
          <Button variant="secondary" size="sm" icon={Download} href={exportUrl('bookings')}>Bookings CSV</Button>
          <Button variant="secondary" size="sm" icon={Download} href={exportUrl('payments')}>Payments CSV</Button>
        </> : <Button variant="secondary" size="sm" icon={Lock} to="/app/settings?tab=billing">CSV exports (Business)</Button>} />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="overflow-x-auto"><Segmented value={preset} onChange={setPreset} options={PRESETS} /></div>
        {preset === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
            <Input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
          </div>
        )}
      </div>

      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !d ? (
        <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>
      ) : (
        <div className={cx('space-y-6 transition-opacity', res.loading && 'opacity-60')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total revenue" value={money(d.kpis.totalRevenue, cur, { compact: true })} icon={Euro} />
            <StatCard label="Bookings" value={d.kpis.bookings} icon={CalendarCheck} tone="sky" />
            <StatCard label="Completed jobs" value={d.kpis.completed} icon={CheckCircle2} tone="violet" />
            <StatCard label="Avg. booking value" value={money(d.kpis.averageBookingValue, cur)} icon={Receipt} tone="amber" />
            <StatCard label="New customers" value={d.kpis.newCustomers} icon={UserPlus} tone="pink" />
            <StatCard label="Cancellation rate" value={`${d.kpis.cancellationRate}%`} icon={Ban} tone="navy" />
          </div>

          <Card>
            <CardHeader title="Revenue" description={`Per ${d.group}, ${fmtDate(d.from)} – ${fmtDate(d.to)}`}
              action={<Button size="sm" variant="ghost" icon={showTable ? BarChart3 : Table2} onClick={() => setShowTable(!showTable)}>{showTable ? 'Chart' : 'Table'}</Button>} />
            <div className="p-4">
              {showTable ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr><th className="table-th">Period</th><th className="table-th text-right">Revenue</th><th className="table-th text-right">Bookings</th><th className="table-th text-right">Completed</th></tr></thead>
                    <tbody className="divide-y divide-navy-50">{d.series.map((r) => <tr key={r.key}><td className="table-td">{labelFor(r.key, d.group)}</td><td className="table-td text-right font-medium">{moneyUnits(r.revenue, cur)}</td><td className="table-td text-right">{r.bookings}</td><td className="table-td text-right">{r.completed}</td></tr>)}</tbody></table>
                </div>
              ) : <RevenueBars data={d.series.map((r) => ({ ...r, label: labelFor(r.key, d.group) }))} currency={cur} height={300} />}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Bookings over time" description="Non-cancelled bookings by appointment date" />
              <div className="p-4"><TrendArea data={d.series.map((r) => ({ ...r, label: labelFor(r.key, d.group) }))} xKey="label" dataKey="bookings" name="Bookings" unit="bookings" color="#0ea5e9" /></div>
            </Card>
            <Card>
              <CardHeader title="Monthly revenue" description="Last 12 months" />
              <div className="p-4"><RevenueBars data={d.monthly} currency={cur} /></div>
            </Card>
          </div>

          {d.advanced ? (<>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Customer growth" description="Total customers over time" />
                <div className="p-4"><TrendArea data={d.customerGrowth.map((r) => ({ ...r, label: labelFor(r.key, d.group) }))} xKey="label" dataKey="total" name="Customers" unit="customers" color="#8b5cf6" /></div>
              </Card>
              <Card>
                <CardHeader title="Booking status" description="All bookings in range" />
                <div className="p-5"><StatusBreakdown rows={d.statusBreakdown} /></div>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Most popular services" description="By number of bookings" />
                <div className="p-5"><HBars data={d.popularServices} labelKey="name" valueKey="bookings" format={(v) => `${v} booking${v === 1 ? '' : 's'}`} /></div>
              </Card>
              <Card>
                <CardHeader title="Employee activity" description="Jobs in the selected range" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead className="border-b border-navy-100"><tr><th className="table-th">Employee</th><th className="table-th text-right">Completed</th><th className="table-th text-right">Hours</th><th className="table-th text-right">Scheduled</th><th className="table-th text-right">Revenue</th></tr></thead>
                    <tbody className="divide-y divide-navy-50">
                      {d.employeeActivity.length === 0 ? <tr><td colSpan={5} className="table-td text-center text-navy-400">No employees yet</td></tr> : d.employeeActivity.map((e) => (
                        <tr key={e.name}><td className="table-td"><span className="flex items-center gap-2"><Avatar name={e.name} color={e.color} size="size-6" />{e.name}</span></td>
                          <td className="table-td text-right font-semibold">{e.completed}</td><td className="table-td text-right">{e.hours}</td><td className="table-td text-right">{e.scheduled}</td><td className="table-td text-right">{money(e.revenue_cents, cur, { compact: true })}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>) : (
            <div className="grid gap-6 lg:grid-cols-2"><Locked title="Popular services & customer growth" /><Locked title="Employee activity" /></div>
          )}
        </div>
      )}
    </div>
  );
}
