import { NavLink, useParams } from 'react-router-dom';
import { MarketingNav, MarketingFooter } from '../../components/Marketing.jsx';
import { cx } from '../../components/ui.jsx';
import NotFound from './NotFound.jsx';

const DOCS = {
  terms: ['Terms of Service', [
    ['Template notice', 'This is a template provided with the CLEANFLOW software. It must be reviewed and adapted by a qualified lawyer before CLEANFLOW is offered commercially.'],
    ['1. The service', 'CLEANFLOW provides software for cleaning companies to manage bookings, customers, employees, customer support and reporting. Each company account ("workspace") is operated by the business that created it.'],
    ['2. Accounts', 'You are responsible for keeping your login credentials confidential and for all activity in your workspace. Owners decide which team members get access and with which role.'],
    ['3. Subscriptions and trials', 'Paid plans are billed monthly in advance once online payments are enabled for your account. Trials end automatically after 14 days; you will not be charged unless you subscribe.'],
    ['4. Your data', 'You keep ownership of all data you add to CLEANFLOW. You may export or delete it at any time, subject to the features of your plan.'],
    ['5. Acceptable use', 'Do not use CLEANFLOW to send unsolicited messages, to store data you are not allowed to process, or to attempt to access other workspaces.'],
    ['6. AI assistant', 'The AI assistant answers based on the information you provide. You remain responsible for the accuracy of that information and for any commitments made to your customers.'],
  ]],
  privacy: ['Privacy Policy', [
    ['Template notice', 'This is a template provided with the CLEANFLOW software. Adapt it to your organisation and jurisdiction (for example the GDPR) before going live.'],
    ['What we store', 'Account data (name, email, hashed password), company settings, and the business records you enter: customers, bookings, employees, payments and chat conversations.'],
    ['Why we store it', 'To provide the service to the company that owns the workspace. Cleaning companies act as data controllers for their customers\' data; CLEANFLOW acts as processor.'],
    ['Website visitors and customers', 'Customers who book online or use the chat assistant share their details with the cleaning company. Contact details in chat are only stored after explicit consent.'],
    ['Security', 'Passwords are hashed with scrypt, sessions use secure HTTP-only cookies, and all data access is scoped to the workspace on the server.'],
    ['Your rights', 'You can request access to, correction of, or deletion of your personal data by contacting the company you interacted with or CLEANFLOW support.'],
  ]],
  cookies: ['Cookie Policy', [
    ['Essential cookies only', 'CLEANFLOW uses a single essential cookie (cf_session) to keep you logged in. It is HTTP-only, cannot be read by scripts, and expires after 14 days of inactivity or when you log out.'],
    ['No tracking', 'CLEANFLOW does not use advertising or analytics cookies. The public booking page and chat widget use your browser\'s local storage only to remember an open chat conversation.'],
  ]],
  security: ['Security', [
    ['Workspace isolation', 'Every database query is scoped to the authenticated user\'s company on the server. Identifiers from another workspace return "not found".'],
    ['Role-based access', 'Owners, managers and employees have different permissions. Employees can only see jobs assigned to them and cannot see financial data.'],
    ['Authentication', 'Passwords are hashed with scrypt and per-user salts. Sessions are random 256-bit tokens stored only as hashes. Password reset links are single-use and expire after one hour. Login and reset endpoints are rate limited.'],
    ['Web security', 'Strict Content Security Policy, CSRF protection, input validation on every endpoint, and CSV exports protected against formula injection.'],
    ['Responsible disclosure', 'Found a vulnerability? Please contact us through the contact form and we will respond promptly.'],
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
        <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Legal">
          {Object.entries(DOCS).map(([k, [title]]) => (
            <NavLink key={k} to={`/legal/${k}`} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap', isActive ? 'bg-emerald-50 text-emerald-700' : 'text-navy-500 hover:bg-navy-50')}>{title}</NavLink>
          ))}
        </nav>
        <article className="md:col-span-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{page[0]}</h1>
          <div className="mt-8 space-y-7">
            {page[1].map(([h, p]) => (
              <section key={h} className={h === 'Template notice' ? 'rounded-xl border border-amber-200 bg-amber-50 p-4' : ''}>
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
