import { Check, Minus } from 'lucide-react';
import { MarketingNav, MarketingFooter, PricingCards } from '../../components/Marketing.jsx';

const ROWS = [
  ['Business dashboard', true, true, true],
  ['Customer management', true, true, true],
  ['Booking management & online booking page', true, true, true],
  ['Basic analytics', true, true, true],
  ['AI customer support assistant', false, true, true],
  ['Employee management & scheduling', false, true, true],
  ['Advanced analytics', false, true, true],
  ['Automated email & SMS notifications', false, true, true],
  ['Custom branding (company logo)', false, false, true],
  ['Advanced reporting & CSV exports', false, false, true],
  ['Priority support', false, false, true],
  ['User accounts', '2', '15', '100'],
];

export default function PricingPage() {
  return (
    <div>
      <MarketingNav />
      <section className="py-16 sm:py-24">
        <div className="container-x">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wide text-emerald-600 uppercase">Pricing</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Plans for every stage</h1>
            <p className="mt-4 text-lg text-navy-500">Every plan starts with a 14-day free trial. Prices in euro, per company, per month, excluding VAT.</p>
          </div>
          <div className="mt-14"><PricingCards /></div>
          <div className="mx-auto mt-20 max-w-4xl overflow-x-auto">
            <h2 className="mb-6 text-center text-2xl font-bold">Compare plans</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-navy-100"><th className="py-3 text-left font-semibold">Feature</th>{['Starter', 'Professional', 'Business'].map((p) => <th key={p} className="py-3 font-semibold">{p}</th>)}</tr></thead>
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
