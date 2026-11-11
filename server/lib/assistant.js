import Anthropic from '@anthropic-ai/sdk';
import { all, one } from '../db.js';
import { config } from '../config.js';
import { DAYS, formatMoney, todayIn, addDays, fmtWhen } from './core.js';
import { availableSlots, getCompany } from './availability.js';

const DAY_NAMES = { mon: 'Maandag', tue: 'Dinsdag', wed: 'Woensdag', thu: 'Donderdag', fri: 'Vrijdag', sat: 'Zaterdag', sun: 'Zondag' };
export const LANGUAGES = { nl: 'Nederlands', en: 'Engels', de: 'Duits', fr: 'Frans', es: 'Spaans', it: 'Italiaans', pt: 'Portugees', pl: 'Pools' };
const LANGUAGE_EN = { nl: 'Dutch', en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', pl: 'Polish' };

export function getAiSettings(companyId) {
  const s = one('SELECT * FROM ai_settings WHERE company_id = ?', companyId);
  return s ? { ...s, languages: JSON.parse(s.languages) } : null;
}

export function priceLabel(s, currency) {
  const p = formatMoney(s.price_cents, currency);
  return s.price_unit === 'from' ? `vanaf ${p}` : s.price_unit === 'per_hour' ? `${p} per uur` : p;
}

const durationNl = (min) => {
  const h = Math.floor(min / 60); const m = min % 60;
  if (!h) return `${m} minuten`;
  return `${h === 1 ? '1 uur' : `${h} uur`}${m ? ` en ${m} minuten` : ''}`;
};

/** Everything the assistant is allowed to rely on. Nothing outside this object is "verified". */
export function buildKnowledge(companyId) {
  const company = getCompany(companyId);
  const settings = getAiSettings(companyId);
  const services = all(`SELECT * FROM services WHERE company_id = ? AND active = 1 ORDER BY sort_order, name`, companyId);
  const faqs = all('SELECT question, answer FROM faqs WHERE company_id = ? ORDER BY id', companyId);
  const hours = DAYS.slice(1).concat('sun').map((d) => {
    const h = company.opening_hours[d];
    return { day: DAY_NAMES[d], text: h.closed ? 'Gesloten' : `${h.open}–${h.close}` };
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
  lines.push('', `Services and prices (currency ${c.currency}):`);
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
  const langs = s.languages.map((l) => LANGUAGE_EN[l] || l).join(', ');
  const primary = LANGUAGE_EN[s.languages[0]] || 'Dutch';
  return `You are ${s.assistant_name}, the customer support assistant for ${k.company.name}, a professional cleaning company. You chat with website visitors.

Your only source of truth is the VERIFIED COMPANY INFORMATION below. Treat it as complete: if something is not stated there, you do not know it.

Rules:
- Never invent or estimate prices, discounts, availability, time slots, service areas, guarantees or policies. Quote prices and times exactly as listed.
- If a question needs information that is not listed (custom quotes, unlisted services, damage, complaints, refunds, invoices, legal or insurance matters, anything you are unsure about), say you will pass it to the team, and set escalate to true with a short escalation_reason written in Dutch. Also escalate when the visitor asks for a human.
- You cannot create, confirm, change or cancel bookings yourself. To book, direct visitors to the booking page (the chat window has a "Nu boeken" button). You may mention the live availability listed below, but say slots are confirmed only once the booking request is accepted.
- Do not ask visitors to type personal details into the chat. If they want to be contacted, ask them to use the "Contactgegevens delen" button, which asks for their consent.
- Reply in the visitor's language if it is one of: ${langs}. Otherwise reply in ${primary} and say which languages you support. When in doubt, reply in ${primary}.
- Write dates in a natural way (for example "donderdag 12 november" in Dutch).
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
// Grounded rule-based responder (always available; never makes things up).
// Understands Dutch and English questions and answers in Dutch.
// ---------------------------------------------------------------------------
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ');
const STOP = new Set(('a an the is are do does you your i we our to of for in on at and or can how what when where which with my me it be have has much many there any '
  + 'de het een is zijn ik jij je jullie u wij we ons onze mijn wat hoe wanneer waar welke met voor van aan op in en of kan kunnen hebben heeft er dat die dit '
  + 'ook nog wel niet maar als bij om te tot zo veel').split(' '));
const tokens = (s) => norm(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const has = (text, words) => { const t = norm(text); return words.some((w) => new RegExp(`(^|\\s)${w}`, 'i').test(t)); };

/** Extra Dutch/English words that point at a specific service, matched by word stem. */
const SERVICE_HINTS = [
  [/dieptereinig|grondig|deep/, /diepte|deep/],
  [/kantoor|office|bedrijfspand/, /kantoor|office/],
  [/raam|ramen|glas|window/, /glas|raam|window/],
  [/intrek|move.?in|nieuwe woning/, /intrek|move.?in/],
  [/opleve|uittrek|verhuis|move.?out|borg/, /opleve|move.?out/],
  [/huishoud|regulier|wekelijk|regular|home/, /huishoud|regulier|regular/],
];

function matchService(text, services) {
  const t = norm(text);
  for (const s of services) if (t.includes(norm(s.name).trim())) return s;
  for (const [ask, svc] of SERVICE_HINTS) {
    if (ask.test(t)) {
      const s = services.find((x) => svc.test(norm(x.name)));
      if (s) return s;
    }
  }
  let best = null; let bestScore = 0;
  for (const s of services) {
    const nameTokens = tokens(s.name).filter((w) => !/schoonmaak|cleaning|reiniging/.test(w));
    const score = nameTokens.filter((w) => t.includes(w.slice(0, Math.max(5, w.length - 2)))).length / Math.max(nameTokens.length, 1);
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
    const overlap = [...q].filter((w) => ft.has(w) || [...ft].some((x) => w.length > 4 && x.startsWith(w.slice(0, 5)))).length;
    const score = overlap / Math.min(q.size, ft.size || 1);
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

const W = {
  human: ['mens', 'medewerker', 'iemand spreken', 'persoon', 'bellen', 'bel me', 'terugbellen', 'manager', 'eigenaar', 'human', 'person', 'agent', 'someone', 'call me', 'speak to', 'talk to'],
  complaint: ['klacht', 'klagen', 'geld terug', 'terugbetal', 'restitutie', 'schade', 'kapot', 'gebroken', 'gestolen', 'verzekering', 'advocaat', 'factuur', 'ontevreden', 'teleurgesteld', 'boos', 'slecht',
    'complain', 'refund', 'damage', 'broken', 'broke', 'stolen', 'insurance', 'lawyer', 'invoice', 'unhappy', 'disappointed', 'angry', 'terrible'],
  price: ['prijs', 'prijzen', 'kost', 'kosten', 'tarief', 'tarieven', 'hoeveel', 'offerte', 'goedkoop', 'betalen', 'price', 'cost', 'how much', 'rate', 'quote', 'fee', 'charge', 'expensive', 'cheap'],
  book: ['boek', 'boeken', 'afspraak', 'inplannen', 'plannen', 'beschikbaar', 'plek', 'langskomen', 'morgen', 'volgende week', 'reserver', 'wanneer kunnen',
    'book', 'appointment', 'schedule', 'available', 'availability', 'slot', 'reserve', 'tomorrow', 'next week'],
  hours: ['open', 'openingstijd', 'geopend', 'gesloten', 'dicht', 'weekend', 'zondag', 'zaterdag', 'tijden', 'bereikbaar', 'hours', 'closed', 'opening', 'sunday', 'saturday'],
  services: ['dienst', 'diensten', 'aanbod', 'bieden', 'doen jullie', 'wat doen', 'soorten', 'mogelijkheden', 'service', 'offer', 'what do you', 'options', 'types'],
  contact: ['contact', 'telefoon', 'telefoonnummer', 'mail', 'adres', 'gevestigd', 'locatie', 'waar zitten', 'phone', 'email', 'address', 'located', 'location', 'where are you', 'reach'],
};

export function ruleRespond(k, text) {
  const { company, settings, services } = k;
  const cur = company.currency;
  const out = (reply, intent, escalate = false, escalation_reason = '') => ({ reply, intent, escalate, escalation_reason, language: 'nl', engine: 'rules' });

  if (has(text, W.human)) {
    return out(settings.escalation_message, 'other', true, 'Bezoeker wil iemand spreken');
  }
  if (has(text, W.complaint)) {
    return out(`Wat vervelend om te horen. Dit vraagt om persoonlijke aandacht, dus ik heb je bericht doorgestuurd naar het team van ${company.name}. ${settings.escalation_message}`, 'complaint', true, 'Klacht of gevoelige vraag');
  }

  const faq = matchFaq(text, k.faqs);
  const service = matchService(text, services);
  const asksPrice = has(text, W.price);
  const asksBook = has(text, W.book);

  if (asksPrice && !service && faq) return out(faq.answer, 'question');
  if (asksPrice) {
    if (service) return out(`${service.name} kost ${priceLabel(service, cur)} en duurt ongeveer ${durationNl(service.duration_min)}. ${service.description || ''}`.trim(), 'pricing');
    if (!services.length) return out(`Ik heb nog geen prijzen die ik met zekerheid kan noemen, dus ik heb het team gevraagd contact met je op te nemen. ${settings.escalation_message}`, 'pricing', true, 'Geen prijzen ingesteld');
    return out(`Dit zijn onze huidige prijzen:\n${services.map((s) => `• ${s.name}: ${priceLabel(s, cur)}`).join('\n')}\n\nStaat wat je zoekt er niet tussen? Dan stuur ik je vraag door naar het team.`, 'pricing');
  }
  if (asksBook) {
    if (!company.booking_enabled) return out(`Online boeken is op dit moment niet mogelijk. ${settings.escalation_message}`, 'booking', true, 'Afspraak gevraagd terwijl online boeken uit staat');
    const avail = service ? k.availability.find((a) => a.service === service.name) : null;
    let extra = '';
    if (avail) {
      extra = avail.next_available.length
        ? ` De eerstvolgende vrije tijden voor ${service.name} zijn: ${avail.next_available.map((d) => `${fmtWhen(d.date)} (${d.times.slice(0, 3).join(', ')})`).join('; ')}.`
        : ` Ik zie de komende drie weken geen vrije tijden voor ${service.name}.`;
    }
    return out(`Je kunt een afspraak aanvragen met de knop "Nu boeken": kies een dienst, datum en tijd, en het team bevestigt je afspraak.${extra} Een tijd is pas definitief als je aanvraag is bevestigd.`, 'booking');
  }
  if (faq) return out(faq.answer, 'question');
  if (has(text, W.hours)) {
    return out(`Onze openingstijden zijn:\n${k.hours.map((h) => `• ${h.day}: ${h.text}`).join('\n')}`, 'hours');
  }
  if (has(text, W.services)) {
    if (!services.length) return out(`Ik heb onze diensten nog niet in mijn gegevens staan. ${settings.escalation_message}`, 'question', true, 'Geen diensten ingesteld');
    return out(`Wij bieden:\n${services.map((s) => `• ${s.name} – ${s.description || priceLabel(s, cur)}`).join('\n')}\n\nVraag me gerust naar de prijs van een dienst.`, 'question');
  }
  if (service) return out(`${service.name}: ${service.description || ''} Prijs: ${priceLabel(service, cur)}, duur ongeveer ${durationNl(service.duration_min)}.`.replace(/\s+/g, ' '), 'question');
  if (has(text, W.contact)) {
    const parts = [company.phone && `telefonisch via ${company.phone}`, company.email && `per e-mail via ${company.email}`,
      (company.address || company.city) && `op ons adres: ${[company.address, company.city].filter(Boolean).join(', ')}`].filter(Boolean);
    if (parts.length) return out(`Je kunt ${company.name} bereiken ${parts.join(', ')}.`, 'contact');
  }
  if (/^\s*(hoi|hallo|hey|hi|hello|goede(morgen|middag|navond)|goedemorgen|goedemiddag|goedenavond|good (morning|afternoon|evening)|dag|dank|bedankt|thanks|thank you)\b/i.test(text)) {
    return out(/dank|thank/i.test(text) ? 'Graag gedaan! Kan ik je nog ergens anders mee helpen?' : settings.welcome_message, 'other');
  }
  return out(`Daar heb ik geen gegevens over waar ik zeker van ben, dus ik heb je vraag doorgestuurd naar het team van ${company.name}. ${settings.escalation_message}`, 'other', true, 'Geen kloppend antwoord beschikbaar');
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
