import { useState } from 'react';
import {
  ArrowRight, CalendarCheck, Users, UserCog, Bot, BarChart3, BellRing, ShieldCheck, Clock, TrendingUp, Smile, Sparkles,
  ChevronDown, Mail, MapPin, Send, CheckCircle2, Quote, LayoutDashboard, MessageSquareText,
} from 'lucide-react';
import { MarketingNav, MarketingFooter, PricingCards } from '../../components/Marketing.jsx';
import { Button, Input, Textarea, cx, useForm } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/context.jsx';

const FEATURES = [
  { icon: CalendarCheck, title: 'Online booking', text: 'A branded booking page that only offers times your team can actually take. No double bookings, ever.' },
  { icon: Users, title: 'Customer management', text: 'Profiles, addresses, notes, booking history and lifetime spend – searchable in seconds.' },
  { icon: UserCog, title: 'Team scheduling', text: 'Work schedules, availability and job assignment, with role-based access for managers and cleaners.' },
  { icon: Bot, title: 'AI customer support', text: 'An assistant that answers from your verified prices, hours and FAQs – and hands over to you when it should.' },
  { icon: BarChart3, title: 'Analytics & revenue', text: 'Revenue, bookings, popular services and team performance with date filters and CSV exports.' },
  { icon: BellRing, title: 'Automated notifications', text: 'Confirmations, reminders, cancellations and assignment alerts by email and SMS.' },
];

const STEPS = [
  ['Set up your workspace', 'Add your services, prices, opening hours and team. Sensible defaults get you live in minutes.'],
  ['Share your booking page', 'Customers pick a service and a real available time slot. Requests land in your dashboard instantly.'],
  ['Confirm and assign', 'Accept requests, assign a cleaner and let CLEANFLOW send confirmations and reminders.'],
  ['Grow with insight', 'Track revenue and team activity, and let the AI assistant handle routine questions around the clock.'],
];

const BENEFITS = [
  { icon: Clock, title: 'Hours back every week', text: 'Stop juggling calendars, spreadsheets and chat apps. Everything lives in one place.' },
  { icon: ShieldCheck, title: 'Private and secure', text: 'Every company has an isolated workspace. Team members only see what their role allows.' },
  { icon: TrendingUp, title: 'More bookings, fewer gaps', text: 'Customers can book any time of day, and your capacity is filled without overbooking.' },
  { icon: Smile, title: 'Happier customers', text: 'Fast answers, clear confirmations and timely reminders make your company easy to work with.' },
];

const SHOTS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, img: '/screenshots/dashboard.png', caption: 'Revenue, bookings, team availability and activity at a glance.' },
  { id: 'bookings', label: 'Bookings', icon: CalendarCheck, img: '/screenshots/bookings.png', caption: 'Accept, reschedule, assign and track every job.' },
  { id: 'assistant', label: 'AI assistant', icon: MessageSquareText, img: '/screenshots/assistant.png', caption: 'Configure your assistant and test it against your own company data.' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, img: '/screenshots/analytics.png', caption: 'Understand what drives your revenue.' },
];

const TESTIMONIALS = [
  { quote: 'We used to confirm every booking by phone. Now requests come in with the right time slot and I confirm them with one click.', name: 'Demo owner A', role: 'Home cleaning company, 6 cleaners' },
  { quote: 'The team view finally shows who is free today. Assigning jobs takes seconds instead of a round of messages.', name: 'Demo manager B', role: 'Office cleaning company, 14 staff' },
  { quote: 'The assistant answers pricing questions in the evening and passes anything unusual to us the next morning.', name: 'Demo owner C', role: 'Window & move-out specialist' },
];

const FAQS = [
  ['Is there a free trial?', 'Yes. Every plan starts with a 14-day free trial. You can explore all features of your chosen plan before deciding.'],
  ['How does CLEANFLOW prevent double bookings?', 'Availability is calculated from your opening hours, each employee\'s work schedule and existing jobs. Every booking is re-checked on the server at the moment it is saved, so two customers can never take the same last slot.'],
  ['Will the AI assistant make up prices or promises?', 'No. The assistant only uses the services, prices, opening hours, FAQs and policies you enter. When something is not covered, it says so and escalates the conversation to your team.'],
  ['Can my cleaners log in?', 'Yes. Invite team members as managers or employees. Employees only see the jobs assigned to them and can mark them as started or completed.'],
  ['Is my data separated from other companies?', 'Yes. Each company has its own private workspace and every request is scoped to it on the server.'],
  ['Can I export my data?', 'The Business plan includes CSV exports of bookings, payments and customers.'],
];

function Section({ id, eyebrow, title, text, children, className }) {
  return (
    <section id={id} className={cx('scroll-mt-20 py-20 sm:py-24', className)}>
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && <p className="text-sm font-semibold tracking-wide text-emerald-600 uppercase">{eyebrow}</p>}
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">{title}</h2>
          {text && <p className="mt-4 text-lg text-navy-500">{text}</p>}
        </div>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}

function Screenshot({ src, alt, className }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-soft', className)}>
      <div className="flex items-center gap-1.5 border-b border-navy-100 bg-navy-50/70 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-300" /><span className="size-2.5 rounded-full bg-amber-300" /><span className="size-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-xs text-navy-400">app.cleanflow / {alt.toLowerCase()}</span>
      </div>
      {failed ? (
        <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-navy-50 to-emerald-50 text-navy-400"><Sparkles className="mr-2 size-5" />{alt}</div>
      ) : (
        <img src={src} alt={`CLEANFLOW ${alt} screenshot (demo data)`} className="block w-full" loading="lazy" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function ContactForm() {
  const { values, set, errors, applyServerError, setValues } = useForm({ name: '', email: '', company: '', message: '', website: '' });
  const [state, setState] = useState('idle');
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    try {
      await api.post('/public/contact', values);
      setState('sent');
      setValues({ name: '', email: '', company: '', message: '', website: '' });
    } catch (err) {
      applyServerError(err);
      toast.error(err.message);
      setState('idle');
    }
  };
  if (state === 'sent') {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center">
        <CheckCircle2 className="size-10 text-emerald-500" />
        <h3 className="mt-3 text-lg font-semibold">Thanks, we received your message</h3>
        <p className="mt-1 text-sm text-navy-500">We'll get back to you by email.</p>
        <Button variant="secondary" className="mt-5" onClick={() => setState('idle')}>Send another message</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" value={values.name} onChange={set('name')} error={errors.name} required autoComplete="name" />
        <Input label="Email" type="email" value={values.email} onChange={set('email')} error={errors.email} required autoComplete="email" />
      </div>
      <Input label="Company (optional)" value={values.company} onChange={set('company')} error={errors.company} autoComplete="organization" />
      <Textarea label="How can we help?" rows={4} value={values.message} onChange={set('message')} error={errors.message} />
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={values.website} onChange={set('website')} aria-hidden="true" />
      <Button type="submit" size="lg" icon={Send} loading={state === 'sending'} className="w-full">Send message</Button>
    </form>
  );
}

export default function Landing() {
  const [shot, setShot] = useState('dashboard');
  const [openFaq, setOpenFaq] = useState(0);
  const active = SHOTS.find((s) => s.id === shot);
  return (
    <div className="bg-white">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_70%_-10%,rgba(16,185,129,0.14),transparent),radial-gradient(40rem_20rem_at_0%_10%,rgba(11,27,58,0.06),transparent)]" />
        <div className="container-x relative pt-16 pb-20 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <a href="#features" className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
              <Sparkles className="size-3.5" /> Built for professional cleaning companies
            </a>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-navy-900 sm:text-6xl sm:leading-[1.05]">
              Run Your Cleaning Business <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Smarter.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-navy-500 sm:text-xl">Manage bookings, customers, employees and customer support in one powerful platform.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to="/signup" size="lg" className="group">Start Free <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></Button>
              <Button href="#features" size="lg" variant="secondary">Explore Features</Button>
            </div>
            <p className="mt-4 text-sm text-navy-400">14-day free trial · No credit card required</p>
          </div>
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="absolute -inset-x-8 -top-8 -bottom-8 rounded-[2.5rem] bg-gradient-to-b from-emerald-100/60 to-transparent blur-2xl" />
            <Screenshot src="/screenshots/dashboard.png" alt="Dashboard" className="relative" />
          </div>
        </div>
      </section>

      {/* Features */}
      <Section id="features" eyebrow="Features" title="Everything your cleaning company runs on" text="From the first customer question to the final invoice, CLEANFLOW keeps the whole operation in one place.">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group card p-7 transition hover:-translate-y-1 hover:shadow-soft">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-500 group-hover:text-white"><f.icon className="size-6" /></div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" eyebrow="How it works" title="Up and running in an afternoon" className="bg-navy-50/60">
        <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="relative card p-7">
              <span className="flex size-10 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Benefits */}
      <Section eyebrow="Benefits" title="Why cleaning companies choose CLEANFLOW">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="grid gap-6 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title}>
                <b.icon className="size-7 text-emerald-500" />
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{b.text}</p>
              </div>
            ))}
          </div>
          <div className="rounded-3xl bg-navy-900 p-8 text-white shadow-soft sm:p-10">
            <Bot className="size-9 text-emerald-400" />
            <h3 className="mt-4 text-2xl font-bold">An assistant that knows when to say “let me check”.</h3>
            <p className="mt-3 text-navy-300">Your AI assistant answers from the prices, hours, services and policies you have verified. It never invents prices or availability, and escalates complaints, custom quotes and anything uncertain to your team.</p>
            <ul className="mt-6 space-y-2.5 text-sm text-navy-200">
              {['Answers FAQs, prices and opening hours', 'Guides customers to real available slots', 'Collects contact details only with consent', 'Hands off to a human with full context'].map((x) => (
                <li key={x} className="flex gap-2.5"><CheckCircle2 className="size-5 shrink-0 text-emerald-400" />{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Screenshots */}
      <Section id="product" eyebrow="Product tour" title="See CLEANFLOW in action" text="Real screens from the CLEANFLOW app, shown with demo data." className="bg-navy-50/60">
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {SHOTS.map((s) => (
            <button key={s.id} onClick={() => setShot(s.id)} className={cx('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
              shot === s.id ? 'bg-navy-900 text-white' : 'bg-white text-navy-500 shadow-card hover:text-navy-900')}>
              <s.icon className="size-4" />{s.label}
            </button>
          ))}
        </div>
        <div className="mx-auto max-w-5xl">
          <Screenshot key={active.id} src={active.img} alt={active.label} className="animate-fade-in" />
          <p className="mt-4 text-center text-sm text-navy-500">{active.caption}</p>
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" eyebrow="Pricing" title="Simple pricing that grows with you" text="Start with a 14-day free trial. Upgrade, downgrade or cancel at any time.">
        <PricingCards />
      </Section>

      {/* Testimonials */}
      <Section eyebrow="Testimonials" title="What teams like yours could say" className="bg-navy-50/60">
        <p className="-mt-8 mb-10 text-center text-xs font-medium text-navy-400">Demo content: these are illustrative example testimonials, not quotes from real customers.</p>
        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="card flex flex-col p-7">
              <Quote className="size-7 text-emerald-300" />
              <blockquote className="mt-4 flex-1 text-navy-700">“{t.quote}”</blockquote>
              <figcaption className="mt-6 border-t border-navy-100 pt-4">
                <p className="text-sm font-semibold">{t.name} <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 uppercase">Demo</span></p>
                <p className="text-xs text-navy-400">{t.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Frequently asked questions">
        <div className="mx-auto max-w-3xl divide-y divide-navy-100 rounded-2xl border border-navy-100">
          {FAQS.map(([q, a], i) => (
            <div key={q}>
              <button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                <span className="font-semibold text-navy-800">{q}</span>
                <ChevronDown className={cx('size-5 shrink-0 text-navy-400 transition', openFaq === i && 'rotate-180')} />
              </button>
              {openFaq === i && <p className="animate-fade-in px-6 pb-5 text-sm leading-relaxed text-navy-500">{a}</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* Contact */}
      <Section id="contact" eyebrow="Contact" title="Talk to us" text="Questions about CLEANFLOW or switching from another tool? Send us a message." className="bg-navy-50/60">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-card"><Mail className="size-5" /></span>
              <div><p className="font-semibold">Email</p><p className="text-sm text-navy-500">Use the form and we'll reply by email, usually within one business day.</p></div></div>
            <div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-card"><MapPin className="size-5" /></span>
              <div><p className="font-semibold">Try the demo</p><p className="text-sm text-navy-500">See the customer side: <a className="font-medium text-emerald-600 hover:underline" href="/book/sparkle-shine-demo">open the demo booking page</a>.</p></div></div>
          </div>
          <div className="lg:col-span-3"><ContactForm /></div>
        </div>
      </Section>

      {/* CTA */}
      <section className="py-20">
        <div className="container-x">
          <div className="relative overflow-hidden rounded-3xl bg-navy-900 px-8 py-14 text-center sm:px-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_120%,rgba(16,185,129,0.35),transparent)]" />
            <h2 className="relative text-3xl font-extrabold text-white sm:text-4xl">Ready to run your business smarter?</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-navy-300">Create your workspace in under two minutes. Your 14-day trial starts today.</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to="/signup" size="lg">Start Free</Button>
              <Button to="/login" size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:border-white/30">Log in</Button>
            </div>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
