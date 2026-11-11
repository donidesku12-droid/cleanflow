import { useState } from 'react';
import { Download, Euro, CalendarCheck, CheckCircle2, Receipt, UserPlus, Ban, Lock, Table2, BarChart3 } from 'lucide-react';
import { qs } from '../../lib/api.js';
import { useApi, useAuth } from '../../lib/context.jsx';
import { money, moneyUnits, todayLocal, addDaysStr, fmtDate } from '../../lib/format.js';
import { Button, Card, CardHeader, StatCard, ErrorState, Skeleton, PageHeader, Segmented, Input, Avatar, cx } from '../../components/ui.jsx';
import { RevenueBars, TrendArea, HBars, StatusBreakdown } from '../../components/charts.jsx';

const PRESETS = [
  { value: '30', label: '30 dagen' }, { value: '90', label: '90 dagen' }, { value: '365', label: '12 maanden' }, { value: 'ytd', label: 'Dit jaar' }, { value: 'custom', label: 'Zelf kiezen' },
];

function labelFor(key, group) {
  if (group === 'month') return new Date(`${key}-01T12:00:00Z`).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return fmtDate(key, { day: 'numeric', month: 'short' });
}

function Locked({ title }) {
  return (
    <Card className="flex flex-col items-center justify-center p-10 text-center">
      <Lock className="size-6 text-navy-300" />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-navy-400">Beschikbaar met uitgebreide analyses in het Professional-abonnement.</p>
      <Button size="sm" variant="secondary" className="mt-4" to="/app/settings?tab=billing">Abonnementen bekijken</Button>
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
      <PageHeader title="Analyses" description="Hoe je bedrijf het doet door de tijd. De omzet is gebaseerd op geregistreerde betalingen."
        actions={can('advanced_reporting') ? <>
          <Button variant="secondary" size="sm" icon={Download} href={exportUrl('bookings')}>Boekingen (CSV)</Button>
          <Button variant="secondary" size="sm" icon={Download} href={exportUrl('payments')}>Betalingen (CSV)</Button>
        </> : <Button variant="secondary" size="sm" icon={Lock} to="/app/settings?tab=billing">CSV-export (Business)</Button>} />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="overflow-x-auto"><Segmented value={preset} onChange={setPreset} options={PRESETS} /></div>
        {preset === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Van" />
            <Input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Tot en met" />
          </div>
        )}
      </div>

      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !d ? (
        <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>
      ) : (
        <div className={cx('space-y-6 transition-opacity', res.loading && 'opacity-60')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Totale omzet" value={money(d.kpis.totalRevenue, cur, { compact: true })} icon={Euro} />
            <StatCard label="Boekingen" value={d.kpis.bookings} icon={CalendarCheck} tone="sky" />
            <StatCard label="Afgeronde klussen" value={d.kpis.completed} icon={CheckCircle2} tone="violet" />
            <StatCard label="Gem. boekingswaarde" value={money(d.kpis.averageBookingValue, cur)} icon={Receipt} tone="amber" />
            <StatCard label="Nieuwe klanten" value={d.kpis.newCustomers} icon={UserPlus} tone="pink" />
            <StatCard label="Annuleringen" value={`${String(d.kpis.cancellationRate).replace('.', ',')}%`} icon={Ban} tone="navy" />
          </div>

          <Card>
            <CardHeader title="Omzet" description={`Per ${{ day: 'dag', week: 'week', month: 'maand' }[d.group]}, ${fmtDate(d.from)} – ${fmtDate(d.to)}`}
              action={<Button size="sm" variant="ghost" icon={showTable ? BarChart3 : Table2} onClick={() => setShowTable(!showTable)}>{showTable ? 'Grafiek' : 'Tabel'}</Button>} />
            <div className="p-4">
              {showTable ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr><th className="table-th">Periode</th><th className="table-th text-right">Omzet</th><th className="table-th text-right">Boekingen</th><th className="table-th text-right">Afgerond</th></tr></thead>
                    <tbody className="divide-y divide-navy-50">{d.series.map((r) => <tr key={r.key}><td className="table-td">{labelFor(r.key, d.group)}</td><td className="table-td text-right font-medium">{moneyUnits(r.revenue, cur)}</td><td className="table-td text-right">{r.bookings}</td><td className="table-td text-right">{r.completed}</td></tr>)}</tbody></table>
                </div>
              ) : <RevenueBars data={d.series.map((r) => ({ ...r, label: labelFor(r.key, d.group) }))} currency={cur} height={300} />}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Boekingen door de tijd" description="Niet-geannuleerde boekingen per afspraakdatum" />
              <div className="p-4"><TrendArea data={d.series.map((r) => ({ ...r, label: labelFor(r.key, d.group) }))} xKey="label" dataKey="bookings" name="Boekingen" unit="boekingen" color="#0ea5e9" /></div>
            </Card>
            <Card>
              <CardHeader title="Omzet per maand" description="Laatste 12 maanden" />
              <div className="p-4"><RevenueBars data={d.monthly} currency={cur} /></div>
            </Card>
          </div>

          {d.advanced ? (<>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Groei in klanten" description="Totaal aantal klanten door de tijd" />
                <div className="p-4"><TrendArea data={d.customerGrowth.map((r) => ({ ...r, label: labelFor(r.key, d.group) }))} xKey="label" dataKey="total" name="Klanten" unit="klanten" color="#8b5cf6" /></div>
              </Card>
              <Card>
                <CardHeader title="Status van boekingen" description="Alle boekingen in deze periode" />
                <div className="p-5"><StatusBreakdown rows={d.statusBreakdown} /></div>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Populairste diensten" description="Op aantal boekingen" />
                <div className="p-5"><HBars data={d.popularServices} labelKey="name" valueKey="bookings" format={(v) => `${v} boeking${v === 1 ? '' : 'en'}`} /></div>
              </Card>
              <Card>
                <CardHeader title="Activiteit per medewerker" description="Klussen in de gekozen periode" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead className="border-b border-navy-100"><tr><th className="table-th">Medewerker</th><th className="table-th text-right">Afgerond</th><th className="table-th text-right">Uren</th><th className="table-th text-right">Ingepland</th><th className="table-th text-right">Omzet</th></tr></thead>
                    <tbody className="divide-y divide-navy-50">
                      {d.employeeActivity.length === 0 ? <tr><td colSpan={5} className="table-td text-center text-navy-400">Nog geen medewerkers</td></tr> : d.employeeActivity.map((e) => (
                        <tr key={e.name}><td className="table-td"><span className="flex items-center gap-2"><Avatar name={e.name} color={e.color} size="size-6" />{e.name}</span></td>
                          <td className="table-td text-right font-semibold">{e.completed}</td><td className="table-td text-right">{e.hours}</td><td className="table-td text-right">{e.scheduled}</td><td className="table-td text-right">{money(e.revenue_cents, cur, { compact: true })}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>) : (
            <div className="grid gap-6 lg:grid-cols-2"><Locked title="Populaire diensten & groei in klanten" /><Locked title="Activiteit per medewerker" /></div>
          )}
        </div>
      )}
    </div>
  );
}
