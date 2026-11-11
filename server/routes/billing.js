import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, run } from '../db.js';
import { config } from '../config.js';
import { parse, HttpError, PLANS, logActivity } from '../lib/core.js';
import { requireRole, getSubscription } from '../lib/auth.js';

const router = Router();

async function stripe(path, params = {}, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new HttpError(502, `Payment provider error: ${body.error?.message || res.status}`);
  return body;
}

router.get('/', requireRole('owner'), (req, res) => {
  const sub = getSubscription(req.user.companyId);
  res.json({
    subscription: sub,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name, price: p.price, features: p.features, limits: p.limits })),
    stripeConfigured: config.stripe.configured,
  });
});

/**
 * Plan changes.
 *  - Stripe configured: returns a Stripe Checkout URL; the subscription is only
 *    updated when Stripe's signed webhook confirms payment.
 *  - Stripe not configured: plan can be switched while trialing (no charge is
 *    made or claimed). Paid activation is refused.
 */
router.post('/change-plan', requireRole('owner'), async (req, res) => {
  const { plan } = parse(z.object({ plan: z.enum(['starter', 'professional', 'business']) }), req.body);
  const sub = getSubscription(req.user.companyId);
  if (config.stripe.configured) {
    if (sub.stripe_subscription_id) {
      // Existing paying customer → manage plan changes in the Stripe customer portal.
      const portal = await stripe('billing_portal/sessions', { customer: sub.stripe_customer_id, return_url: `${config.appUrl}/app/settings?tab=billing` });
      return res.json({ redirectUrl: portal.url });
    }
    const company = one('SELECT name, email FROM companies WHERE id = ?', req.user.companyId);
    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': config.stripe.prices[plan],
      'line_items[0][quantity]': '1',
      client_reference_id: String(req.user.companyId),
      customer_email: req.user.email,
      'metadata[company_id]': String(req.user.companyId),
      'metadata[plan]': plan,
      'subscription_data[metadata][company_id]': String(req.user.companyId),
      'subscription_data[metadata][plan]': plan,
      success_url: `${config.appUrl}/app/settings?tab=billing&checkout=success`,
      cancel_url: `${config.appUrl}/app/settings?tab=billing&checkout=cancelled`,
      ...(company?.name ? { 'custom_text[submit][message]': `Subscription for ${company.name}` } : {}),
    });
    return res.json({ redirectUrl: session.url });
  }
  if (sub.status !== 'trialing' || sub.trialExpired) {
    throw new HttpError(503, 'Online payments are not configured yet, so paid plans cannot be activated. Please contact CLEANFLOW support.');
  }
  run(`UPDATE subscriptions SET plan = ?, updated_at = datetime('now') WHERE company_id = ?`, plan, req.user.companyId);
  logActivity(req.user.companyId, req.user.id, 'changed', 'subscription', null, `${req.user.name} switched the trial to the ${PLANS[plan].name} plan`);
  res.json({ subscription: getSubscription(req.user.companyId), message: `Your trial now uses the ${PLANS[plan].name} plan. No payment has been taken.` });
});

router.post('/portal', requireRole('owner'), async (req, res) => {
  const sub = getSubscription(req.user.companyId);
  if (!config.stripe.configured || !sub.stripe_customer_id) throw new HttpError(409, 'There is no billing account to manage yet.');
  const portal = await stripe('billing_portal/sessions', { customer: sub.stripe_customer_id, return_url: `${config.appUrl}/app/settings?tab=billing` });
  res.json({ redirectUrl: portal.url });
});

// ---------------- Stripe webhook ----------------
export const webhookRouter = Router();

export function verifyStripeSignature(payload, header, secret, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).map(([k, ...val]) => [k, val.join('=')]));
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

const STATUS_MAP = { active: 'active', trialing: 'trialing', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled', incomplete_expired: 'canceled', incomplete: 'past_due' };

webhookRouter.post('/', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  if (!config.stripe.configured) return res.status(503).json({ error: 'Stripe is not configured' });
  const payload = req.body.toString('utf8');
  if (!verifyStripeSignature(payload, req.get('stripe-signature'), config.stripe.webhookSecret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  const event = JSON.parse(payload);
  const obj = event.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    const companyId = Number(obj.metadata?.company_id || obj.client_reference_id);
    const plan = obj.metadata?.plan;
    if (companyId && PLANS[plan]) {
      run(`UPDATE subscriptions SET plan = ?, status = 'active', stripe_customer_id = ?, stripe_subscription_id = ?, trial_ends_at = NULL, updated_at = datetime('now') WHERE company_id = ?`,
        plan, obj.customer, obj.subscription, companyId);
    }
  } else if (event.type.startsWith('customer.subscription.')) {
    const companyId = Number(obj.metadata?.company_id);
    const plan = obj.metadata?.plan;
    const priceId = obj.items?.data?.[0]?.price?.id;
    const planFromPrice = Object.entries(config.stripe.prices).find(([, id]) => id === priceId)?.[0];
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : (STATUS_MAP[obj.status] || 'past_due');
    if (companyId) {
      run(`UPDATE subscriptions SET plan = COALESCE(?, plan), status = ?, current_period_end = ?, cancel_at_period_end = ?, stripe_subscription_id = ?, updated_at = datetime('now') WHERE company_id = ?`,
        planFromPrice || (PLANS[plan] ? plan : null), status,
        obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null, obj.cancel_at_period_end ? 1 : 0, obj.id, companyId);
    }
  }
  res.json({ received: true });
});

export default router;
