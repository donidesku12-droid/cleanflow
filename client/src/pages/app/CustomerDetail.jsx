import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Pencil, Trash2, CalendarPlus, StickyNote, CalendarCheck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { money, fmtDate, fmtTime } from '../../lib/format.js';
import { Button, Card, CardHeader, StatCard, StatusBadge, EmptyState, ErrorState, PageLoader, ConfirmDialog, Avatar, Badge } from '../../components/ui.jsx';
import { CustomerForm } from './Customers.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const res = useApi(`/customers/${id}`, [id]);
  const { company } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const { customer: c, bookings } = res.data;
  const cur = company.currency;
  const upcoming = bookings.filter((b) => ['pending', 'confirmed', 'in_progress'].includes(b.status));

  const remove = async () => {
    setBusy(true);
    try { await api.del(`/customers/${c.id}`); toast.success('Klant verwijderd'); navigate('/app/customers'); }
    catch (err) { toast.error(err.message); setDeleting(false); } finally { setBusy(false); }
  };

  return (
    <div>
      <Link to="/app/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-900"><ArrowLeft className="size-4" />Klanten</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={c.name} size="size-14" color="#10b981" className="text-lg" />
          <div>
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <p className="text-sm text-navy-400">Klant sinds {fmtDate(c.created_at, { month: 'long', year: 'numeric' })} · {c.source === 'online' ? 'via online boeking' : 'handmatig toegevoegd'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Wijzigen</Button>
          <Button variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(true)}>Verwijderen</Button>
          <Button icon={CalendarPlus} to="/app/bookings?new=1">Nieuwe boeking</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Totaal besteed" value={money(c.total_spent_cents, cur)} />
        <StatCard label="Boekingen" value={c.booking_count} sub={`${c.completed_count} voltooid`} tone="sky" />
        <StatCard label="Laatste boeking" value={c.last_booking_at ? fmtDate(c.last_booking_at) : '—'} tone="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contactgegevens" />
            <div className="space-y-3 p-5 text-sm">
              <p className="flex items-center gap-3"><Mail className="size-4 text-navy-300" />{c.email ? <a href={`mailto:${c.email}`} className="break-all hover:underline">{c.email}</a> : <span className="text-navy-300">Geen e-mailadres</span>}</p>
              <p className="flex items-center gap-3"><Phone className="size-4 text-navy-300" />{c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : <span className="text-navy-300">Geen telefoonnummer</span>}</p>
              <p className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 text-navy-300" />{[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || <span className="text-navy-300">Geen adres</span>}</p>
              {c.tags && <div className="flex flex-wrap gap-1.5 pt-1">{c.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <Badge key={t} color="emerald">{t}</Badge>)}</div>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Notities" action={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Wijzigen</Button>} />
            <div className="p-5">{c.notes ? <p className="text-sm whitespace-pre-line text-navy-700">{c.notes}</p> : <p className="flex items-center gap-2 text-sm text-navy-300"><StickyNote className="size-4" />Nog geen notities</p>}</div>
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Boekingsgeschiedenis" description={upcoming.length ? `${upcoming.length} komend` : undefined} />
          {bookings.length === 0 ? <EmptyState icon={CalendarCheck} title="Nog geen boekingen" /> : (
            <ul className="divide-y divide-navy-100">
              {bookings.map((b) => (
                <li key={b.id}>
                  <Link to={`/app/bookings?open=${b.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-navy-50/60">
                    <div className="w-24 shrink-0 text-sm"><p className="font-semibold">{fmtDate(b.starts_at)}</p><p className="text-xs text-navy-400">{fmtTime(b.starts_at)}</p></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{b.service_name}</p><p className="truncate text-xs text-navy-400">{b.reference}{b.employee_name ? ` · ${b.employee_name}` : ''}</p></div>
                    <span className="hidden text-sm font-medium sm:block">{money(b.price_cents, cur)}</span>
                    <StatusBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <CustomerForm open={editing} initial={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); res.reload(true); }} />
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={remove} loading={busy} danger title={`${c.name} verwijderen?`} confirmLabel="Klant verwijderen"
        message={bookings.length ? 'Deze klant heeft boekingen en kan daarom niet worden verwijderd. Zo blijven je overzichten kloppen.' : 'De klant wordt definitief verwijderd.'} />
    </div>
  );
}
