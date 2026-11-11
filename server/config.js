import path from 'node:path';
import fs from 'node:fs';

// Minimal .env loader (no dependency). Real environment variables win.
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 3001),
  appUrl: (env.APP_URL || (isProd ? '' : 'http://localhost:5173')).replace(/\/$/, ''),
  databaseFile: env.DATABASE_FILE || path.resolve(process.cwd(), 'data/cleanflow.db'),
  sessionDays: Number(env.SESSION_DAYS || 14),

  anthropic: {
    configured: Boolean(env.ANTHROPIC_API_KEY),
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  },
  smtp: {
    configured: Boolean(env.SMTP_HOST),
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || 'CLEANFLOW <no-reply@cleanflow.app>',
  },
  twilio: {
    configured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
    sid: env.TWILIO_ACCOUNT_SID,
    token: env.TWILIO_AUTH_TOKEN,
    from: env.TWILIO_FROM,
  },
  stripe: {
    configured: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET &&
      env.STRIPE_PRICE_STARTER && env.STRIPE_PRICE_PROFESSIONAL && env.STRIPE_PRICE_BUSINESS),
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    prices: {
      starter: env.STRIPE_PRICE_STARTER,
      professional: env.STRIPE_PRICE_PROFESSIONAL,
      business: env.STRIPE_PRICE_BUSINESS,
    },
  },
};
