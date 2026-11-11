import { Check, Minus } from 'lucide-react';
import { MarketingNav, MarketingFooter, PricingCards } from '../../components/Marketing.jsx';

const ROWS = [
  ['Bedrijfsdashboard', true, true, true],
  ['Klantenbeheer', true, true, true],
  ['Boekingsbeheer & online boekingspagina', true, true, true],
  ['Basisanalyses', true, true, true],
  ['AI-klantenservice-assistent', false, true, true],
  ['Personeelsbeheer & planning', false, true, true],
  ['Uitgebreide analyses', false, true, true],
  ['Automatische e-mail- & sms-meldingen', false, true, true],
  ['Eigen huisstijl (bedrijfslogo)', false, false, true],
  ['Uitgebreide rapportages & CSV-export', false, false, true],
  ['Voorrang bij support', false, false, true],
  ['Gebruikersaccounts', '2', '15', '100'],
];

export default function PricingPage() {
  return (
    <div>
      <MarketingNav />
      <section className="py-16 sm:py-24">
        <div className="container-x">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wide text-emerald-600 uppercase">Prijzen</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Een abonnement voor elke fase</h1>
            <p className="mt-4 text-lg text-navy-500">Elk abonnement begint met 14 dagen gratis. Prijzen in euro, per bedrijf, per maand, exclusief btw.</p>
          </div>
          <div className="mt-14"><PricingCards /></div>
          <div className="mx-auto mt-20 max-w-4xl overflow-x-auto">
            <h2 className="mb-6 text-center text-2xl font-bold">Abonnementen vergelijken</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-navy-100"><th className="py-3 text-left font-semibold">Functie</th>{['Starter', 'Professional', 'Business'].map((p) => <th key={p} className="py-3 font-semibold">{p}</th>)}</tr></thead>
              <tbody>
                {ROWS.map(([label, ...vals]) => (
                  <tr key={label} className="border-b border-navy-50">
                    <td className="py-3 text-navy-600">{label}</td>
                    {vals.map((v, i) => <td key={i} className="py-3 text-center">{typeof v === 'string' ? <span className="font-semibold">{v}</span> : v ? <Check className="mx-auto size-5 text-emerald-500" /> : <Minus className="mx-auto size-4 text-navy-200" />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
