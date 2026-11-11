import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { one, run } from '../db.js';
import { config } from '../config.js';
import { HttpError, forbidden, randomToken, sha256, PLANS } from './core.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_COOKIE = 'cf_session';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) {
    // Burn comparable time so missing accounts aren't distinguishable by timing.
    await scrypt(password, 'timing-equaliser', 64, SCRYPT_PARAMS);
    return false;
  }
  const [, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

export function createSession(res, req, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 864e5);
  run(`INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)`,
    sha256(token), userId, expires.toISOString(), req.ip ?? null, (req.get('user-agent') || '').slice(0, 300));
  run(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.isProd, expires, path: '/',
  });
}

export function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE id = ?', sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Loads req.user / req.company / req.plan from the session cookie, if any. */
export function loadSession(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const row = one(`
    SELECT s.id AS sid, s.expires_at, u.id, u.company_id, u.employee_id, u.email, u.name, u.role, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, sha256(token));
  if (!row) return next();
  if (new Date(row.expires_at) < new Date() || row.status !== 'active') {
    run('DELETE FROM sessions WHERE id = ?', row.sid);
    return next();
  }
  req.sessionId = row.sid;
  req.user = { id: row.id, companyId: row.company_id, employeeId: row.employee_id, email: row.email, name: row.name, role: row.role };
  req.subscription = getSubscription(row.company_id);
  next();
}

export function getSubscription(companyId) {
  const sub = one('SELECT * FROM subscriptions WHERE company_id = ?', companyId);
  if (!sub) return { plan: 'starter', status: 'canceled', features: [], active: false };
  const trialExpired = sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date();
  const active = (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') && !trialExpired;
  // An expired trial or canceled subscription keeps read access to Starter features so no data is lost.
  const features = active ? PLANS[sub.plan].features : PLANS.starter.features;
  return { ...sub, trialExpired, active, features };
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Log in om verder te gaan'));
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Log in om verder te gaan'));
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

export const requireFeature = (feature) => (req, _res, next) => {
  if (!req.subscription?.features.includes(feature)) {
    return next(new HttpError(402, 'Deze functie zit niet in je huidige abonnement. Upgrade via Instellingen → Abonnement.', { feature }));
  }
  next();
};

export const isStaffAdmin = (user) => user.role === 'owner' || user.role === 'manager';

/** CSRF defence for cookie-authenticated, state-changing requests: cookies are
 *  SameSite=Lax and we additionally require a custom header that cross-site
 *  forms cannot set, plus an Origin check when the browser sends one. */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/billing/webhook')) return next();
  if (req.get('x-cleanflow-client') !== '1') return next(new HttpError(403, 'Verzoek geweigerd'));
  const origin = req.get('origin');
  if (origin && config.appUrl && config.isProd) {
    const allowed = new URL(config.appUrl).origin;
    if (origin !== allowed) return next(new HttpError(403, 'Verzoek van een andere website geblokkeerd'));
  }
  next();
}

export function createAuthToken(userId, purpose, hours) {
  const token = randomToken(32);
  run(`UPDATE auth_tokens SET used_at = datetime('now') WHERE user_id = ? AND purpose = ? AND used_at IS NULL`, userId, purpose);
  run(`INSERT INTO auth_tokens (id, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)`,
    sha256(token), userId, purpose, new Date(Date.now() + hours * 36e5).toISOString());
  return token;
}

export function consumeAuthToken(token, purpose) {
  const row = one(`SELECT * FROM auth_tokens WHERE id = ? AND purpose = ?`, sha256(String(token || '')), purpose);
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return null;
  return row;
}
