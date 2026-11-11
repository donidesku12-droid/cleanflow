import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, signup, futureWeekday, db, core } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('dashboard statistics match the underlying records', async () => {
  const o = await signup(srv.base, { plan: 'business' });
  const svcs = (await o.c.get('/services')).data.services;
  const emp = (await o.c.post('/employees', { name: 'Kim', job_title: 'Cleaner' })).data.employee;
  await o.c.post('/employees', { name: 'Lee', job_title: 'Cleaner', status: 'inactive' });
  const date = futureWeekday(3, 'tue');
  const mk = async (time, status) => (await o.c.post('/bookings', { new_customer: { name: `C ${time}` }, service_id: svcs[0].id, date, time, address: 'X 1', status, employee_id: status === 'confirmed' ? emp.id : null })).data.booking;
  const a = await mk('08:00', 'confirmed');
  await mk('11:00', 'pending');
  await mk('14:00', 'pending');
  // Only one active employee, who is busy at 08:00 → a parallel request is refused.
  assert.equal((await o.c.post('/bookings', { new_customer: { name: 'Clash' }, service_id: svcs[0].id, date, time: '08:00', address: 'X 1' })).status, 409);
  await o.c.post(`/bookings/${a.id}/status`, { status: 'completed' });
  await o.c.post(`/bookings/${a.id}/payments`, { amount: 85, method: 'card' });
  await o.c.post(`/bookings/${a.id}/payments`, { amount: 15.5, method: 'cash' });

  const d = (await o.c.get('/dashboard')).data;
  assert.equal(d.stats.revenueMonth, 10050);
  assert.equal(d.stats.pending, 2);
  assert.equal(d.stats.completedTotal, 1);
  assert.equal(d.stats.bookingsTotal, 3);
  assert.equal(d.stats.totalCustomers, 3, 'the refused booking must not leave a customer behind');
  assert.equal(d.stats.activeCustomers, 3);
  assert.equal(d.stats.employees, 1, 'inactive employees are not counted as active');
  assert.equal(d.stats.employeesTotal, 2);
  assert.equal(d.revenue.weekly.length, 8);
  assert.equal(d.revenue.monthly.length, 12);
  assert.equal(d.revenue.monthly.at(-1).revenue, 100.5);
  assert.equal(d.revenue.weekly.reduce((s, w) => s + w.revenue, 0), 100.5);
  assert.ok(d.upcoming.length >= 2);
  assert.ok(d.activity.length > 0);

  const today = core.todayIn('Europe/Amsterdam');
  const an = (await o.c.get(`/dashboard/analytics?from=${core.addDays(today, -10)}&to=${core.addDays(today, 30)}`)).data;
  assert.equal(an.kpis.totalRevenue, 10050);
  assert.equal(an.kpis.bookings, 3);
  assert.equal(an.kpis.completed, 1);
  assert.equal(an.kpis.averageBookingValue, svcs[0].price_cents);
  assert.equal(an.popularServices[0].bookings, 3);
  assert.equal(an.series.reduce((s, r) => s + r.revenue, 0), 100.5);
  assert.equal((await o.c.get(`/dashboard/analytics?from=2026-05-01&to=2026-01-01`)).status, 400);
});

// --------------- AI assistant ---------------
const { ruleRespond, buildKnowledge } = await import('../server/lib/assistant.js');

async function aiCompany() {
  const o = await signup(srv.base, { plan: 'professional' });
  await o.c.post('/assistant/faqs', { question: 'Do you bring your own cleaning supplies?', answer: 'Yes, we bring all supplies and equipment.' });
  return { ...o, k: () => buildKnowledge(o.company.id) };
}

test('assistant quotes only configured prices and services', async () => {
  const o = await aiCompany();
  const k = o.k();
  const r = ruleRespond(k, 'How much does deep cleaning cost?');
  assert.match(r.reply, /€\s195,00/);
  assert.equal(r.escalate, false);
  const all = ruleRespond(k, 'What are your prices?');
  const quoted = [...all.reply.matchAll(/€\s?([\d.]+,\d{2})/g)].map((m) => Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 100));
  const configured = new Set(k.services.map((s) => s.price_cents));
  assert.ok(quoted.length >= 6);
  for (const p of quoted) assert.ok(configured.has(p), `quoted price ${p} must exist in services`);
  // Changing the price changes the answer immediately.
  const deep = k.services.find((s) => s.name === 'Dieptereiniging');
  await o.c.patch(`/services/${deep.id}`, { price: 210 });
  assert.match(ruleRespond(o.k(), 'price for a deep clean?').reply, /€\s210,00/);
  assert.match(ruleRespond(o.k(), 'Wat kost een dieptereiniging?').reply, /€\s210,00/);
  assert.match(ruleRespond(o.k(), 'Hoeveel kost glasbewassing?').reply, /vanaf €\s65,00/);
});

test('assistant answers hours and FAQs from verified data', async () => {
  const o = await aiCompany();
  const hours = ruleRespond(o.k(), 'What are your opening hours?');
  assert.match(hours.reply, /Maandag: 08:00–18:00/);
  assert.match(hours.reply, /Zondag: Gesloten/);
  assert.match(ruleRespond(o.k(), 'Zijn jullie op zondag open?').reply, /Zondag: Gesloten/);
  assert.match(ruleRespond(o.k(), 'Zijn jullie vrijdag open?').reply, /Vrijdag: 08:00–18:00/);
  assert.equal(ruleRespond(o.k(), 'do you bring cleaning supplies').reply, 'Yes, we bring all supplies and equipment.');
});

test('assistant escalates instead of guessing', async () => {
  const o = await aiCompany();
  for (const q of ['Can I get a student discount?', 'Do you have a parking permit for zone B?', 'I want a refund, the cleaner broke my vase', 'Can I talk to a human please?',
    'Ik wil mijn geld terug', 'De schoonmaker heeft mijn vaas kapot gemaakt', 'Kan ik iemand spreken?', 'Hebben jullie studentenkorting?']) {
    const r = ruleRespond(o.k(), q);
    assert.equal(r.escalate, true, q);
    assert.doesNotMatch(r.reply, /€/, 'no prices invented in escalations');
  }
  const book = ruleRespond(o.k(), 'Can I book a regular home cleaning next week?');
  assert.equal(book.intent, 'booking');
  assert.match(book.reply, /Nu boeken/);
  assert.match(book.reply, /pas definitief/);
  const nl = ruleRespond(o.k(), 'Kan ik volgende week een afspraak maken voor huishoudelijke schoonmaak?');
  assert.equal(nl.intent, 'booking');
  assert.match(nl.reply, /eerstvolgende vrije tijden voor Reguliere huishoudelijke schoonmaak/);
});

test('public chat: conversation, escalation notification, consent-based contact capture', async () => {
  const o = await aiCompany();
  const pub = client(srv.base);
  const first = await pub.post(`/public/company/${o.company.slug}/chat`, { message: 'What services do you offer?' });
  assert.equal(first.status, 200);
  assert.ok(first.data.token);
  assert.equal(first.data.messages.length, 2);
  const esc = await pub.post(`/public/company/${o.company.slug}/chat`, { message: 'I have a complaint about yesterday', token: first.data.token });
  assert.equal(esc.data.escalated, true);
  const notes = (await o.c.get('/notifications')).data.notifications;
  assert.ok(notes.some((n) => n.type === 'chat_escalated'));
  assert.equal((await pub.post(`/public/chat/${first.data.token}/contact`, { name: 'Viv', email: 'viv@example.com' })).status, 400, 'consent is required');
  assert.equal((await pub.post(`/public/chat/${first.data.token}/contact`, { name: 'Viv', email: 'viv@example.com', consent: true })).status, 200);
  const inbox = (await o.c.get('/assistant/conversations?status=escalated')).data.conversations;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].visitor_email, 'viv@example.com');
  // Staff reply is visible to the visitor
  await o.c.post(`/assistant/conversations/${inbox[0].id}/reply`, { message: 'Sorry to hear that, we will call you.' });
  const poll = await pub.get(`/public/chat/${first.data.token}`);
  assert.ok(poll.data.messages.some((m) => m.role === 'staff'));
  // Another company cannot read this conversation
  const other = await signup(srv.base, { plan: 'professional' });
  assert.equal((await other.c.get(`/assistant/conversations/${inbox[0].id}`)).status, 404);
  assert.equal(db.one('SELECT COUNT(*) n FROM chat_conversations WHERE company_id = ?', other.company.id).n, 0);
});
