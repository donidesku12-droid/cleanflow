import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarCheck, Users, UserCog, Sparkles, BarChart3, Bot, Bell, Settings, LogOut, Menu, X, ExternalLink, ChevronDown, Lock,
} from 'lucide-react';
import { useAuth } from '../lib/context.jsx';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import Logo from './Logo.jsx';
import { Avatar, Badge, cx } from './ui.jsx';

export const ROLE_LABEL = { owner: 'Eigenaar', manager: 'Manager', employee: 'Medewerker' };

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/bookings', label: 'Boekingen', icon: CalendarCheck },
  { to: '/app/customers', label: 'Klanten', icon: Users, roles: ['owner', 'manager'] },
  { to: '/app/employees', label: 'Medewerkers', icon: UserCog, roles: ['owner', 'manager'], feature: 'employees' },
  { to: '/app/services', label: 'Diensten', icon: Sparkles, roles: ['owner', 'manager'] },
  { to: '/app/analytics', label: 'Analyses', icon: BarChart3, roles: ['owner', 'manager'] },
  { to: '/app/assistant', label: 'AI-assistent', icon: Bot, roles: ['owner', 'manager'], feature: 'ai_assistant' },
  { to: '/app/notifications', label: 'Meldingen', icon: Bell },
  { to: '/app/settings', label: 'Instellingen', icon: Settings },
];

function Sidebar({ onNavigate }) {
  const { user, company, can, subscription, unreadNotifications } = useAuth();
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  return (
    <div className="flex h-full flex-col bg-navy-900 text-navy-200">
      <div className="flex h-16 items-center px-5"><Link to="/app" onClick={onNavigate}><Logo dark size="size-8" /></Link></div>
      <div className="mx-3 mb-3 rounded-xl bg-white/5 px-3 py-2.5">
        <p className="truncate text-sm font-semibold text-white">{company?.name}</p>
        <p className="text-xs text-navy-300">{ROLE_LABEL[user.role]} · {subscription?.plan ? subscription.plan[0].toUpperCase() + subscription.plan.slice(1) : ''}</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 scrollbar-thin" aria-label="Hoofdmenu">
        {items.map((n) => {
          const locked = n.feature && !can(n.feature);
          return (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate}
              className={({ isActive }) => cx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-emerald-500/15 text-white' : 'text-navy-300 hover:bg-white/5 hover:text-white')}>
              {({ isActive }) => (<>
                <n.icon className={cx('size-[18px]', isActive ? 'text-emerald-400' : 'text-navy-400 group-hover:text-navy-200')} />
                <span className="flex-1">{n.to === '/app/bookings' && user.role === 'employee' ? 'Mijn klussen' : n.label}</span>
                {locked && <Lock className="size-3.5 text-navy-400" />}
                {n.to === '/app/notifications' && unreadNotifications > 0 && (
                  <span className="rounded-full bg-emerald-500 px-1.5 text-xs font-semibold text-white">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>
                )}
              </>)}
            </NavLink>
          );
        })}
      </nav>
      {user.role !== 'employee' && company && (
        <div className="space-y-1 border-t border-white/10 p-3">
          <a href={`/book/${company.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-300 transition hover:bg-white/5 hover:text-white">
            <ExternalLink className="size-4" /> Openbare boekingspagina
          </a>
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { unreadNotifications, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    api.get('/notifications').then((d) => setItems(d.notifications.slice(0, 8))).catch(() => setItems([]));
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    refresh();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative inline-flex size-10 items-center justify-center rounded-xl text-navy-500 transition hover:bg-navy-50 hover:text-navy-900" aria-label="Meldingen">
        <Bell className="size-5" />
        {unreadNotifications > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-slide-up overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <p className="font-semibold">Meldingen</p>
            {unreadNotifications > 0 && (
              <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-700" onClick={async () => {
                await api.post('/notifications/read-all'); refresh(); setItems((xs) => xs?.map((x) => ({ ...x, is_read: 1 })));
              }}>Alles gelezen</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? <p className="p-4 text-sm text-navy-400">Laden…</p>
              : items.length === 0 ? <p className="p-6 text-center text-sm text-navy-400">Je bent helemaal bij.</p>
                : items.map((n) => (
                  <button key={n.id} onClick={() => openItem(n)} className="flex w-full gap-3 border-b border-navy-50 px-4 py-3 text-left transition last:border-0 hover:bg-navy-50/60">
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-emerald-500')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy-800">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-navy-400">{n.body}</span>}
                      <span className="text-xs text-navy-300">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                ))}
          </div>
          <Link to="/app/notifications" onClick={() => setOpen(false)} className="block border-t border-navy-100 py-2.5 text-center text-sm font-semibold text-emerald-600 hover:bg-navy-50/50">Alles bekijken</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl py-1 pr-2 pl-1 transition hover:bg-navy-50" aria-label="Accountmenu">
        <Avatar name={user.name} color="#10b981" size="size-8" />
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-semibold text-navy-800">{user.name}</span>
          <span className="block text-xs leading-tight text-navy-400">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="hidden size-4 text-navy-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 animate-slide-up overflow-hidden rounded-2xl border border-navy-100 bg-white py-1.5 shadow-soft">
          <div className="border-b border-navy-100 px-4 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-navy-400">{user.email}</p>
          </div>
          <Link to="/app/settings?tab=account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy-600 hover:bg-navy-50"><Settings className="size-4" />Accountinstellingen</Link>
          <button onClick={async () => { await logout(); navigate('/login'); }} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="size-4" />Uitloggen</button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { company, subscription, refresh } = useAuth();
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  // Keep the unread badge fresh.
  useEffect(() => { const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  const daysLeft = subscription?.trialEndsAt ? Math.ceil((new Date(subscription.trialEndsAt) - Date.now()) / 864e5) : null;

  return (
    <div className="min-h-screen bg-navy-50/60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72 max-w-[85vw] animate-slide-up">
            <button className="absolute top-4 -right-12 rounded-full bg-white/10 p-2 text-white" onClick={() => setMobileOpen(false)} aria-label="Menu sluiten"><X className="size-5" /></button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-navy-100 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-navy-600 hover:bg-navy-50 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu openen"><Menu className="size-5" /></button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {company?.is_demo ? <Badge color="amber">Demo-omgeving – voorbeeldgegevens</Badge> : null}
            {subscription?.status === 'trialing' && !company?.is_demo && daysLeft !== null && (
              <Link to="/app/settings?tab=billing"><Badge color={subscription.trialExpired ? 'red' : 'emerald'}>{subscription.trialExpired ? 'Proefperiode verlopen' : `Proefperiode · nog ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dagen'}`}</Badge></Link>
            )}
          </div>
          <NotificationBell />
          <UserMenu />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div key={location.pathname} className="animate-slide-up"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
