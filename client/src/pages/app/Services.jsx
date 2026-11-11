import { useEffect, useState } from 'react';
import { Plus, Sparkles, Pencil, Trash2, Clock } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { priceLabel, duration } from '../../lib/format.js';
import { Button, Card, Modal, Input, Select, Textarea, Toggle, EmptyState, ErrorState, Skeleton, PageHeader, Badge, ConfirmDialog, useForm, cx } from '../../components/ui.jsx';

function ServiceForm({ open, onClose, initial, onSaved, currency }) {
  const toast = useToast();
  const f = useForm({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    f.setValues({ name: initial?.name || '', description: initial?.description || '', price: initial ? (initial.price_cents / 100).toFixed(2) : '',
      price_unit: initial?.price_unit || 'fixed', duration_min: initial?.duration_min || 120, active: initial ? !!initial.active : true });
    f.setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setSaving(true);
    try {
      const body = { ...f.values, price: Number(f.values.price), duration_min: Number(f.values.duration_min), description: f.values.description || null };
      const d = initial?.id ? await api.patch(`/services/${initial.id}`, body) : await api.post('/services', body);
      toast.success(initial?.id ? 'Service updated' : 'Service added');
      onSaved(d.service);
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit service' : 'Add service'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>{initial?.id ? 'Save changes' : 'Add service'}</Button></>}>
      <div className="space-y-4">
        <Input label="Service name" value={f.values.name || ''} onChange={f.set('name')} error={f.errors.name} />
        <Textarea label="Description" value={f.values.description || ''} onChange={f.set('description')} error={f.errors.description} hint="Shown on your booking page and used by the AI assistant." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={`Price (${currency})`} type="number" min="0" step="0.01" value={f.values.price ?? ''} onChange={f.set('price')} error={f.errors.price} />
          <Select label="Price type" value={f.values.price_unit || 'fixed'} onChange={f.set('price_unit')}>
            <option value="fixed">Fixed price</option><option value="from">Starting from</option><option value="per_hour">Per hour</option>
          </Select>
        </div>
        <Select label="Estimated duration" value={String(f.values.duration_min || 120)} onChange={f.set('duration_min')} error={f.errors.duration_min} hint="Used to calculate available time slots.">
          {[30, 45, 60, 90, 120, 150, 180, 210, 240, 300, 330, 360, 420, 480].map((m) => <option key={m} value={m}>{duration(m)}</option>)}
        </Select>
        <Toggle checked={!!f.values.active} onChange={f.set('active')} label="Active" description="Inactive services are hidden from the booking page and the assistant." />
      </div>
    </Modal>
  );
}

export default function Services() {
  const res = useApi('/services');
  const { company } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(null);
  const list = res.data?.services || [];
  const cur = company.currency;

  const toggle = async (s) => {
    setBusy(s.id);
    try { await api.patch(`/services/${s.id}`, { active: !s.active }); toast.success(s.active ? `${s.name} deactivated` : `${s.name} activated`); res.reload(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('del');
    try { const d = await api.del(`/services/${deleting.id}`); toast.success(d.message || 'Service deleted'); setDeleting(null); res.reload(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader title="Services" description="What you offer, what it costs and how long it takes." actions={<Button icon={Plus} onClick={() => setEditing({})}>Add service</Button>} />
      {res.loading && !res.data ? <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
          : list.length === 0 ? <Card><EmptyState icon={Sparkles} title="No services yet" description="Add the cleaning services you offer so customers can book them." action={<Button size="sm" icon={Plus} onClick={() => setEditing({})}>Add service</Button>} /></Card>
            : (
              <div className="grid gap-4 md:grid-cols-2">
                {list.map((s) => (
                  <Card key={s.id} className={cx('flex flex-col p-5 transition', !s.active && 'bg-navy-50/50')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className={cx('font-semibold', !s.active && 'text-navy-400')}>{s.name}</h3>{!s.active && <Badge>Inactive</Badge>}</div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-navy-400"><Clock className="size-3.5" />{duration(s.duration_min)} · {s.booking_count} booking{s.booking_count === 1 ? '' : 's'}</p>
                      </div>
                      <p className="shrink-0 text-lg font-bold text-emerald-600">{priceLabel(s, cur)}</p>
                    </div>
                    <p className="mt-3 flex-1 text-sm text-navy-500">{s.description || <span className="text-navy-300">No description</span>}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-4">
                      <Toggle checked={!!s.active} onChange={() => toggle(s)} disabled={busy === s.id} label={s.active ? 'Active' : 'Inactive'} />
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(s)}>Edit</Button>
                        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
      <ServiceForm open={!!editing} initial={editing?.id ? editing : null} currency={cur} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); res.reload(true); }} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy === 'del'} danger title={`Delete ${deleting?.name}?`} confirmLabel="Delete"
        message={deleting?.booking_count ? 'This service has bookings, so it will be deactivated instead of deleted to keep your history intact.' : 'This permanently removes the service.'} />
    </div>
  );
}
