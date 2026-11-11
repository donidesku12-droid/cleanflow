import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Menu, X } from 'lucide-react';
import Logo from './Logo.jsx';
import { Button, cx } from './ui.jsx';
import { PLANS } from '../lib/plans.js';
import { useAuth } from '../lib/context.jsx';

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const links = [['Features', '/#features'], ['How it works', '/#how-it-works'], ['Pricing', '/pricing'], ['FAQ', '/#faq'], ['Contact', '/#contact']];
  return (
    <header className="sticky top-0 z-40 border-b border-navy-100/70 bg-white/85 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Link to="/" aria-label="CLEANFLOW home"><Logo /></Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {links.map(([label, href]) => <a key={label} href={href} className="text-sm font-medium text-navy-500 transition hover:text-navy-900">{label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? <Button to="/app">Open dashboard</Button> : (<>
            <Button variant="ghost" to="/login">Log in</Button>
            <Button to="/signup">Start Free</Button>
          </>)}
        </div>
        <button className="rounded-lg p-2 text-navy-700 md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      </div>
      {open && (
        <div className="animate-slide-up border-t border-navy-100 bg-white px-4 pt-2 pb-4 md:hidden">
          {links.map(([label, href]) => <a key={label} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-navy-600 hover:bg-navy-50">{label}</a>)}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {user ? <Button to="/app" className="col-span-2">Open dashboard</Button> : (<>
              <Button variant="secondary" to="/login">Log in</Button><Button to="/signup">Start Free</Button>
            </>)}
          </div>
        </div>
      )}
    </header>
  );
}

export function PricingCards() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLANS.map((p) => (
        <div key={p.id} className={cx('relative flex flex-col rounded-3xl border bg-white p-7 transition hover:-translate-y-1',
          p.popular ? 'border-emerald-500 shadow-glow ring-1 ring-emerald-500' : 'border-navy-100 shadow-card hover:shadow-soft')}>
          {p.popular && <span className="absolute -top-3 left-7 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
          <h3 className="text-sm font-bold tracking-widest text-navy-400 uppercase">{p.name}</h3>
          <p className="mt-4 flex items-baseline gap-1"><span className="text-5xl font-extrabold tracking-tight">€{p.price}</span><span className="text-navy-400">/month</span></p>
          <p className="mt-3 text-sm text-navy-500">{p.tagline}</p>
          <ul className="mt-6 flex-1 space-y-3">
            {p.features.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-navy-700"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />{f}</li>
            ))}
          </ul>
          <Button to={`/signup?plan=${p.id}`} variant={p.popular ? 'primary' : 'dark'} size="lg" className="mt-8 w-full">Start 14-day free trial</Button>
        </div>
      ))}
    </div>
  );
}

export function MarketingFooter() {
  const cols = [
    ['Product', [['Features', '/#features'], ['Pricing', '/pricing'], ['Live demo booking page', '/book/sparkle-shine-demo'], ['Log in', '/login']]],
    ['Company', [['How it works', '/#how-it-works'], ['FAQ', '/#faq'], ['Contact', '/#contact']]],
    ['Legal', [['Terms of Service', '/legal/terms'], ['Privacy Policy', '/legal/privacy'], ['Cookie Policy', '/legal/cookies'], ['Security', '/legal/security']]],
  ];
  return (
    <footer className="bg-navy-950 text-navy-300">
      <div className="container-x grid gap-10 py-14 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-navy-400">The all-in-one platform for professional cleaning companies. Bookings, customers, teams and support in one calm place.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <h4 className="text-sm font-semibold text-white">{title}</h4>
            <ul className="mt-4 space-y-2.5">
              {links.map(([label, href]) => <li key={label}><a href={href} className="text-sm text-navy-400 transition hover:text-white">{label}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-navy-500 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} CLEANFLOW. All rights reserved.</p>
          <p>Prices exclude VAT. Billed monthly, cancel anytime.</p>
        </div>
      </div>
    </footer>
  );
}
