import Anthropic from '@anthropic-ai/sdk';
import { all, one } from '../db.js';
import { config } from '../config.js';
import { DAYS, formatMoney, todayIn } from './core.js';
import { availableSlots, getCompany } from './availability.js';
import { addDays } from './core.js';

const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const LANGUAGES = { en: 'English', nl: 'Dutch', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', pl: 'Polish' };

export function getAiSettings(companyId) {
  const s = one('SELECT * FROM ai_settings WHERE company_id = ?', companyId);
  return s ? { ...s, languages: JSON.parse(s.languages) } : null;
}

export function priceLabel(s, currency) {
  const p = formatMoney(s.price_cents, currency);
  return s.price_unit === 'from' ? `from ${p}` : s.price_unit === 'per_hour' ? `${p} per hour` : p;
}

/** Everything the assistant is allowed to rely on. Nothing outside this object is "verified". */
export function buildKnowledge(companyId) {
  const company = getCompany(companyId);
  const settings = getAiSettings(companyId);
  const services = all(`SELECT * FROM services WHERE company_id = ? AND active = 1 ORDER BY sort_order, name`, companyId);
  const faqs = all('SELECT question, answer FROM faqs WHERE company_id = ? ORDER BY id', companyId);
  const hours = DAYS.slice(1).concat('sun').map((d) => {
    const h = company.opening_hours[d];
    return { day: DAY_NAMES[d], text: h.closed ? 'Closed' : `${h.open}–${h.close}` };
  });
  // Live availability, computed from the real booking calendar right now.
  const today = todayIn(company.timezone);
  const availability = company.booking_enabled ? services.map((s) => {
    const days = [];
    for (let i = 0; i < 21 && days.length < 3; i++) {
      const d = addDays(today, i);
      const slots = availableSlots(company, s, d);
      if (slots.length) days.push({ date: d, times: slots.slice(0, 6) });
    }
    return { service: s.name, next_available: days };
  }) : [];
  return { company, settings, services, faqs, hours, availability };
}

function knowledgeText(k) {
  const c = k.company;
  const lines = [];
  lines.push(`Company: ${c.name}`);
  if (c.address || c.city) lines.push(`Address: ${[c.address, c.postal_code, c.city, c.country].filter(Boolean).join(', ')}`);
  if (c.phone) lines.push(`Phone: ${c.phone}`);
  if (c.email) lines.push(`Email: ${c.email}`);
  if (c.website) lines.push(`Website: ${c.website}`);
  lines.push('', 'Opening hours:', ...k.hours.map((h) => `- ${h.day}: ${h.text}`));
  lines.push('', 'Services and prices (currency ' + c.currency + '):');
  for (const s of k.services) lines.push(`- ${s.name}: ${priceLabel(s, c.currency)}, about ${s.duration_min} minutes. ${s.description || ''}`.trim());
  if (k.settings?.company_info) lines.push('', 'About the company:', k.settings.company_info);
  if (k.settings?.service_area) lines.push('', 'Service area:', k.settings.service_area);
  if (k.settings?.policies) lines.push('', 'Policies:', k.settings.policies);
  if (k.faqs.length) {
    lines.push('', 'Frequently asked questions:');
    for (const f of k.faqs) lines.push(`Q: ${f.question}\nA: ${f.answer}`);
  }
  lines.push('', `Online booking: ${c.booking_enabled ? 'enabled (customers book via the booking page)' : 'currently disabled'}`);
  if (k.availability.length) {
    lines.push('Live availability (from the booking calendar, computed just now; may change):');
    for (const a of k.availability) {
      lines.push(`- ${a.service}: ${a.next_available.length ? a.next_available.map((d) => `${d.date} (${d.times.join(', ')})`).join('; ') : 'no free slots in the next 3 weeks'}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Claude-powered responder (used when ANTHROPIC_API_KEY is configured)
// ---------------------------------------------------------------------------
let client;
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'escalate', 'escalation_reason', 'intent', 'language'],
  properties: {
    reply: { type: 'string' },
    escalate: { type: 'boolean' },
    escalation_reason: { type: 'string' },
    intent: { type: 'string', enum: ['question', 'pricing', 'booking', 'hours', 'contact', 'complaint', 'other'] },
    language: { type: 'string' },
  },
};

function systemPrompt(k) {
  const s = k.settings;
  const langs = s.languages.map((l) => LANGUAGES[l] || l).join(', ');
  return `You are ${s.assistant_name}, the customer support assistant for ${k.company.name}, a professional cleaning company. You chat with website visitors.

Your only source of truth is the VERIFIED COMPANY INFORMATION below. Treat it as complete: if something is not stated there, you do not know it.

Rules:
- Never invent or estimate prices, discounts, availability, time slots, service areas, guarantees or policies. Quote prices and times exactly as listed.
- If a question needs information that is not listed (custom quotes, unlisted services, damage, complaints, refunds, invoices, legal or insurance matters, anything you are unsure about), say you will pass it to the team, and set escalate to true with a short escalation_reason. Also escalate when the visitor asks for a human.
- You cannot create, confirm, change or cancel bookings yourself. To book, direct visitors to the booking page (the chat window has a "Book now" button). You may mention the live availability listed below, but say slots are confirmed only once the booking request is accepted.
- Do not ask visitors to type personal details into the chat. If they want to be contacted, ask them to use the "Share contact details" button, which asks for their consent.
- Reply in the visitor's language if it is one of: ${langs}. Otherwise reply in ${LANGUAGES[s.languages[0]] || 'English'} and say which languages you support.
- Be warm, concise and professional: usually 1–4 short sentences, plain text, no markdown headings.
- Today's date is ${todayIn(k.company.timezone)}.

VERIFIED COMPANY INFORMATION
${knowledgeText(k)}`;
}

async function claudeRespond(k, history) {
  client ??= new Anthropic();
  const messages = [];
  for (const m of history) {
    const role = m.role === 'visitor' ? 'user' : 'assistant';
    const content = m.role === 'staff' ? `[Message from a team member] ${m.content}` : m.content;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else messages.push({ role, content });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const response = await client.beta.messages.create({
    model: config.anthropic.model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    system: systemPrompt(k),
    messages,
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new Error(`Claude stop_reason=${response.stop_reason}`);
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) throw new Error('Empty reply');
  return { ...parsed, engine: 'claude' };
}

// ---------------------------------------------------------------------------
// Grounded rule-based responder (always available; never makes things up)
// ---------------------------------------------------------------------------
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ');
const STOP = new Set('a an the is are do does you your i we our to of for in on at and or can how what when where which with my me it be have has much many there any'.split(' '));
const tokens = (s) => norm(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const has = (text, words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

function matchService(text, services) {
  const t = norm(text);
  let best = null; let bestScore = 0;
  for (const s of services) {
    const name = norm(s.name);
    if (t.includes(name)) return s;
    const nameTokens = tokens(s.name).filter((w) => w !== 'cleaning');
    const score = nameTokens.filter((w) => t.includes(w)).length / Math.max(nameTokens.length, 1);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

function matchFaq(text, faqs) {
  const q = new Set(tokens(text));
  if (!q.size) return null;
  let best = null; let bestScore = 0;
  for (const f of faqs) {
    const ft = new Set(tokens(f.question));
    const overlap = [...q].filter((w) => ft.has(w) || [...ft].some((x) => x.startsWith(w.slice(0, 5)) && w.length > 4)).length;
    const score = overlap / Math.min(q.size, ft.size || 1);
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

export function ruleRespond(k, text) {
  const { company, settings, services } = k;
  const cur = company.currency;
  const out = (reply, intent, escalate = false, escalation_reason = '') => ({ reply, intent, escalate, escalation_reason, language: 'en', engine: 'rules' });

  if (has(text, ['human', 'person', 'agent', 'manager', 'someone', 'call me', 'speak to', 'talk to'])) {
    return out(settings.escalation_message, 'other', true, 'Visitor asked for a human');
  }
  if (has(text, ['complain', 'complaint', 'refund', 'damage', 'damaged', 'broken', 'stolen', 'insurance', 'lawyer', 'invoice', 'unhappy', 'disappointed', 'angry', 'terrible'])) {
    return out(`I'm sorry to hear that. This needs personal attention, so I've passed your message to the ${company.name} team. ${settings.escalation_message}`, 'complaint', true, 'Complaint / sensitive issue');
  }

  const faq = matchFaq(text, k.faqs);
  const service = matchService(text, services);
  const asksPrice = has(text, ['price', 'cost', 'how much', 'rate', 'quote', 'fee', 'charge', 'expensive', 'cheap', 'tariff']);
  const asksBook = has(text, ['book', 'appointment', 'schedule', 'available', 'availability', 'slot', 'reserve', 'come', 'tomorrow', 'next week']);

  if (asksPrice && !service && faq) return out(faq.answer, 'question');
  if (asksPrice) {
    if (service) return out(`${service.name} costs ${priceLabel(service, cur)} and takes about ${Math.round(service.duration_min / 6) / 10} hours. ${service.description || ''}`.trim(), 'pricing');
    if (!services.length) return out(`I don't have verified prices on file yet, so I've asked the team to get back to you. ${settings.escalation_message}`, 'pricing', true, 'No prices configured');
    return out(`Here are our current prices:\n${services.map((s) => `• ${s.name}: ${priceLabel(s, cur)}`).join('\n')}\n\nFor anything not listed, I can pass your question to the team.`, 'pricing');
  }
  if (asksBook) {
    if (!company.booking_enabled) return out(`Online booking is currently paused. ${settings.escalation_message}`, 'booking', true, 'Booking request while online booking disabled');
    const avail = service ? k.availability.find((a) => a.service === service.name) : null;
    let extra = '';
    if (avail) {
      extra = avail.next_available.length
        ? ` The next free times for ${service.name} are: ${avail.next_available.map((d) => `${d.date} (${d.times.slice(0, 3).join(', ')})`).join('; ')}.`
        : ` I don't see free times for ${service.name} in the next three weeks.`;
    }
    return out(`You can request an appointment with the "Book now" button: pick a service, date and time, and the team will confirm it.${extra} Times are only reserved once your request is accepted.`, 'booking');
  }
  if (faq) return out(faq.answer, 'question');
  if (has(text, ['open', 'hours', 'closed', 'opening', 'weekend', 'sunday', 'saturday', 'when'])) {
    return out(`Our opening hours are:\n${k.hours.map((h) => `• ${h.day}: ${h.text}`).join('\n')}`, 'hours');
  }
  if (has(text, ['service', 'offer', 'do you clean', 'what do you', 'options', 'types'])) {
    if (!services.length) return out(`I don't have our service list on file yet. ${settings.escalation_message}`, 'question', true, 'No services configured');
    return out(`We offer:\n${services.map((s) => `• ${s.name} – ${s.description || priceLabel(s, cur)}`).join('\n')}\n\nAsk me about any of them for prices.`, 'question');
  }
  if (service) return out(`${service.name}: ${service.description || ''} Price: ${priceLabel(service, cur)}, about ${service.duration_min} minutes.`.replace(/\s+/g, ' '), 'question');
  if (has(text, ['contact', 'phone', 'email', 'address', 'located', 'location', 'where are you', 'reach'])) {
    const parts = [company.phone && `phone ${company.phone}`, company.email && `email ${company.email}`,
      (company.address || company.city) && `address ${[company.address, company.city].filter(Boolean).join(', ')}`].filter(Boolean);
    if (parts.length) return out(`You can reach ${company.name} by ${parts.join(', ')}.`, 'contact');
  }
  if (/^\s*(hi|hello|hey|hallo|good (morning|afternoon|evening)|thanks|thank you)\b/i.test(text)) {
    return out(/thank/i.test(text) ? 'You\'re welcome! Anything else I can help with?' : settings.welcome_message, 'other');
  }
  return out(`I don't have verified information to answer that, so I've passed your question to the ${company.name} team. ${settings.escalation_message}`, 'other', true, 'No verified answer available');
}

export const assistantEngine = () => (config.anthropic.configured ? 'claude' : 'rules');

export async function respond(companyId, history) {
  const k = buildKnowledge(companyId);
  const lastVisitor = [...history].reverse().find((m) => m.role === 'visitor');
  if (config.anthropic.configured) {
    try {
      return await claudeRespond(k, history);
    } catch (err) {
      console.error('[assistant] Claude request failed, using grounded fallback:', err.message);
    }
  }
  return ruleRespond(k, lastVisitor?.content || '');
}
