import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CalendarPlus, CalendarCheck, CalendarX, AlarmClock, UserPlus, CheckCircle2, MessageSquareWarning, Settings2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { timeAgo } from '../../lib/format.js';
import { Button, Card, EmptyState, ErrorState, Skeleton, PageHeader, Segmented, cx } from '../../components/ui.jsx';

const ICONS = {
  booking_new: [CalendarPlus, 'bg-amber-50 text-amber-600'], booking_confirmed: [CalendarCheck, 'bg-sky-50 text-sky-600'], booking_cancelled: [CalendarX, 'bg-navy-50 text-navy-500'],
  booking_reminder: [AlarmClock, 'bg-violet-50 text-violet-600'], employee_assigned: [UserPlus, 'bg-emerald-50 text-emerald-600'], job_completed: [CheckCircle2, 'bg-emerald-50 text-emerald-600'],
  chat_escalated: [MessageSquareWarning, 'bg-amber-50 text-amber-600'],
};

export default function Notifications() {
  const [filter, setFilter] = useState('all');
  const res = useApi(`/notifications${filter === 'unread' ? '?unread=1' : ''}`);
  const { refresh, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const items = res.data?.notifications || [];

  const open = async (n) => {
    if (!n.is_read) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); refresh(); }
    if (n.link) navigate(n.link); else res.reload(true);
  };
  const readAll = async () => {
    try { await api.post('/notifications/read-all'); toast.success('Alle meldingen gemarkeerd als gelezen'); refresh(); res.reload(true); } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <PageHeader title="Meldingen" description="Nieuwe boekingen, bevestigingen, annuleringen, herinneringen en meer."
        actions={<>
          {isAdmin && <Button variant="secondary" icon={Settings2} to="/app/settings?tab=notifications">Voorkeuren</Button>}
          <Button variant="secondary" icon={CheckCheck} onClick={readAll}>Alles gelezen</Button>
        </>} />
      <div className="mb-4"><Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Alle' }, { value: 'unread', label: 'Ongelezen' }]} /></div>
      <Card>
        {res.loading && !res.data ? <div className="space-y-3 p-5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
            : items.length === 0 ? <EmptyState icon={Bell} title={filter === 'unread' ? 'Geen ongelezen meldingen' : 'Nog geen meldingen'} description="Hier krijg je meldingen over boekingen en je team." />
              : (
                <ul className="divide-y divide-navy-100">
                  {items.map((n) => {
                    const [Icon, cls] = ICONS[n.type] || [Bell, 'bg-navy-50 text-navy-500'];
                    return (
                      <li key={n.id}>
                        <button onClick={() => open(n)} className={cx('flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-navy-50/60', !n.is_read && 'bg-emerald-50/30')}>
                          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl', cls)}><Icon className="size-[18px]" /></span>
                          <div className="min-w-0 flex-1">
                            <p className={cx('text-sm', n.is_read ? 'text-navy-700' : 'font-semibold text-navy-900')}>{n.title}</p>
                            {n.body && <p className="mt-0.5 text-sm text-navy-500">{n.body}</p>}
                            <p className="mt-1 text-xs text-navy-400">{timeAgo(n.created_at)}</p>
                          </div>
                          {!n.is_read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-emerald-500" aria-label="Ongelezen" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
      </Card>
    </div>
  );
}
