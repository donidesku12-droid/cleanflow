import { Router } from 'express';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { config } from '../config.js';
import { parse, v, idParam, notFound, badRequest, randomToken, logActivity } from '../lib/core.js';
import { requireRole, requireFeature } from '../lib/auth.js';
import { getAiSettings, LANGUAGES, assistantEngine, respond } from '../lib/assistant.js';
import { notifySafe } from '../lib/notify.js';

const router = Router();
router.use(requireRole('owner', 'manager'), requireFeature('ai_assistant'));

router.get('/settings', (req, res) => {
  res.json({
    settings: getAiSettings(req.user.companyId),
    faqs: all('SELECT * FROM faqs WHERE company_id = ? ORDER BY id', req.user.companyId),
    languages: LANGUAGES,
    engine: assistantEngine(),
    model: config.anthropic.configured ? config.anthropic.model : null,
  });
});

router.put('/settings', (req, res) => {
  const b = parse(z.object({
    enabled: z.boolean(),
    assistant_name: v.text(40).min(1, 'is required'),
    welcome_message: v.text(500).min(1, 'is required'),
    company_info: v.optText(6000),
    policies: v.optText(6000),
    service_area: v.optText(1000),
    languages: z.array(z.enum(Object.keys(LANGUAGES))).min(1, 'select at least one language'),
    escalation_message: v.text(500).min(1, 'is required'),
  }), req.body);
  run(`UPDATE ai_settings SET enabled = ?, assistant_name = ?, welcome_message = ?, company_info = ?, policies = ?, service_area = ?, languages = ?, escalation_message = ?
       WHERE company_id = ?`, +b.enabled, b.assistant_name, b.welcome_message, b.company_info, b.policies, b.service_area,
  JSON.stringify(b.languages), b.escalation_message, req.user.companyId);
  logActivity(req.user.companyId, req.user.id, 'updated', 'assistant', null, `${req.user.name} updated AI assistant settings`);
  res.json({ settings: getAiSettings(req.user.companyId) });
});

const faqSchema = z.object({ question: v.text(300).min(3, 'is required'), answer: v.text(3000).min(1, 'is required') });
router.post('/faqs', (req, res) => {
  const b = parse(faqSchema, req.body);
  const id = Number(run('INSERT INTO faqs (company_id, question, answer) VALUES (?, ?, ?)', req.user.companyId, b.question, b.answer).lastInsertRowid);
  res.status(201).json({ faq: one('SELECT * FROM faqs WHERE id = ?', id) });
});
router.patch('/faqs/:id', (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(faqSchema, req.body);
  const info = run('UPDATE faqs SET question = ?, answer = ? WHERE id = ? AND company_id = ?', b.question, b.answer, id, req.user.companyId);
  if (!info.changes) throw notFound('FAQ');
  res.json({ faq: one('SELECT * FROM faqs WHERE id = ?', id) });
});
router.delete('/faqs/:id', (req, res) => {
  const info = run('DELETE FROM faqs WHERE id = ? AND company_id = ?', idParam(req.params.id), req.user.companyId);
  if (!info.changes) throw notFound('FAQ');
  res.json({ ok: true });
});

// ---------- Conversations inbox ----------
router.get('/conversations', (req, res) => {
  const status = z.enum(['all', 'open', 'escalated', 'resolved']).catch('all').parse(req.query.status);
  const rows = all(`SELECT c.*, (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM chat_conversations c WHERE c.company_id = ? AND c.is_test = 0 ${status !== 'all' ? 'AND c.status = ?' : ''}
    ORDER BY c.status = 'escalated' DESC, c.updated_at DESC LIMIT 200`, ...(status !== 'all' ? [req.user.companyId, status] : [req.user.companyId]));
  const counts = Object.fromEntries(all(`SELECT status, COUNT(*) n FROM chat_conversations WHERE company_id = ? AND is_test = 0 GROUP BY status`, req.user.companyId).map((r) => [r.status, r.n]));
  res.json({ conversations: rows, counts });
});

function loadConversation(req) {
  const c = one('SELECT * FROM chat_conversations WHERE id = ? AND company_id = ?', idParam(req.params.id), req.user.companyId);
  if (!c) throw notFound('Conversation');
  return c;
}

router.get('/conversations/:id', (req, res) => {
  const c = loadConversation(req);
  res.json({ conversation: c, messages: all('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id', c.id) });
});

router.post('/conversations/:id/reply', (req, res) => {
  const c = loadConversation(req);
  const { message } = parse(z.object({ message: v.text(2000).min(1, 'is required') }), req.body);
  run(`INSERT INTO chat_messages (conversation_id, role, content, meta) VALUES (?, 'staff', ?, ?)`, c.id, message, JSON.stringify({ by: req.user.name }));
  run(`UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?`, c.id);
  res.status(201).json({ messages: all('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id', c.id) });
});

router.post('/conversations/:id/status', (req, res) => {
  const c = loadConversation(req);
  const { status } = parse(z.object({ status: z.enum(['open', 'escalated', 'resolved']) }), req.body);
  run(`UPDATE chat_conversations SET status = ?, updated_at = datetime('now') WHERE id = ?`, status, c.id);
  res.json({ ok: true });
});

// ---------- Owner test chat (does not appear in the inbox) ----------
router.post('/test', async (req, res) => {
  const b = parse(z.object({
    messages: z.array(z.object({ role: z.enum(['visitor', 'assistant']), content: v.text(2000).min(1) })).min(1).max(30),
  }), req.body);
  if (b.messages[b.messages.length - 1].role !== 'visitor') throw badRequest('The last message must be from the visitor');
  res.json(await respond(req.user.companyId, b.messages));
});

// ---------- Shared handler for the public widget ----------
export async function handleVisitorMessage(company, conversation, text) {
  run(`INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, 'visitor', ?)`, conversation.id, text);
  const history = all('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 30', conversation.id).reverse();
  const result = await respond(company.id, history);
  run(`INSERT INTO chat_messages (conversation_id, role, content, meta) VALUES (?, 'assistant', ?, ?)`, conversation.id, result.reply,
    JSON.stringify({ engine: result.engine, intent: result.intent, escalate: result.escalate }));
  if (result.escalate && conversation.status !== 'escalated') {
    run(`UPDATE chat_conversations SET status = 'escalated', escalation_reason = ?, updated_at = datetime('now') WHERE id = ?`,
      result.escalation_reason || 'Needs a human', conversation.id);
    notifySafe(company.id, 'chat_escalated', {
      title: 'Chat needs a human reply', body: `${result.escalation_reason || 'Escalated'} – “${text.slice(0, 120)}”`,
      link: `/app/assistant?tab=inbox&open=${conversation.id}`, emailTo: [company.email],
    });
  } else {
    run(`UPDATE chat_conversations SET updated_at = datetime('now'), language = COALESCE(?, language) WHERE id = ?`, result.language || null, conversation.id);
  }
  return result;
}

export const newConversationToken = () => randomToken(24);
export default router;
