import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users, Download, Mail, Phone } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { money, fmtDate } from '../../lib/format.js';
import { Button, Card, Modal, Input, Textarea, Select, EmptyState, ErrorState, Skeleton, PageHeader, Avatar, useForm, cx } from '../../components/ui.jsx';

export function CustomerForm({ open, onClose, initial, onSaved }) {
  const toast = useToast();
  const f = useForm({ name: '', email: '', phone: '', address: '', city: '', postal_code: '', notes: '', tags: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      f.setValues(Object.fromEntries(Object.keys(f.values).map((k) => [k, initial?.[k] ?? ''])));
      f.setErrors({});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, v === '' ? null : v]));
      body.name = f.values.name;
      const d = initial?.id ? await api.patch(`/customers/${initial.id}`, body) : await api.post('/customers', body);
      toast.success(initial?.id ? 'Customer updated' : 'Customer added');
      onSaved(d.customer);
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit customer' : 'Add customer'} size="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>{initial?.id ? 'Save changes' : 'Add customer'}</Button></>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" value={f.values.name} onChange={f.set('name')} error={f.errors.name} required className="sm:col-span-2" />
        <Input label="Email" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
        <Input label="Phone" type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
        <Input label="Address" value={f.values.address} onChange={f.set('address')} error={f.errors.address} className="sm:col-span-2" />
        <Input label="Postal code" value={f.values.postal_code} onChange={f.set('postal_code')} error={f.errors.postal_code} />
        <Input label="City" value={f.values.city} onChange={f.set('city')} error={f.errors.city} />
        <Input label="Tags" placeholder="e.g. VIP, weekly, key holder" value={f.values.tags} onChange={f.set('tags')} error={f.errors.tags} className="sm:col-span-2" />
        <Textarea label="Notes" placeholder="Pets, access instructions, preferences…" value={f.values.notes} onChange={f.set('notes')} error={f.errors.notes} className="sm:col-span-2" />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can, company } = useAuth();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [segment, setSegment] = useState('all');
  const [city, setCity] = useState('');
  const [sort, setSort] = useState('name');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const res = useApi(`/customers${qs({ q: debounced, segment, city, sort })}`);
  const list = res.data?.customers || [];
  const cur = company.currency;

  return (
    <div>
      <PageHeader title="Customers" description="Everyone you clean for, with history and lifetime value."
        actions={<>
          {can('advanced_reporting') && <Button variant="secondary" icon={Download} href="/api/dashboard/export/customers">Export CSV</Button>}
          <Button icon={Plus} onClick={() => setParams({ new: '1' })}>Add customer</Button>
        </>} />
      <Card>
        <div className="grid gap-3 border-b border-navy-100 p-4 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-navy-300" />
            <input className="input pl-10" placeholder="Search name, email, phone or address…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
          </div>
          <Select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segment">
            <option value="all">All customers</option><option value="new">New (last 30 days)</option><option value="repeat">Repeat customers</option>
            <option value="inactive">Inactive (90+ days)</option><option value="no_bookings">No bookings yet</option>
          </Select>
          <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
            <option value="">All cities</option>{res.data?.cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="name">Sort: Name</option><option value="recent">Sort: Newest</option><option value="spend">Sort: Highest spend</option><option value="bookings">Sort: Most bookings</option>
          </Select>
        </div>
        {res.loading && !res.data ? <div className="space-y-3 p-5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
            : list.length === 0 ? <EmptyState icon={Users} title={debounced || segment !== 'all' || city ? 'No customers match' : 'No customers yet'} description="Customers are added automatically when they book online, or you can add them yourself." action={<Button size="sm" icon={Plus} onClick={() => setParams({ new: '1' })}>Add customer</Button>} />
              : (
                <div className={cx('overflow-x-auto transition-opacity', res.loading && 'opacity-60')}>
                  <table className="w-full min-w-[720px]">
                    <thead className="border-b border-navy-100"><tr>
                      <th className="table-th">Customer</th><th className="table-th">Contact</th><th className="table-th">City</th>
                      <th className="table-th text-right">Bookings</th><th className="table-th text-right">Total spent</th><th className="table-th">Last booking</th>
                    </tr></thead>
                    <tbody className="divide-y divide-navy-100">
                      {list.map((c) => (
                        <tr key={c.id} className="cursor-pointer transition hover:bg-navy-50/60" onClick={() => navigate(`/app/customers/${c.id}`)}>
                          <td className="table-td"><div className="flex items-center gap-3"><Avatar name={c.name} size="size-8" color="#344363" />
                            <div className="min-w-0"><p className="font-semibold text-navy-900">{c.name}</p>{c.tags && <p className="truncate text-xs text-navy-400">{c.tags}</p>}</div></div></td>
                          <td className="table-td"><p className="flex items-center gap-1.5 text-xs"><Mail className="size-3 text-navy-300" />{c.email || '—'}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs"><Phone className="size-3 text-navy-300" />{c.phone || '—'}</p></td>
                          <td className="table-td">{c.city || '—'}</td>
                          <td className="table-td text-right font-medium">{c.booking_count}</td>
                          <td className="table-td text-right font-semibold text-navy-900">{money(c.total_spent_cents, cur)}</td>
                          <td className="table-td text-navy-500">{c.last_booking_at ? fmtDate(c.last_booking_at) : 'Never'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-navy-100 px-4 py-3 text-xs text-navy-400">{list.length} customer{list.length === 1 ? '' : 's'}</p>
                </div>
              )}
      </Card>
      <CustomerForm open={params.get('new') === '1'} onClose={() => setParams({})} onSaved={(c) => navigate(`/app/customers/${c.id}`)} />
    </div>
  );
}
