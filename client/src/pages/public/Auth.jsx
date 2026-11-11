import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailCheck, ShieldCheck, CalendarCheck, Bot } from 'lucide-react';
import Logo from '../../components/Logo.jsx';
import { Button, Input, Checkbox, Select, PageLoader, useForm } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/context.jsx';
import { PLANS } from '../../lib/plans.js';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Link to="/" className="self-start"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-navy-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-navy-500">{footer}</div>}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(40rem_30rem_at_80%_20%,rgba(16,185,129,0.3),transparent)]" />
        <div className="relative flex h-full flex-col justify-center px-16 text-white">
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">Je hele schoonmaakbedrijf overzichtelijk op één plek.</h2>
          <ul className="mt-10 space-y-5">
            {[[CalendarCheck, 'Online boeken zonder dubbele boekingen'], [Bot, 'AI-klantenservice op basis van je eigen gegevens'], [ShieldCheck, 'Een privé, beveiligde omgeving voor je bedrijf']].map(([Icon, t]) => (
              <li key={t} className="flex items-center gap-4 text-navy-200"><span className="flex size-10 items-center justify-center rounded-xl bg-white/10"><Icon className="size-5 text-emerald-400" /></span>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Login() {
  const { values, set, errors, applyServerError } = useForm({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await api.post('/auth/login', values);
      setSession(data);
      const next = params.get('next');
      navigate(next && next.startsWith('/app') ? next : '/app', { replace: true });
    } catch (err) {
      applyServerError(err); setError(err.message);
    } finally { setLoading(false); }
  };
  const fillDemo = (email) => set('email')(email) || set('password')('Demo1234');

  return (
    <Shell title="Welkom terug" subtitle="Log in op je CLEANFLOW-account." footer={<>Nieuw bij CLEANFLOW? <Link to="/signup" className="font-semibold text-emerald-600 hover:underline">Probeer het 14 dagen gratis</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <Input label="E-mailadres" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} required />
        <div>
          <Input label="Wachtwoord" type="password" autoComplete="current-password" value={values.password} onChange={set('password')} error={errors.password} required />
          <div className="mt-2 text-right"><Link to="/forgot-password" className="text-sm font-medium text-emerald-600 hover:underline">Wachtwoord vergeten?</Link></div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>Inloggen</Button>
      </form>
      <div className="mt-8 rounded-2xl border border-dashed border-navy-200 p-4">
        <p className="text-xs font-semibold tracking-wide text-navy-400 uppercase">Bekijk de demo-omgeving</p>
        <p className="mt-1 text-xs text-navy-400">Voorbeeldbedrijf met demogegevens. Wachtwoord: Demo1234</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[['Eigenaar', 'demo@cleanflow.app'], ['Manager', 'manager@cleanflow.app'], ['Medewerker', 'employee@cleanflow.app']].map(([r, em]) => (
            <Button key={r} size="sm" variant="secondary" onClick={() => fillDemo(em)}>{r}</Button>
          ))}
          <Button size="sm" href="/book/sparkle-shine-demo">Klant (afspraak boeken)</Button>
        </div>
        <p className="mt-2 text-xs text-navy-400">Als klant hoef je niet in te loggen: je boekt direct op de boekingspagina.</p>
      </div>
    </Shell>
  );
}

function Signup() {
  const [params] = useSearchParams();
  const initialPlan = PLANS.some((p) => p.id === params.get('plan')) ? params.get('plan') : 'professional';
  const { values, set, errors, applyServerError } = useForm({ companyName: '', name: '', email: '', password: '', plan: initialPlan, acceptTerms: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSession } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await api.post('/auth/signup', values);
      setSession(data);
      navigate('/app?welcome=1', { replace: true });
    } catch (err) {
      applyServerError(err); setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <Shell title="Probeer CLEANFLOW gratis" subtitle="14 dagen gratis. Geen creditcard nodig." footer={<>Heb je al een account? <Link to="/login" className="font-semibold text-emerald-600 hover:underline">Inloggen</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <Input label="Bedrijfsnaam" value={values.companyName} onChange={set('companyName')} error={errors.companyName} autoComplete="organization" required />
        <Input label="Je naam" value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
        <Input label="Zakelijk e-mailadres" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
        <Input label="Wachtwoord" type="password" value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" hint="Minimaal 8 tekens, met een letter en een cijfer." required />
        <Select label="Abonnement voor je proefperiode" value={values.plan} onChange={set('plan')}>
          {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} – €{p.price}/maand na de proefperiode</option>)}
        </Select>
        <Checkbox checked={values.acceptTerms} onChange={set('acceptTerms')}
          label={<>Ik ga akkoord met de <a href="/legal/terms" target="_blank" className="font-medium text-emerald-600 hover:underline">algemene voorwaarden</a> en het <a href="/legal/privacy" target="_blank" className="font-medium text-emerald-600 hover:underline">privacybeleid</a>.</>} />
        {errors.acceptTerms && <p className="text-xs font-medium text-red-600">{errors.acceptTerms}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>Account aanmaken</Button>
      </form>
    </Shell>
  );
}

function Forgot() {
  const { values, set, errors, applyServerError } = useForm({ email: '' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try { await api.post('/auth/forgot-password', values); setSent(true); } catch (err) { applyServerError(err); toast.error(err.message); } finally { setLoading(false); }
  };
  return (
    <Shell title="Wachtwoord herstellen" subtitle="Vul je e-mailadres in, dan sturen we je een link om een nieuw wachtwoord te kiezen." footer={<Link to="/login" className="font-semibold text-emerald-600 hover:underline">Terug naar inloggen</Link>}>
      {sent ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <MailCheck className="mx-auto size-10 text-emerald-500" />
          <p className="mt-3 font-semibold">Kijk in je mailbox</p>
          <p className="mt-1 text-sm text-navy-500">Als er een account bestaat voor {values.email}, is er een link naar je onderweg. Die is één uur geldig.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input label="E-mailadres" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
          <Button type="submit" size="lg" className="w-full" loading={loading}>Link versturen</Button>
        </form>
      )}
    </Shell>
  );
}

function SetPassword({ mode }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { values, set, errors, setErrors, applyServerError } = useForm({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invite, setInvite] = useState(mode === 'invite' ? undefined : null);
  const [error, setError] = useState('');
  const { setSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode !== 'invite') return;
    api.get(`/auth/invite?token=${encodeURIComponent(token)}`).then(setInvite).catch((e) => { setInvite(null); setError(e.message); });
  }, [mode, token]);

  const submit = async (e) => {
    e.preventDefault();
    if (values.password !== values.confirm) return setErrors({ confirm: 'De wachtwoorden zijn niet hetzelfde' });
    setLoading(true); setError('');
    try {
      if (mode === 'invite') {
        const data = await api.post('/auth/accept-invite', { token, password: values.password });
        setSession(data);
        navigate('/app', { replace: true });
      } else {
        await api.post('/auth/reset-password', { token, password: values.password });
        setDone(true);
      }
    } catch (err) { applyServerError(err); setError(err.message); } finally { setLoading(false); }
  };

  if (invite === undefined) return <PageLoader />;
  if (done) {
    return (
      <Shell title="Wachtwoord gewijzigd">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
          <p className="mt-3 text-sm text-navy-600">Je wachtwoord is gewijzigd en je bent op alle apparaten uitgelogd.</p>
          <Button to="/login" className="mt-5">Inloggen</Button>
        </div>
      </Shell>
    );
  }
  const title = mode === 'invite' ? (invite ? `Welkom bij ${invite.company}` : 'Uitnodiging') : 'Kies een nieuw wachtwoord';
  const subtitle = mode === 'invite' && invite ? `Je bent uitgenodigd als ${{ owner: 'eigenaar', manager: 'manager', employee: 'medewerker' }[invite.role]}. Kies een wachtwoord voor ${invite.email}.` : undefined;
  return (
    <Shell title={title} subtitle={subtitle}>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {(mode !== 'invite' || invite) && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input label="Nieuw wachtwoord" type="password" value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" hint="Minimaal 8 tekens, met een letter en een cijfer." />
          <Input label="Herhaal wachtwoord" type="password" value={values.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" size="lg" className="w-full" loading={loading}>{mode === 'invite' ? 'Account activeren' : 'Wachtwoord opslaan'}</Button>
        </form>
      )}
      {mode !== 'invite' && <p className="mt-6 text-center text-sm"><Link to="/forgot-password" className="font-semibold text-emerald-600 hover:underline">Nieuwe link aanvragen</Link></p>}
    </Shell>
  );
}

export default function AuthPages({ mode }) {
  if (mode === 'login') return <Login />;
  if (mode === 'signup') return <Signup />;
  if (mode === 'forgot') return <Forgot />;
  return <SetPassword mode={mode} />;
}
