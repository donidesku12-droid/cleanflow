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
  { icon: CalendarCheck, title: 'Online boeken', text: 'Een eigen boekingspagina die alleen tijden toont waarop je team echt kan. Nooit meer dubbele boekingen.' },
  { icon: Users, title: 'Klantenbeheer', text: 'Profielen, adressen, notities, boekingsgeschiedenis en totale besteding – in seconden doorzoekbaar.' },
  { icon: UserCog, title: 'Personeelsplanning', text: 'Werkroosters, beschikbaarheid en klussen toewijzen, met aparte rechten voor managers en schoonmakers.' },
  { icon: Bot, title: 'AI-klantenservice', text: 'Een assistent die antwoordt op basis van jouw prijzen, openingstijden en veelgestelde vragen – en doorverwijst naar jou wanneer dat nodig is.' },
  { icon: BarChart3, title: 'Analyses & omzet', text: 'Omzet, boekingen, populaire diensten en teamprestaties, met datumfilters en CSV-export.' },
  { icon: BellRing, title: 'Automatische meldingen', text: 'Bevestigingen, herinneringen, annuleringen en nieuwe klussen via e-mail en sms.' },
];

const STEPS = [
  ['Richt je omgeving in', 'Voeg je diensten, prijzen, openingstijden en team toe. Met slimme standaardinstellingen ben je binnen minuten live.'],
  ['Deel je boekingspagina', 'Klanten kiezen een dienst en een tijd die echt vrij is. Aanvragen komen direct binnen in je dashboard.'],
  ['Bevestig en wijs toe', 'Accepteer aanvragen, wijs een schoonmaker toe en laat CLEANFLOW bevestigingen en herinneringen versturen.'],
  ['Groei met inzicht', 'Volg je omzet en teamactiviteit, en laat de AI-assistent dag en nacht standaardvragen beantwoorden.'],
];

const BENEFITS = [
  { icon: Clock, title: 'Elke week uren terug', text: 'Geen gedoe meer met agenda\'s, spreadsheets en appjes. Alles staat op één plek.' },
  { icon: ShieldCheck, title: 'Privé en veilig', text: 'Elk bedrijf heeft een eigen afgeschermde omgeving. Teamleden zien alleen wat bij hun rol hoort.' },
  { icon: TrendingUp, title: 'Meer boekingen, minder gaten', text: 'Klanten boeken op elk moment van de dag, en je planning raakt vol zonder overboeking.' },
  { icon: Smile, title: 'Tevredener klanten', text: 'Snelle antwoorden, duidelijke bevestigingen en herinneringen op tijd maken je bedrijf prettig om mee te werken.' },
];

const SHOTS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, img: '/screenshots/dashboard.png', caption: 'Omzet, boekingen, beschikbaarheid van je team en activiteit in één oogopslag.' },
  { id: 'bookings', label: 'Boekingen', icon: CalendarCheck, img: '/screenshots/bookings.png', caption: 'Accepteer, verzet, wijs toe en volg elke klus.' },
  { id: 'assistant', label: 'AI-assistent', icon: MessageSquareText, img: '/screenshots/assistant.png', caption: 'Stel je assistent in en test hem met je eigen bedrijfsgegevens.' },
  { id: 'analytics', label: 'Analyses', icon: BarChart3, img: '/screenshots/analytics.png', caption: 'Zie waar je omzet vandaan komt.' },
];

const TESTIMONIALS = [
  { quote: 'Vroeger bevestigden we elke boeking telefonisch. Nu komen aanvragen binnen met de juiste tijd en bevestig ik ze met één klik.', name: 'Demo-eigenaar A', role: 'Huishoudelijke schoonmaak, 6 schoonmakers' },
  { quote: 'In het teamoverzicht zie ik eindelijk wie er vandaag vrij is. Klussen toewijzen kost seconden in plaats van een rondje appjes.', name: 'Demo-manager B', role: 'Kantoorschoonmaak, 14 medewerkers' },
  { quote: 'De assistent beantwoordt \'s avonds vragen over prijzen en geeft alles wat bijzonder is de volgende ochtend aan ons door.', name: 'Demo-eigenaar C', role: 'Specialist glas- & opleverschoonmaak' },
];

const FAQS = [
  ['Is er een gratis proefperiode?', 'Ja. Elk abonnement begint met 14 dagen gratis. Je kunt alle functies van je gekozen abonnement uitproberen voordat je beslist.'],
  ['Hoe voorkomt CLEANFLOW dubbele boekingen?', 'De beschikbaarheid wordt berekend op basis van je openingstijden, het rooster van elke medewerker en bestaande klussen. Elke boeking wordt op het moment van opslaan opnieuw gecontroleerd, dus twee klanten kunnen nooit hetzelfde laatste tijdslot krijgen.'],
  ['Verzint de AI-assistent prijzen of beloftes?', 'Nee. De assistent gebruikt alleen de diensten, prijzen, openingstijden, veelgestelde vragen en voorwaarden die jij invult. Weet hij iets niet, dan zegt hij dat en stuurt hij het gesprek door naar je team.'],
  ['Kunnen mijn schoonmakers inloggen?', 'Ja. Nodig teamleden uit als manager of medewerker. Medewerkers zien alleen hun eigen klussen en kunnen die starten en afronden.'],
  ['Zijn mijn gegevens gescheiden van andere bedrijven?', 'Ja. Elk bedrijf heeft een eigen afgeschermde omgeving, en de server controleert bij elk verzoek dat je alleen bij je eigen gegevens kunt.'],
  ['Kan ik mijn gegevens exporteren?', 'Met het Business-abonnement exporteer je boekingen, betalingen en klanten als CSV-bestand.'],
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
        <img src={src} alt={`Schermafbeelding CLEANFLOW ${alt} (demogegevens)`} className="block w-full" loading="lazy" onError={() => setFailed(true)} />
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
        <h3 className="mt-3 text-lg font-semibold">Bedankt, we hebben je bericht ontvangen</h3>
        <p className="mt-1 text-sm text-navy-500">We nemen per e-mail contact met je op.</p>
        <Button variant="secondary" className="mt-5" onClick={() => setState('idle')}>Nog een bericht sturen</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Je naam" value={values.name} onChange={set('name')} error={errors.name} required autoComplete="name" />
        <Input label="E-mailadres" type="email" value={values.email} onChange={set('email')} error={errors.email} required autoComplete="email" />
      </div>
      <Input label="Bedrijf (optioneel)" value={values.company} onChange={set('company')} error={errors.company} autoComplete="organization" />
      <Textarea label="Waarmee kunnen we je helpen?" rows={4} value={values.message} onChange={set('message')} error={errors.message} />
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={values.website} onChange={set('website')} aria-hidden="true" />
      <Button type="submit" size="lg" icon={Send} loading={state === 'sending'} className="w-full">Bericht versturen</Button>
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
              <Sparkles className="size-3.5" /> Gemaakt voor professionele schoonmaakbedrijven
            </a>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-navy-900 sm:text-6xl sm:leading-[1.05]">
              Run je schoonmaakbedrijf <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">slimmer.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-navy-500 sm:text-xl">Beheer boekingen, klanten, medewerkers en klantenservice in één krachtig platform.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to="/signup" size="lg" className="group">Gratis starten <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></Button>
              <Button href="#features" size="lg" variant="secondary">Bekijk de functies</Button>
            </div>
            <p className="mt-4 text-sm text-navy-400">14 dagen gratis · Geen creditcard nodig</p>
          </div>
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="absolute -inset-x-8 -top-8 -bottom-8 rounded-[2.5rem] bg-gradient-to-b from-emerald-100/60 to-transparent blur-2xl" />
            <Screenshot src="/screenshots/dashboard.png" alt="Dashboard" className="relative" />
          </div>
        </div>
      </section>

      {/* Features */}
      <Section id="features" eyebrow="Functies" title="Alles waar je schoonmaakbedrijf op draait" text="Van de eerste vraag van een klant tot de laatste betaling: met CLEANFLOW heb je alles op één plek.">
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
      <Section id="how-it-works" eyebrow="Hoe het werkt" title="In één middag aan de slag" className="bg-navy-50/60">
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
      <Section eyebrow="Voordelen" title="Waarom schoonmaakbedrijven voor CLEANFLOW kiezen">
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
            <h3 className="mt-4 text-2xl font-bold">Een assistent die weet wanneer hij moet zeggen: “ik vraag het even na”.</h3>
            <p className="mt-3 text-navy-300">Je AI-assistent antwoordt op basis van de prijzen, openingstijden, diensten en voorwaarden die jij hebt ingevuld. Hij verzint nooit prijzen of beschikbaarheid, en stuurt klachten, offerteaanvragen en alles waar hij niet zeker van is door naar je team.</p>
            <ul className="mt-6 space-y-2.5 text-sm text-navy-200">
              {['Beantwoordt vragen over prijzen en openingstijden', 'Wijst klanten op tijden die echt vrij zijn', 'Vraagt contactgegevens alleen met toestemming', 'Draagt het gesprek over aan een mens, met alle context'].map((x) => (
                <li key={x} className="flex gap-2.5"><CheckCircle2 className="size-5 shrink-0 text-emerald-400" />{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Screenshots */}
      <Section id="product" eyebrow="Rondleiding" title="Bekijk CLEANFLOW in actie" text="Echte schermen uit de CLEANFLOW-app, met demogegevens." className="bg-navy-50/60">
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
      <Section id="pricing" eyebrow="Prijzen" title="Eenvoudige prijzen die met je meegroeien" text="Begin met 14 dagen gratis. Op elk moment upgraden, downgraden of opzeggen.">
        <PricingCards />
      </Section>

      {/* Testimonials */}
      <Section eyebrow="Ervaringen" title="Wat teams zoals het jouwe zouden kunnen zeggen" className="bg-navy-50/60">
        <p className="-mt-8 mb-10 text-center text-xs font-medium text-navy-400">Demo-inhoud: dit zijn voorbeelden ter illustratie, geen citaten van echte klanten.</p>
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
      <Section id="faq" eyebrow="Veelgestelde vragen" title="Veelgestelde vragen">
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
      <Section id="contact" eyebrow="Contact" title="Neem contact op" text="Vragen over CLEANFLOW, of overstappen van een ander programma? Stuur ons een bericht." className="bg-navy-50/60">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-card"><Mail className="size-5" /></span>
              <div><p className="font-semibold">E-mail</p><p className="text-sm text-navy-500">Gebruik het formulier en we reageren per e-mail, meestal binnen één werkdag.</p></div></div>
            <div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-card"><MapPin className="size-5" /></span>
              <div><p className="font-semibold">Probeer de demo</p><p className="text-sm text-navy-500">Bekijk het als klant: <a className="font-medium text-emerald-600 hover:underline" href="/book/sparkle-shine-demo">open de demo-boekingspagina</a>.</p></div></div>
          </div>
          <div className="lg:col-span-3"><ContactForm /></div>
        </div>
      </Section>

      {/* CTA */}
      <section className="py-20">
        <div className="container-x">
          <div className="relative overflow-hidden rounded-3xl bg-navy-900 px-8 py-14 text-center sm:px-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_120%,rgba(16,185,129,0.35),transparent)]" />
            <h2 className="relative text-3xl font-extrabold text-white sm:text-4xl">Klaar om je bedrijf slimmer te runnen?</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-navy-300">Maak in minder dan twee minuten je account aan. Je 14 dagen gratis beginnen vandaag.</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to="/signup" size="lg">Gratis starten</Button>
              <Button to="/login" size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:border-white/30">Inloggen</Button>
            </div>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
