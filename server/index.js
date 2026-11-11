import { config } from './config.js';
import { createApp } from './app.js';
import { one, run } from './db.js';
import { runReminderSweep } from './lib/notify.js';

if (config.isProd && !/^https:\/\//.test(config.appUrl)) {
  console.error('APP_URL must be set to the public https:// URL in production (session cookies are Secure, emails contain links).');
  process.exit(1);
}

const app = createApp();

// Housekeeping: expired sessions/tokens and appointment reminders.
function housekeeping() {
  run(`DELETE FROM sessions WHERE expires_at < ?`, new Date().toISOString());
  run(`DELETE FROM auth_tokens WHERE expires_at < ?`, new Date(Date.now() - 7 * 864e5).toISOString());
  runReminderSweep().catch((err) => console.error('[reminders]', err));
}
setInterval(housekeeping, 10 * 60 * 1000).unref();
setTimeout(housekeeping, 5000).unref();

app.listen(config.port, () => {
  const companies = one('SELECT COUNT(*) n FROM companies').n;
  console.log(`CLEANFLOW API listening on http://localhost:${config.port}`);
  console.log(`  AI assistant: ${config.anthropic.configured ? `Claude (${config.anthropic.model})` : 'grounded rule-based engine (set ANTHROPIC_API_KEY to enable Claude)'}`);
  console.log(`  Email: ${config.smtp.configured ? 'SMTP configured' : 'not configured (messages are logged to the outbox)'}`);
  console.log(`  SMS: ${config.twilio.configured ? 'Twilio configured' : 'not configured'}`);
  console.log(`  Payments: ${config.stripe.configured ? 'Stripe configured' : 'not configured (plans can only be switched during trial)'}`);
  if (!companies) console.log('  Database is empty. Run `npm run seed` to load the demo workspace.');
});
