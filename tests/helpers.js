import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Isolated database per test file, configured before the app modules load.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanflow-test-'));
process.env.DATABASE_FILE = path.join(dir, 'test.db');
process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SMTP_HOST;
delete process.env.STRIPE_SECRET_KEY;

const { createApp } = await import('../server/app.js');
export const db = await import('../server/db.js');
export const core = await import('../server/lib/core.js');

export async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

/** Minimal HTTP client with a cookie jar, mimicking the browser SPA. */
export function client(base) {
  let cookie = '';
  const call = async (method, url, body, { raw = false, headers = {} } = {}) => {
    const res = await fetch(`${base}/api${url}`, {
      method,
      headers: { 'x-cleanflow-client': '1', ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
  return {
    get: (u, o) => call('GET', u, undefined, o),
    post: (u, b = {}, o) => call('POST', u, b, o),
    patch: (u, b = {}, o) => call('PATCH', u, b, o),
    put: (u, b = {}, o) => call('PUT', u, b, o),
    del: (u, o) => call('DELETE', u, undefined, o),
    get cookie() { return cookie; },
  };
}

let n = 0;
export async function signup(base, overrides = {}) {
  const c = client(base);
  n += 1;
  const body = { companyName: `Test Clean ${n}`, name: `Owner ${n}`, email: `owner${n}-${Date.now()}@example.com`, password: 'Secret123', acceptTerms: true, ...overrides };
  const res = await c.post('/auth/signup', body);
  if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.data)}`);
  return { c, ...res.data, password: body.password };
}

/** A future weekday date (YYYY-MM-DD) at least `minDays` ahead. */
export function futureWeekday(minDays = 3, weekday = 'tue') {
  const { addDays, todayIn, weekdayOf } = core;
  let d = addDays(todayIn('Europe/Amsterdam'), minDays);
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}
