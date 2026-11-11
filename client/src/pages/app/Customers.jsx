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
      toast.success(initial?.id ? 'Klant bijgewerkt' : 'Klant toegevoegd');
      onSaved(d.customer);
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Klant wijzigen' : 'Klant toevoegen'} size="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Annuleren</Button><Button onClick={submit} loading={saving}>{initial?.id ? 'Wijzigingen opslaan' : 'Klant toevoegen'}</Button></>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Volledige naam" value={f.values.name} onChange={f.set('name')} error={f.errors.name} required className="sm:col-span-2" />
        <Input label="E-mailadres" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
        <Input label="Telefoonnummer" type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
        <Input label="Adres" value={f.values.address} onChange={f.set('address')} error={f.errors.address} className="sm:col-span-2" />
        <Input label="Postcode" value={f.values.postal_code} onChange={f.set('postal_code')} error={f.errors.postal_code} />
        <Input label="Plaats" value={f.values.city} onChange={f.set('city')} error={f.errors.city} />
        <Input label="Labels" placeholder="bijv. VIP, wekelijks, heeft sleutel" value={f.values.tags} onChange={f.set('tags')} error={f.errors.tags} className="sm:col-span-2" />
        <Textarea label="Notities" placeholder="Huisdieren, toegang, voorkeuren…" value={f.values.notes} onChange={f.set('notes')} error={f.errors.notes} className="sm:col-span-2" />
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
      <PageHeader title="Klanten" description="Iedereen voor wie je schoonmaakt, met geschiedenis en totale besteding."
        actions={<>
          {can('advanced_reporting') && <Button variant="secondary" icon={Download} href="/api/dashboard/export/customers">CSV exporteren</Button>}
          <Button icon={Plus} onClick={() => setParams({ new: '1' })}>Klant toevoegen</Button>
        </>} />
      <Card>
        <div className="grid gap-3 border-b border-navy-100 p-4 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-navy-300" />
            <input className="input pl-10" placeholder="Zoek op naam, e-mail, telefoon of adres…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Klanten zoeken" />
          </div>
          <Select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Groep">
            <option value="all">Alle klanten</option><option value="new">Nieuw (laatste 30 dagen)</option><option value="repeat">Vaste klanten</option>
            <option value="inactive">Inactief (90+ dagen)</option><option value="no_bookings">Nog geen boekingen</option>
          </Select>
          <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Plaats">
            <option value="">Alle plaatsen</option>{res.data?.cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sorteren">
            <option value="name">Sorteer: naam</option><option value="recent">Sorteer: nieuwste</option><option value="spend">Sorteer: hoogste besteding</option><option value="bookings">Sorteer: meeste boekingen</option>
          </Select>
        </div>
        {res.loading && !res.data ? <div className="space-y-3 p-5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
            : list.length === 0 ? <EmptyState icon={Users} title={debounced || segment !== 'all' || city ? 'Geen klanten gevonden' : 'Nog geen klanten'} description="Klanten worden automatisch toegevoegd als ze online boeken, of je voegt ze zelf toe." action={<Button size="sm" icon={Plus} onClick={() => setParams({ new: '1' })}>Klant toevoegen</Button>} />
              : (
                <div className={cx('overflow-x-auto transition-opacity', res.loading && 'opacity-60')}>
                  <table className="w-full min-w-[720px]">
                    <thead className="border-b border-navy-100"><tr>
                      <th className="table-th">Klant</th><th className="table-th">Contact</th><th className="table-th">Plaats</th>
                      <th className="table-th text-right">Boekingen</th><th className="table-th text-right">Totaal besteed</th><th className="table-th">Laatste boeking</th>
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
                          <td className="table-td text-navy-500">{c.last_booking_at ? fmtDate(c.last_booking_at) : 'Nooit'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-navy-100 px-4 py-3 text-xs text-navy-400">{list.length} klant{list.length === 1 ? '' : 'en'}</p>
                </div>
              )}
      </Card>
      <CustomerForm open={params.get('new') === '1'} onClose={() => setParams({})} onSaved={(c) => navigate(`/app/customers/${c.id}`)} />
    </div>
  );
}
