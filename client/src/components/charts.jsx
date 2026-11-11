import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { moneyUnits, STATUS } from '../lib/format.js';

const axis = { stroke: '#9aa8c3', fontSize: 12, tickLine: false, axisLine: false };

function ChartTooltip({ active, payload, label, currency, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-3 py-2 shadow-soft">
      <p className="text-xs text-navy-400">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          {payload.length > 1 && <span className="size-2 rounded-full" style={{ background: p.color }} />}
          {payload.length > 1 && <span className="font-normal text-navy-500">{p.name}</span>}
          {currency ? moneyUnits(p.value, currency) : `${p.value}${unit ? ` ${unit}` : ''}`}
        </p>
      ))}
    </div>
  );
}

export function RevenueBars({ data, currency, height = 260, dataKey = 'revenue', xKey = 'label' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="#e4e9f2" />
        <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} width={56} tickFormatter={(v) => (currency ? moneyUnits(v, currency) : v)} allowDecimals={false} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'rgba(16,185,129,0.08)' }} />
        <Bar dataKey={dataKey} name="Omzet" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({ data, xKey, dataKey, name, currency, unit, height = 260, color = '#10b981' }) {
  const id = `grad-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.22} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e4e9f2" />
        <XAxis dataKey={xKey} {...axis} minTickGap={16} />
        <YAxis {...axis} width={56} tickFormatter={(v) => (currency ? moneyUnits(v, currency) : v)} allowDecimals={false} />
        <Tooltip content={<ChartTooltip currency={currency} unit={unit} />} cursor={{ stroke: '#9aa8c3', strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HBars({ data, labelKey, valueKey, format = (v) => v, color = '#10b981' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d[labelKey]} className="group" title={`${d[labelKey]}: ${format(d[valueKey])}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-navy-700">{d[labelKey]}</span>
            <span className="shrink-0 font-semibold text-navy-900">{format(d[valueKey])}</span>
          </div>
          <div className="h-2 rounded-full bg-navy-50">
            <div className="h-2 rounded-full transition-all duration-500 group-hover:opacity-80" style={{ width: `${(d[valueKey] / max) * 100}%`, background: d.color || color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Segmented status bar with a labelled legend (identity never relies on colour alone). */
export function StatusBreakdown({ rows }) {
  const order = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return <p className="py-6 text-center text-sm text-navy-400">Nog geen boekingen in deze periode.</p>;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {order.filter((s) => counts[s]).map((s) => (
          <div key={s} title={`${STATUS[s].label}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: STATUS[s].color }} className="first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-5 space-y-2.5">
        {order.map((s) => (
          <li key={s} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2.5 text-navy-600"><span className="size-2.5 rounded-full" style={{ background: STATUS[s].color }} />{STATUS[s].label}</span>
            <span className="font-semibold text-navy-900">{counts[s] || 0} <span className="ml-1 text-xs font-normal text-navy-400">{Math.round(((counts[s] || 0) / total) * 100)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
