# CLEANFLOW

All-in-one business management platform for professional cleaning companies: online booking, customers, employees, AI customer support, analytics, notifications and subscriptions. The interface, emails and AI assistant are in Dutch.

## Quick start

```bash
npm install
npm run seed      # loads the clearly-labelled demo workspace
npm run dev       # API on :3001, web app on http://localhost:5173
```

Demo logins (password `Demo1234`): `demo@cleanflow.app` (eigenaar), `manager@cleanflow.app`, `employee@cleanflow.app`.
Public booking page: `http://localhost:5173/book/sparkle-shine-demo` · Chat page: `/chat/sparkle-shine-demo`.

Production: `npm run build && APP_URL=https://your.domain npm start` (serves the built app and API from one Node process, port `PORT`). It must sit behind HTTPS, because session cookies are `Secure` in production.

Tests: `npm test` (28 API tests: auth, booking availability and concurrency, permissions, data isolation, dashboard maths, AI assistant).

## Stack

- **Backend:** Node.js 22 + Express 5, SQLite through the built-in `node:sqlite` (WAL mode, foreign keys), Zod validation.
- **Frontend:** React 19, React Router 7, Tailwind CSS 4, Recharts, Lucide icons, built with Vite.
- **Integrations (optional, all off by default):** Anthropic Claude (AI replies), SMTP (email), Twilio (SMS), Stripe (subscriptions). See `.env.example`.

```
server/
  app.js, index.js        Express app, security middleware, housekeeping (reminders, session cleanup)
  db.js                   schema (companies, users, sessions, employees, customers, services, bookings,
                          payments, notifications, ai_settings, faqs, chat, subscriptions, activity_log …)
  lib/auth.js             scrypt hashing, hashed session tokens, RBAC, plan gating, CSRF guard
  lib/availability.js     slot computation and double-booking prevention
  lib/assistant.js        grounded AI assistant (Claude + rule-based fallback)
  lib/notify.js           in-app notifications, email/SMS delivery, reminder sweep
  routes/*.js             REST API
client/src/               React SPA (marketing site, auth, public booking + chat, dashboard app)
tests/                    node:test API test suite
```

## Key behaviour

- **Private workspaces:** every query is scoped to the session's `company_id` on the server; other companies' IDs return 404.
- **Roles:** *owner* (everything, including billing and permissions), *manager* (operations, no billing or role changes), *employee* (only their own assigned jobs; can start and complete them; no prices or customer list).
- **Availability:** a slot is offered only if it is inside opening hours, respects minimum notice, and an active employee whose work schedule covers it is free. Unassigned requests reserve capacity too. With no employees, the company counts as a one-person operation. Every write re-checks availability inside an `IMMEDIATE` transaction, so concurrent requests cannot double-book (covered by a test).
- **Revenue** is based on payments recorded on bookings. CLEANFLOW does not charge end customers.
- **AI assistant:** answers only from verified data (services and prices, opening hours, contact details, FAQs, policies, live availability). It cannot create or confirm bookings, collects contact details only through an explicit consent form, and escalates complaints, unknown questions and requests for a human to the inbox, with a notification. With `ANTHROPIC_API_KEY` set it uses Claude (`claude-opus-5-5`, structured JSON output, server-side refusal fallback); otherwise, or if a Claude call fails, a deterministic rule engine answers in English.
- **Notifications:** in-app notifications on every plan; email and SMS on Professional and above when a provider is configured. Without a provider, messages are recorded as *not configured* in Settings → Notifications → Delivery log, and nothing claims they were sent. Reminders go out for confirmed bookings starting within 24 hours.
- **Subscriptions:** Starter €19, Professional €39, Business €69, with a 14-day trial. Without Stripe, plans can only be switched during the trial, and the UI states that no payment is taken. With Stripe configured, plan changes go through Stripe Checkout and the customer portal, and the plan is activated only by the signed webhook (`POST /api/billing/webhook`, signature verified).

## Security

scrypt password hashing; 256-bit session tokens stored as SHA-256 hashes in HttpOnly/SameSite=Lax cookies; single-use, expiring reset and invite tokens; password change signs out other sessions; rate limiting on auth and public endpoints; CSRF protection (custom header plus an Origin check in production); Helmet with a strict CSP; Zod validation on every input; parameterised SQL; CSV formula-injection protection; no stack traces sent to clients.

## Before going live

- Set `APP_URL`, configure SMTP, and back up the SQLite file (or move to Postgres for multi-instance deployments).
- Have the template legal pages (`/legal/*`) reviewed by a lawyer.
- Configure and test Stripe in test mode before enabling paid plans.
