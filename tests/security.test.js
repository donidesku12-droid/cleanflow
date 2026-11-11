import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, signup, futureWeekday } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

async function companyWithData(plan = 'business') {
  const o = await signup(srv.base, { plan });
  const svc = (await o.c.get('/services')).data.services[0];
  const emp = (await o.c.post('/employees', { name: 'Eve Employee', job_title: 'Cleaner' })).data.employee;
  const other = (await o.c.post('/employees', { name: 'Olga Other', job_title: 'Cleaner' })).data.employee;
  const date = futureWeekday(3, 'tue');
  const mine = (await o.c.post('/bookings', { new_customer: { name: 'Alice', email: `alice-${Date.now()}@example.com` }, service_id: svc.id, date, time: '08:00', address: 'A 1', employee_id: emp.id })).data.booking;
  const theirs = (await o.c.post('/bookings', { new_customer: { name: 'Bob' }, service_id: svc.id, date, time: '08:00', address: 'B 2', employee_id: other.id })).data.booking;
  return { ...o, svc, emp, other, mine, theirs };
}

async function loginAs(owner, role, employeeId) {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const inv = await owner.c.post('/settings/team/invite', { name: `${role} user`, email, role, employee_id: employeeId ?? null });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  const c = client(srv.base);
  await c.post('/auth/accept-invite', { token: new URL(inv.data.invite.link).searchParams.get('token'), password: 'Secret123' });
  return c;
}

test('company data isolation: another workspace sees 404 for every foreign record', async () => {
  const a = await companyWithData();
  const b = await signup(srv.base, { plan: 'business' });
  const probes = [
    ['get', `/bookings/${a.mine.id}`], ['patch', `/bookings/${a.mine.id}`, { address: 'hacked' }], ['post', `/bookings/${a.mine.id}/status`, { status: 'cancelled' }],
    ['get', `/customers/${a.mine.customer_id}`], ['patch', `/customers/${a.mine.customer_id}`, { name: 'hacked' }], ['del', `/customers/${a.mine.customer_id}`],
    ['get', `/employees/${a.emp.id}`], ['patch', `/employees/${a.emp.id}`, { name: 'hacked' }], ['patch', `/services/${a.svc.id}`, { price: 1 }],
  ];
  for (const [m, url, body] of probes) {
    const r = await b.c[m](url, body);
    assert.equal(r.status, 404, `${m.toUpperCase()} ${url} → ${r.status}`);
  }
  // Booking with a foreign service / employee / customer is refused
  assert.equal((await b.c.post('/bookings', { customer_id: a.mine.customer_id, service_id: a.svc.id, date: futureWeekday(3), time: '09:00', address: 'x x' })).status, 404);
  // Lists are scoped
  assert.equal((await b.c.get('/bookings?status=all')).data.bookings.length, 0);
  assert.equal((await b.c.get('/customers')).data.customers.length, 0);
  // Original data untouched
  assert.equal((await a.c.get(`/bookings/${a.mine.id}`)).data.booking.address, 'A 1');
});

test('unauthenticated access is rejected', async () => {
  const anon = client(srv.base);
  for (const url of ['/dashboard', '/bookings', '/customers', '/employees', '/services', '/settings/team', '/billing', '/assistant/settings']) {
    assert.equal((await anon.get(url)).status, 401, url);
  }
});

test('employee permissions: own jobs only, no financial or customer list access', async () => {
  const o = await companyWithData();
  const emp = await loginAs(o, 'employee', o.emp.id);
  const list = (await emp.get('/bookings?status=all')).data.bookings;
  assert.deepEqual(list.map((b) => b.id), [o.mine.id]);
  assert.equal(list[0].price_cents, undefined, 'prices hidden from employees');
  assert.equal(list[0].customer_email, undefined);
  assert.equal((await emp.get(`/bookings/${o.theirs.id}`)).status, 404);
  for (const url of ['/customers', '/employees', '/dashboard/analytics', '/settings/team', '/settings/company', '/billing', '/assistant/settings']) {
    assert.equal((await emp.get(url)).status, 403, url);
  }
  assert.equal((await emp.post('/services', { name: 'x', price: 1, duration_min: 60 })).status, 403);
  assert.equal((await emp.patch(`/bookings/${o.mine.id}`, { address: 'changed' })).status, 403);
  assert.equal((await emp.get(`/employees/${o.other.id}`)).status, 403);
  assert.equal((await emp.get(`/employees/${o.emp.id}`)).status, 200);
  // Pending → confirmed is a manager decision; start/complete of confirmed own job is allowed.
  const dash = await emp.get('/dashboard');
  assert.equal(dash.data.role, 'employee');
  assert.equal((await emp.post(`/bookings/${o.mine.id}/status`, { status: 'cancelled' })).status, 403);
  assert.equal((await emp.post(`/bookings/${o.mine.id}/status`, { status: 'in_progress' })).status, 200);
  assert.equal((await emp.post(`/bookings/${o.mine.id}/status`, { status: 'completed' })).data.booking.status, 'completed');
  assert.equal((await emp.post(`/bookings/${o.theirs.id}/status`, { status: 'in_progress' })).status, 404);
});

test('manager permissions: operations yes, billing and role management no', async () => {
  const o = await companyWithData();
  const mgr = await loginAs(o, 'manager');
  assert.equal((await mgr.get('/customers')).status, 200);
  assert.equal((await mgr.get('/dashboard/analytics')).status, 200);
  assert.equal((await mgr.post(`/bookings/${o.mine.id}/status`, { status: 'in_progress' })).status, 200);
  assert.equal((await mgr.get('/billing')).status, 403);
  assert.equal((await mgr.post('/billing/change-plan', { plan: 'starter' })).status, 403);
  assert.equal((await mgr.post('/settings/team/invite', { name: 'X', email: `m-${Date.now()}@example.com`, role: 'manager' })).status, 403);
  const team = (await mgr.get('/settings/team')).data.users;
  const owner = team.find((u) => u.role === 'owner');
  assert.equal((await mgr.patch(`/settings/team/${owner.id}`, { status: 'disabled' })).status, 403);
});

test('disabled users lose access immediately', async () => {
  const o = await companyWithData();
  const mgr = await loginAs(o, 'manager');
  const team = (await o.c.get('/settings/team')).data.users;
  const m = team.find((u) => u.role === 'manager');
  await o.c.patch(`/settings/team/${m.id}`, { status: 'disabled' });
  assert.equal((await mgr.get('/dashboard')).status, 401);
});

test('plan gating is enforced server-side (Starter)', async () => {
  const o = await signup(srv.base, { plan: 'starter' });
  assert.equal((await o.c.get('/assistant/settings')).status, 402);
  assert.equal((await o.c.get('/employees')).status, 402);
  assert.equal((await o.c.get('/dashboard/export/bookings')).status, 402);
  assert.equal((await o.c.get('/dashboard/analytics')).data.advanced, false);
  assert.equal((await client(srv.base).post(`/public/company/${o.company.slug}/chat`, { message: 'hi' })).status, 409);
  // Switching the trial plan (Stripe not configured) is allowed and clearly unpaid.
  const sw = await o.c.post('/billing/change-plan', { plan: 'professional' });
  assert.equal(sw.status, 200);
  assert.match(sw.data.message, /Er is niets afgeschreven/);
  assert.equal((await o.c.get('/employees')).status, 200);
});

test('malformed input never causes server errors', async () => {
  const o = await signup(srv.base);
  const bad = await fetch(`${srv.base}/api/customers`, { method: 'POST', headers: { cookie: o.c.cookie, 'x-cleanflow-client': '1', 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal((await o.c.get('/bookings/abc')).status, 404);
  assert.equal((await o.c.get("/customers?q=' OR 1=1 --")).status, 200);
  assert.equal((await o.c.get('/bookings?from=yesterday')).status, 400);
  const xss = await o.c.post('/customers', { name: '<script>alert(1)</script>' });
  assert.equal(xss.status, 201, 'stored as text; React escapes on render');
});

test('CSV export neutralises spreadsheet formulas', async () => {
  const o = await signup(srv.base, { plan: 'business' });
  await o.c.post('/customers', { name: '=HYPERLINK("http://evil")' });
  const res = await o.c.get('/dashboard/export/customers');
  assert.equal(res.status, 200);
  assert.ok(res.data.includes(`"'=HYPERLINK(""http://evil"")"`), res.data);
});
