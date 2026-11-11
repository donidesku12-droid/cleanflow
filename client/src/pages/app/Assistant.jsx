import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bot, Settings2, HelpCircle, FlaskConical, Inbox, Plus, Pencil, Trash2, Send, RotateCcw, Link2, Copy, ShieldCheck, Info, CheckCircle2, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/context.jsx';
import { timeAgo } from '../../lib/format.js';
import {
  Button, Card, CardHeader, Input, Textarea, Toggle, Modal, Tabs, EmptyState, ErrorState, PageLoader, PageHeader, Badge, ConfirmDialog, UpgradeNotice, Spinner, cx, useForm,
} from '../../components/ui.jsx';
import { Bubble } from '../../components/ChatWidget.jsx';

function SettingsTab({ data, onSaved }) {
  const toast = useToast();
  const f = useForm(data.settings);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const v = f.values;
      await api.put('/assistant/settings', { enabled: !!v.enabled, assistant_name: v.assistant_name, welcome_message: v.welcome_message, company_info: v.company_info || null,
        policies: v.policies || null, service_area: v.service_area || null, languages: v.languages, escalation_message: v.escalation_message });
      toast.success('Assistant settings saved'); onSaved();
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  const toggleLang = (l) => f.setValues((v) => ({ ...v, languages: v.languages.includes(l) ? v.languages.filter((x) => x !== l) : [...v.languages, l] }));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Assistant profile" description="How your assistant introduces itself and what it knows." />
        <div className="space-y-5 p-5">
          <Toggle checked={!!f.values.enabled} onChange={f.set('enabled')} label="Assistant enabled" description="Shows the chat button on your booking page and enables the chat link." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Assistant name" value={f.values.assistant_name} onChange={f.set('assistant_name')} error={f.errors.assistant_name} />
          </div>
          <Textarea label="Welcome message" value={f.values.welcome_message} onChange={f.set('welcome_message')} error={f.errors.welcome_message} rows={2} />
          <Textarea label="About your company" value={f.values.company_info || ''} onChange={f.set('company_info')} error={f.errors.company_info} rows={4}
            hint="History, what makes you different, staff, products used… The assistant treats this as verified information." />
          <Textarea label="Policies" value={f.values.policies || ''} onChange={f.set('policies')} error={f.errors.policies} rows={4} placeholder="Cancellation, payment, guarantees, keys…" />
          <Input label="Service area" value={f.values.service_area || ''} onChange={f.set('service_area')} error={f.errors.service_area} placeholder="e.g. Amsterdam, Amstelveen and Haarlem" />
          <Textarea label="Escalation message" value={f.values.escalation_message} onChange={f.set('escalation_message')} error={f.errors.escalation_message} rows={2}
            hint="Shown when a question is handed over to your team." />
          <div>
            <span className="label">Supported languages</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.languages).map(([code, name]) => (
                <button key={code} type="button" onClick={() => toggleLang(code)} className={cx('rounded-full border px-3 py-1.5 text-sm font-medium transition',
                  f.values.languages.includes(code) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>{name}</button>
              ))}
            </div>
            {f.errors.languages && <p className="mt-1.5 text-xs font-medium text-red-600">{f.errors.languages}</p>}
            {data.engine !== 'claude' && f.values.languages.some((l) => l !== 'en') && <p className="mt-2 text-xs text-amber-700">Multilingual replies require the Claude integration. The built-in engine answers in English.</p>}
          </div>
          <div className="flex justify-end"><Button onClick={save} loading={saving}>Save settings</Button></div>
        </div>
      </Card>
      <div className="space-y-6">
        <Card className="p-5">
          <ShieldCheck className="size-6 text-emerald-500" />
          <h3 className="mt-3 font-semibold">Grounded by design</h3>
          <p className="mt-1.5 text-sm text-navy-500">The assistant only uses what you've verified here, plus:</p>
          <ul className="mt-3 space-y-2 text-sm text-navy-600">
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Active services & prices (<Link to="/app/services" className="font-medium text-emerald-600 hover:underline">Services</Link>)</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Opening hours & contact details (<Link to="/app/settings?tab=company" className="font-medium text-emerald-600 hover:underline">Settings</Link>)</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Your FAQs</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Live free slots from your calendar</li>
          </ul>
          <p className="mt-3 text-sm text-navy-500">It never invents prices, availability or policies, can't confirm bookings itself, and escalates anything it can't answer.</p>
        </Card>
        <ShareCard />
      </div>
    </div>
  );
}

function ShareCard() {
  const { company } = useAuth();
  const toast = useToast();
  const links = [['Chat page', `${window.location.origin}/chat/${company.slug}`], ['Booking page (with chat)', `${window.location.origin}/book/${company.slug}`]];
  return (
    <Card className="p-5">
      <Link2 className="size-6 text-sky-500" />
      <h3 className="mt-3 font-semibold">Share your assistant</h3>
      <div className="mt-3 space-y-3">
        {links.map(([label, url]) => (
          <div key={label}>
            <p className="text-xs font-semibold text-navy-400">{label}</p>
            <div className="mt-1 flex gap-2">
              <input readOnly value={url} className="input py-2 text-xs" aria-label={label} onFocus={(e) => e.target.select()} />
              <Button size="sm" variant="secondary" icon={Copy} aria-label={`Copy ${label}`} onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'), () => toast.error('Could not copy'))} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FaqTab({ faqs, onChange }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const body = { question: editing.question, answer: editing.answer };
      if (editing.id) await api.patch(`/assistant/faqs/${editing.id}`, body); else await api.post('/assistant/faqs', body);
      toast.success('FAQ saved'); setEditing(null); onChange();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await api.del(`/assistant/faqs/${deleting.id}`); toast.success('FAQ deleted'); setDeleting(null); onChange(); } catch (err) { toast.error(err.message); }
  };
  return (
    <Card>
      <CardHeader title="Frequently asked questions" description="Verified answers your assistant can use word-for-word." action={<Button size="sm" icon={Plus} onClick={() => setEditing({ question: '', answer: '' })}>Add FAQ</Button>} />
      {faqs.length === 0 ? <EmptyState icon={HelpCircle} title="No FAQs yet" description="Add questions customers often ask, like key handling or what to prepare." action={<Button size="sm" icon={Plus} onClick={() => setEditing({ question: '', answer: '' })}>Add FAQ</Button>} /> : (
        <ul className="divide-y divide-navy-100">
          {faqs.map((f) => (
            <li key={f.id} className="flex gap-4 px-5 py-4">
              <div className="min-w-0 flex-1"><p className="font-semibold">{f.question}</p><p className="mt-1 text-sm whitespace-pre-line text-navy-500">{f.answer}</p></div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(f)} aria-label="Edit FAQ" />
                <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(f)} aria-label="Delete FAQ" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit FAQ' : 'Add FAQ'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
        {editing && <div className="space-y-4">
          <Input label="Question" value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
          <Textarea label="Answer" rows={5} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
        </div>}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} danger title="Delete this FAQ?" confirmLabel="Delete" message={deleting?.question} />
    </Card>
  );
}

function TestTab({ settings, engine }) {
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);
  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    const next = [...messages, { role: 'visitor', content: text.trim() }];
    setMessages(next); setText(''); setBusy(true); setError('');
    try {
      const r = await api.post('/assistant/test', { messages: next });
      setMessages([...next, { role: 'assistant', content: r.reply }]);
      setMeta((m) => [...m, r]);
    } catch (err) { setError(err.message); setMessages(messages); setText(next[next.length - 1].content); } finally { setBusy(false); }
  };
  const last = meta[meta.length - 1];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="flex h-[560px] flex-col overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3">
          <p className="font-semibold">Test {settings.assistant_name}</p>
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setMessages([]); setMeta([]); }}>Reset</Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">
          <Bubble m={{ role: 'assistant', content: settings.welcome_message }} />
          {messages.map((m, i) => <Bubble key={i} m={m} />)}
          {busy && <Spinner className="ml-9 size-5" />}
          <div ref={end} />
        </div>
        {error && <p className="px-5 text-xs font-medium text-red-600">{error}</p>}
        <form onSubmit={send} className="flex gap-2 border-t border-navy-100 p-3">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask something a customer would ask…" aria-label="Test message" />
          <Button type="submit" icon={Send} disabled={!text.trim()} loading={busy}>Send</Button>
        </form>
      </Card>
      <div className="space-y-6">
        <Card className="p-5">
          <p className="text-xs font-semibold tracking-wide text-navy-400 uppercase">Last response</p>
          {!last ? <p className="mt-2 text-sm text-navy-400">Send a message to see how the assistant classifies it.</p> : (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-navy-500">Engine</dt><dd className="font-medium">{last.engine === 'claude' ? 'Claude' : 'Built-in rules'}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Intent</dt><dd className="font-medium capitalize">{last.intent}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Escalate to team</dt><dd>{last.escalate ? <Badge color="amber">Yes</Badge> : <Badge color="emerald">No</Badge>}</dd></div>
              {last.escalate && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{last.escalation_reason}</p>}
            </dl>
          )}
        </Card>
        <Card className="p-5 text-sm text-navy-500">
          <Info className="mb-2 size-5 text-sky-500" />
          Test conversations aren't saved and don't notify your team. Try: “How much is a deep clean?”, “Are you open on Sunday?”, “I want a refund”.
          {engine !== 'claude' && <p className="mt-2">You're using the built-in engine, which matches questions to your services, hours and FAQs.</p>}
        </Card>
      </div>
    </div>
  );
}

function InboxTab() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('all');
  const list = useApi(`/assistant/conversations${qs({ status })}`);
  const openId = params.get('open');
  const conv = useApi(openId ? `/assistant/conversations/${openId}` : null, [openId]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const open = (id) => { const p = new URLSearchParams(params); p.set('open', id); setParams(p); };
  const close = () => { const p = new URLSearchParams(params); p.delete('open'); setParams(p); };
  const send = async (e) => {
    e.preventDefault(); if (!reply.trim()) return; setBusy(true);
    try { await api.post(`/assistant/conversations/${openId}/reply`, { message: reply }); setReply(''); conv.reload(true); list.reload(true); toast.success('Reply sent to the chat'); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const setConvStatus = async (s) => {
    try { await api.post(`/assistant/conversations/${openId}/status`, { status: s }); conv.reload(true); list.reload(true); toast.success(s === 'resolved' ? 'Marked as resolved' : 'Reopened'); }
    catch (err) { toast.error(err.message); }
  };
  const counts = list.data?.counts || {};
  const c = conv.data?.conversation;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className={cx('lg:col-span-2', openId && 'hidden lg:block')}>
        <div className="px-3 pt-1"><Tabs value={status} onChange={setStatus} tabs={[{ value: 'all', label: 'All' }, { value: 'escalated', label: 'Needs reply', count: counts.escalated || 0 }, { value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }]} /></div>
        {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.conversations.length === 0 ? <EmptyState icon={Inbox} title="No conversations" description="Chats from your booking page and chat link appear here." /> : (
          <ul className="max-h-[600px] divide-y divide-navy-100 overflow-y-auto">
            {list.data.conversations.map((x) => (
              <li key={x.id}>
                <button onClick={() => open(x.id)} className={cx('w-full px-4 py-3 text-left transition hover:bg-navy-50/60', String(x.id) === openId && 'bg-emerald-50/60')}>
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{x.visitor_name || 'Anonymous visitor'}</p><span className="shrink-0 text-xs text-navy-400">{timeAgo(x.updated_at)}</span></div>
                  <p className="mt-0.5 truncate text-xs text-navy-500">{x.last_message}</p>
                  <div className="mt-1.5 flex gap-1.5">{x.status === 'escalated' && <Badge color="amber">Needs reply</Badge>}{x.status === 'resolved' && <Badge color="emerald">Resolved</Badge>}{x.contact_consent ? <Badge color="sky">Contact shared</Badge> : null}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className={cx('flex min-h-[500px] flex-col lg:col-span-3', !openId && 'hidden lg:flex')}>
        {!openId ? <EmptyState icon={Inbox} title="Select a conversation" className="flex-1" /> : conv.loading && !conv.data ? <PageLoader /> : conv.error ? <ErrorState error={conv.error} /> : (<>
          <div className="flex flex-wrap items-center gap-3 border-b border-navy-100 px-5 py-3">
            <button onClick={close} className="rounded-lg p-1 hover:bg-navy-50 lg:hidden" aria-label="Back"><ArrowLeft className="size-5" /></button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.visitor_name || 'Anonymous visitor'}</p>
              <p className="truncate text-xs text-navy-400">{c.contact_consent ? [c.visitor_email, c.visitor_phone].filter(Boolean).join(' · ') + ' (shared with consent)' : 'No contact details shared'}</p>
            </div>
            {c.status === 'resolved' ? <Button size="sm" variant="secondary" onClick={() => setConvStatus('open')}>Reopen</Button> : <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => setConvStatus('resolved')}>Mark resolved</Button>}
          </div>
          {c.status === 'escalated' && <div className="flex items-center gap-2 bg-amber-50 px-5 py-2 text-xs text-amber-800"><AlertTriangle className="size-4" />Escalated: {c.escalation_reason}</div>}
          <div className="flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">{conv.data.messages.map((m) => <Bubble key={m.id} m={m} />)}</div>
          <form onSubmit={send} className="flex gap-2 border-t border-navy-100 p-3">
            <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply in the chat as a team member…" aria-label="Reply" />
            <Button type="submit" icon={Send} loading={busy} disabled={!reply.trim()}>Reply</Button>
          </form>
          <p className="px-4 pb-2 text-[11px] text-navy-400">The visitor sees your reply if they still have the chat open or come back to it.{c.visitor_email ? ` You can also email them at ${c.visitor_email}.` : ''}</p>
        </>)}
      </Card>
    </div>
  );
}

export default function Assistant() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'settings';
  const res = useApi(can('ai_assistant') ? '/assistant/settings' : null);
  if (!can('ai_assistant')) return <><PageHeader title="AI Assistant" /><UpgradeNotice feature="The AI customer support assistant" /></>;
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const d = res.data;
  return (
    <div>
      <PageHeader title="AI Assistant" description="Automatic, accurate answers for your customers – with a human in the loop."
        actions={<Badge color={d.settings.enabled ? 'emerald' : 'navy'}>{d.settings.enabled ? 'Live on your booking page' : 'Disabled'}</Badge>} />
      <div className={cx('mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm', d.engine === 'claude' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>
        <Bot className="mt-0.5 size-5 shrink-0" />
        {d.engine === 'claude'
          ? <p><strong>Claude is connected</strong> ({d.model}). Answers are generated from your verified information only; if Claude is unavailable, the built-in engine takes over automatically.</p>
          : <p><strong>Built-in answer engine active.</strong> It answers prices, services, opening hours, FAQs and availability directly from your data and escalates everything else. To enable natural-language AI replies (and multiple languages), the server administrator can set <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code>.</p>}
      </div>
      <Tabs className="mb-6" value={tab} onChange={(v) => setParams({ tab: v })} tabs={[
        { value: 'settings', label: 'Settings', icon: Settings2 }, { value: 'faqs', label: 'FAQs', icon: HelpCircle, count: d.faqs.length },
        { value: 'test', label: 'Test', icon: FlaskConical }, { value: 'inbox', label: 'Inbox', icon: Inbox },
      ]} />
      {tab === 'settings' && <SettingsTab data={d} onSaved={() => res.reload(true)} />}
      {tab === 'faqs' && <FaqTab faqs={d.faqs} onChange={() => res.reload(true)} />}
      {tab === 'test' && <TestTab settings={d.settings} engine={d.engine} />}
      {tab === 'inbox' && <InboxTab />}
    </div>
  );
}
