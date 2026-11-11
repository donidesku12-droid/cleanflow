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
      toast.success(initial?.id ? 'Dienst bijgewerkt' : 'Dienst toegevoegd');
      onSaved(d.service);
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Dienst wijzigen' : 'Dienst toevoegen'}
      footer={<><Button variant="secondary" onClick={onClose}>Annuleren</Button><Button onClick={submit} loading={saving}>{initial?.id ? 'Wijzigingen opslaan' : 'Dienst toevoegen'}</Button></>}>
      <div className="space-y-4">
        <Input label="Naam van de dienst" value={f.values.name || ''} onChange={f.set('name')} error={f.errors.name} />
        <Textarea label="Omschrijving" value={f.values.description || ''} onChange={f.set('description')} error={f.errors.description} hint="Staat op je boekingspagina en wordt gebruikt door de AI-assistent." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={`Prijs (${currency})`} type="number" min="0" step="0.01" value={f.values.price ?? ''} onChange={f.set('price')} error={f.errors.price} />
          <Select label="Soort prijs" value={f.values.price_unit || 'fixed'} onChange={f.set('price_unit')}>
            <option value="fixed">Vaste prijs</option><option value="from">Vanaf-prijs</option><option value="per_hour">Per uur</option>
          </Select>
        </div>
        <Select label="Geschatte duur" value={String(f.values.duration_min || 120)} onChange={f.set('duration_min')} error={f.errors.duration_min} hint="Wordt gebruikt om vrije tijden te berekenen.">
          {[30, 45, 60, 90, 120, 150, 180, 210, 240, 300, 330, 360, 420, 480].map((m) => <option key={m} value={m}>{duration(m)}</option>)}
        </Select>
        <Toggle checked={!!f.values.active} onChange={f.set('active')} label="Actief" description="Inactieve diensten zijn niet zichtbaar op de boekingspagina en bij de assistent." />
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
    try { await api.patch(`/services/${s.id}`, { active: !s.active }); toast.success(s.active ? `${s.name} uitgezet` : `${s.name} aangezet`); res.reload(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('del');
    try { const d = await api.del(`/services/${deleting.id}`); toast.success(d.message || 'Dienst verwijderd'); setDeleting(null); res.reload(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader title="Diensten" description="Wat je aanbiedt, wat het kost en hoe lang het duurt." actions={<Button icon={Plus} onClick={() => setEditing({})}>Dienst toevoegen</Button>} />
      {res.loading && !res.data ? <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
          : list.length === 0 ? <Card><EmptyState icon={Sparkles} title="Nog geen diensten" description="Voeg de schoonmaakdiensten toe die je aanbiedt, zodat klanten ze kunnen boeken." action={<Button size="sm" icon={Plus} onClick={() => setEditing({})}>Dienst toevoegen</Button>} /></Card>
            : (
              <div className="grid gap-4 md:grid-cols-2">
                {list.map((s) => (
                  <Card key={s.id} className={cx('flex flex-col p-5 transition', !s.active && 'bg-navy-50/50')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className={cx('font-semibold', !s.active && 'text-navy-400')}>{s.name}</h3>{!s.active && <Badge>Inactief</Badge>}</div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-navy-400"><Clock className="size-3.5" />{duration(s.duration_min)} · {s.booking_count} boeking{s.booking_count === 1 ? '' : 'en'}</p>
                      </div>
                      <p className="shrink-0 text-lg font-bold text-emerald-600">{priceLabel(s, cur)}</p>
                    </div>
                    <p className="mt-3 flex-1 text-sm text-navy-500">{s.description || <span className="text-navy-300">Geen omschrijving</span>}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-4">
                      <Toggle checked={!!s.active} onChange={() => toggle(s)} disabled={busy === s.id} label={s.active ? 'Actief' : 'Inactief'} />
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(s)}>Wijzigen</Button>
                        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(s)} aria-label={`${s.name} verwijderen`} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
      <ServiceForm open={!!editing} initial={editing?.id ? editing : null} currency={cur} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); res.reload(true); }} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy === 'del'} danger title={`${deleting?.name} verwijderen?`} confirmLabel="Verwijderen"
        message={deleting?.booking_count ? 'Deze dienst heeft boekingen. Hij wordt daarom uitgezet in plaats van verwijderd, zodat je geschiedenis klopt.' : 'De dienst wordt definitief verwijderd.'} />
    </div>
  );
}
