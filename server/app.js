import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { HttpError } from './lib/core.js';
import { loadSession, requireAuth, csrfGuard } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import bookingRoutes from './routes/bookings.js';
import customerRoutes from './routes/customers.js';
import employeeRoutes from './routes/employees.js';
import serviceRoutes from './routes/services.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes, { notificationsRouter } from './routes/settings.js';
import assistantRoutes from './routes/assistant.js';
import publicRoutes from './routes/public.js';
import billingRoutes, { webhookRouter } from './routes/billing.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Stripe needs the raw body for signature verification, so mount before json().
  app.use('/api/billing/webhook', webhookRouter);

  app.use(express.json({ limit: '600kb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', csrfGuard);
  app.use('/api', loadSession);

  app.get('/api/health', (_req, res) => res.json({
    ok: true,
    integrations: {
      ai: config.anthropic.configured ? 'claude' : 'grounded-rules',
      email: config.smtp.configured, sms: config.twilio.configured, payments: config.stripe.configured,
    },
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);

  app.use('/api', requireAuth);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/billing', billingRoutes);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Niet gevonden')));

  // Serve the built SPA in production.
  const dist = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Central error handler: never leak stack traces or SQL to clients.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ongeldig verzoek' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Het verzoek is te groot' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: 'Er ging bij ons iets mis. Probeer het opnieuw.' });
  });
  return app;
}
