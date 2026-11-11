import { NavLink, useParams } from 'react-router-dom';
import { MarketingNav, MarketingFooter } from '../../components/Marketing.jsx';
import { cx } from '../../components/ui.jsx';
import NotFound from './NotFound.jsx';

const NOTICE = 'Let op';
const DOCS = {
  terms: ['Algemene voorwaarden', [
    [NOTICE, 'Dit is een voorbeeldtekst die bij de CLEANFLOW-software hoort. Laat deze door een jurist controleren en aanpassen voordat je CLEANFLOW commercieel aanbiedt.'],
    ['1. De dienst', 'CLEANFLOW is software waarmee schoonmaakbedrijven boekingen, klanten, medewerkers, klantenservice en rapportages beheren. Elk bedrijfsaccount ("omgeving") wordt beheerd door het bedrijf dat het heeft aangemaakt.'],
    ['2. Accounts', 'Je bent zelf verantwoordelijk voor het geheimhouden van je inloggegevens en voor alle activiteit in je omgeving. De eigenaar bepaalt welke teamleden toegang krijgen en met welke rol.'],
    ['3. Abonnementen en proefperiode', 'Betaalde abonnementen worden maandelijks vooraf gefactureerd zodra online betalen voor je account is ingeschakeld. De proefperiode eindigt automatisch na 14 dagen; er wordt niets in rekening gebracht tenzij je een abonnement afsluit.'],
    ['4. Jouw gegevens', 'Alle gegevens die je in CLEANFLOW invoert blijven van jou. Je kunt ze op elk moment exporteren of verwijderen, binnen de mogelijkheden van je abonnement.'],
    ['5. Aanvaardbaar gebruik', 'Gebruik CLEANFLOW niet om ongevraagde berichten te versturen, om gegevens op te slaan die je niet mag verwerken, of om toegang te proberen te krijgen tot andere omgevingen.'],
    ['6. AI-assistent', 'De AI-assistent antwoordt op basis van de informatie die jij invoert. Jij blijft verantwoordelijk voor de juistheid daarvan en voor afspraken die met je klanten worden gemaakt.'],
  ]],
  privacy: ['Privacybeleid', [
    [NOTICE, 'Dit is een voorbeeldtekst die bij de CLEANFLOW-software hoort. Pas deze aan op je organisatie en de AVG voordat je live gaat.'],
    ['Wat we opslaan', 'Accountgegevens (naam, e-mailadres, versleuteld wachtwoord), bedrijfsinstellingen en de gegevens die je zelf invoert: klanten, boekingen, medewerkers, betalingen en chatgesprekken.'],
    ['Waarom we dat opslaan', 'Om de dienst te leveren aan het bedrijf dat de omgeving beheert. Schoonmaakbedrijven zijn verwerkingsverantwoordelijke voor de gegevens van hun klanten; CLEANFLOW is verwerker.'],
    ['Websitebezoekers en klanten', 'Klanten die online boeken of de chat-assistent gebruiken, delen hun gegevens met het schoonmaakbedrijf. Contactgegevens in de chat worden alleen opgeslagen na uitdrukkelijke toestemming.'],
    ['Beveiliging', 'Wachtwoorden worden versleuteld met scrypt, sessies gebruiken beveiligde HTTP-only cookies, en de server controleert bij elk verzoek dat je alleen bij gegevens van je eigen bedrijf kunt.'],
    ['Jouw rechten', 'Je kunt inzage, correctie of verwijdering van je persoonsgegevens aanvragen bij het bedrijf waarmee je contact had, of bij de support van CLEANFLOW.'],
  ]],
  cookies: ['Cookiebeleid', [
    ['Alleen noodzakelijke cookies', 'CLEANFLOW gebruikt één noodzakelijke cookie (cf_session) om je ingelogd te houden. Deze is HTTP-only, kan niet door scripts worden gelezen, en verloopt na 14 dagen of wanneer je uitlogt.'],
    ['Geen tracking', 'CLEANFLOW gebruikt geen advertentie- of analysecookies. De boekingspagina en de chat-assistent gebruiken de lokale opslag van je browser alleen om een open chatgesprek te onthouden.'],
  ]],
  security: ['Beveiliging', [
    ['Afgeschermde omgevingen', 'Elke databasevraag wordt op de server beperkt tot het bedrijf van de ingelogde gebruiker. Gegevens van een ander bedrijf geven "niet gevonden".'],
    ['Rechten per rol', 'Eigenaren, managers en medewerkers hebben verschillende rechten. Medewerkers zien alleen hun eigen klussen en geen financiële gegevens.'],
    ['Inloggen', 'Wachtwoorden worden versleuteld met scrypt en een unieke salt. Sessies zijn willekeurige 256-bit tokens die alleen als hash worden opgeslagen. Links om je wachtwoord te herstellen werken één keer en verlopen na een uur. Inloggen en wachtwoordherstel zijn beperkt tegen misbruik.'],
    ['Webbeveiliging', 'Een strikt Content Security Policy, bescherming tegen CSRF, controle van alle invoer, en CSV-exports die beschermd zijn tegen formule-injectie.'],
    ['Een lek melden', 'Heb je een beveiligingsprobleem gevonden? Neem contact met ons op via het contactformulier, dan reageren we snel.'],
  ]],
};

export default function Legal() {
  const { doc } = useParams();
  const page = DOCS[doc];
  if (!page) return <NotFound />;
  return (
    <div>
      <MarketingNav />
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Juridisch">
          {Object.entries(DOCS).map(([k, [title]]) => (
            <NavLink key={k} to={`/legal/${k}`} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap', isActive ? 'bg-emerald-50 text-emerald-700' : 'text-navy-500 hover:bg-navy-50')}>{title}</NavLink>
          ))}
        </nav>
        <article className="md:col-span-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{page[0]}</h1>
          <div className="mt-8 space-y-7">
            {page[1].map(([h, p]) => (
              <section key={h} className={h === NOTICE ? 'rounded-xl border border-amber-200 bg-amber-50 p-4' : ''}>
                <h2 className="font-semibold">{h}</h2>
                <p className="mt-2 leading-relaxed text-navy-600">{p}</p>
              </section>
            ))}
          </div>
        </article>
      </div>
      <MarketingFooter />
    </div>
  );
}
