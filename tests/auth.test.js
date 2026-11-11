import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, signup, db } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const lastEmailLink = (to, path) => {
  const row = db.one(`SELECT body FROM message_outbox WHERE recipient = ? ORDER BY id DESC LIMIT 1`, to);
  const m = row?.body.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  return m?.[1];
};

test('sign up creates a private workspace with owner, trial and starter data', async () => {
  const { c, user, company, subscription } = await signup(srv.base, { plan: 'business' });
  assert.equal(user.role, 'owner');
  assert.ok(company.slug);
  assert.equal(subscription.plan, 'business');
  assert.equal(subscription.status, 'trialing');
  const me = await c.get('/auth/me');
  assert.equal(me.data.user.email, user.email);
  const services = await c.get('/services');
  assert.equal(services.data.services.length, 6);
});

test('sign up validates input and rejects duplicate emails', async () => {
  const c = client(srv.base);
  const weak = await c.post('/auth/signup', { companyName: 'X', name: 'Y', email: 'weak@example.com', password: 'short', acceptTerms: true });
  assert.equal(weak.status, 400);
  assert.ok(weak.data.details.fields.password);
  const noTerms = await c.post('/auth/signup', { companyName: 'X', name: 'Y', email: 'terms@example.com', password: 'Secret123' });
  assert.equal(noTerms.status, 400);
  const { user } = await signup(srv.base);
  const dup = await c.post('/auth/signup', { companyName: 'X', name: 'Y', email: user.email.toUpperCase(), password: 'Secret123', acceptTerms: true });
  assert.equal(dup.status, 409);
});

test('login, logout and session invalidation', async () => {
  const { user, password } = await signup(srv.base);
  const c = client(srv.base);
  assert.equal((await c.post('/auth/login', { email: user.email, password: 'Wrong123' })).status, 401);
  assert.equal((await c.post('/auth/login', { email: 'nobody@example.com', password: 'Wrong123' })).status, 401);
  const ok = await c.post('/auth/login', { email: user.email, password });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/dashboard')).status, 200);
  const stolen = c.cookie;
  await c.post('/auth/logout');
  assert.equal((await c.get('/dashboard')).status, 401);
  // The old cookie value must no longer work server-side.
  const replay = await fetch(`${srv.base}/api/dashboard`, { headers: { cookie: stolen } });
  assert.equal(replay.status, 401);
});

test('session cookie is HttpOnly and SameSite', async () => {
  const { user, password } = await signup(srv.base);
  const res = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'x-cleanflow-client': '1', 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('state-changing requests without the client header are rejected (CSRF)', async () => {
  const { c } = await signup(srv.base);
  const res = await fetch(`${srv.base}/api/customers`, { method: 'POST', headers: { cookie: c.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mallory' }) });
  assert.equal(res.status, 403);
});

test('forgot / reset password flow with single-use token', async () => {
  const { user } = await signup(srv.base);
  const anon = client(srv.base);
  const unknown = await anon.post('/auth/forgot-password', { email: 'ghost@example.com' });
  const known = await anon.post('/auth/forgot-password', { email: user.email });
  assert.equal(unknown.status, 200);
  assert.equal(known.data.message, unknown.data.message, 'response must not reveal whether the account exists');
  const token = lastEmailLink(user.email, 'reset-password');
  assert.ok(token, 'reset link recorded in outbox');
  assert.equal((await anon.post('/auth/reset-password', { token, password: 'NewSecret9' })).status, 200);
  assert.equal((await anon.post('/auth/reset-password', { token, password: 'Another99' })).status, 400, 'token is single-use');
  assert.equal((await anon.post('/auth/login', { email: user.email, password: 'NewSecret9' })).status, 200);
});

test('owner invites an employee who accepts and logs in with limited role', async () => {
  const { c } = await signup(srv.base);
  const email = `cleaner-${Date.now()}@example.com`;
  const inv = await c.post('/settings/team/invite', { name: 'Cara Cleaner', email, role: 'employee' });
  assert.equal(inv.status, 201);
  const token = new URL(inv.data.invite.link).searchParams.get('token');
  const emp = client(srv.base);
  const accepted = await emp.post('/auth/accept-invite', { token, password: 'Cleaner123' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.user.role, 'employee');
  assert.ok(accepted.data.user.employeeId);
  assert.equal((await emp.get('/customers')).status, 403);
});
