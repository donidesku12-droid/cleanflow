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

const INTENT_LABEL = { question: 'Vraag', pricing: 'Prijs', booking: 'Afspraak', hours: 'Openingstijden', contact: 'Contact', complaint: 'Klacht', other: 'Overig' };

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
      toast.success('Instellingen van de assistent opgeslagen'); onSaved();
    } catch (err) { f.applyServerError(err); toast.error(err.message); } finally { setSaving(false); }
  };
  const toggleLang = (l) => f.setValues((v) => ({ ...v, languages: v.languages.includes(l) ? v.languages.filter((x) => x !== l) : [...v.languages, l] }));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Profiel van de assistent" description="Hoe je assistent zich voorstelt en wat hij weet." />
        <div className="space-y-5 p-5">
          <Toggle checked={!!f.values.enabled} onChange={f.set('enabled')} label="Assistent aan" description="Toont de chatknop op je boekingspagina en zet de chatlink aan." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Naam van de assistent" value={f.values.assistant_name} onChange={f.set('assistant_name')} error={f.errors.assistant_name} />
          </div>
          <Textarea label="Welkomstbericht" value={f.values.welcome_message} onChange={f.set('welcome_message')} error={f.errors.welcome_message} rows={2} />
          <Textarea label="Over je bedrijf" value={f.values.company_info || ''} onChange={f.set('company_info')} error={f.errors.company_info} rows={4}
            hint="Geschiedenis, wat jullie anders maakt, personeel, gebruikte producten… De assistent gaat ervan uit dat dit klopt." />
          <Textarea label="Voorwaarden" value={f.values.policies || ''} onChange={f.set('policies')} error={f.errors.policies} rows={4} placeholder="Annuleren, betalen, garanties, sleutels…" />
          <Input label="Werkgebied" value={f.values.service_area || ''} onChange={f.set('service_area')} error={f.errors.service_area} placeholder="bijv. Amsterdam, Amstelveen en Haarlem" />
          <Textarea label="Bericht bij doorsturen" value={f.values.escalation_message} onChange={f.set('escalation_message')} error={f.errors.escalation_message} rows={2}
            hint="Wordt getoond als een vraag wordt doorgestuurd naar je team." />
          <div>
            <span className="label">Talen</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.languages).map(([code, name]) => (
                <button key={code} type="button" onClick={() => toggleLang(code)} className={cx('rounded-full border px-3 py-1.5 text-sm font-medium transition',
                  f.values.languages.includes(code) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>{name}</button>
              ))}
            </div>
            {f.errors.languages && <p className="mt-1.5 text-xs font-medium text-red-600">{f.errors.languages}</p>}
            {data.engine !== 'claude' && f.values.languages.some((l) => l !== 'en') && <p className="mt-2 text-xs text-amber-700">Antwoorden in meerdere talen werken alleen met de Claude-koppeling. De ingebouwde assistent antwoordt in het Nederlands.</p>}
          </div>
          <div className="flex justify-end"><Button onClick={save} loading={saving}>Instellingen opslaan</Button></div>
        </div>
      </Card>
      <div className="space-y-6">
        <Card className="p-5">
          <ShieldCheck className="size-6 text-emerald-500" />
          <h3 className="mt-3 font-semibold">Alleen kloppende antwoorden</h3>
          <p className="mt-1.5 text-sm text-navy-500">De assistent gebruikt alleen wat je hier invult, plus:</p>
          <ul className="mt-3 space-y-2 text-sm text-navy-600">
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Actieve diensten & prijzen (<Link to="/app/services" className="font-medium text-emerald-600 hover:underline">Diensten</Link>)</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Openingstijden & contactgegevens (<Link to="/app/settings?tab=company" className="font-medium text-emerald-600 hover:underline">Instellingen</Link>)</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Je veelgestelde vragen</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Actuele vrije tijden uit je planning</li>
          </ul>
          <p className="mt-3 text-sm text-navy-500">Hij verzint nooit prijzen, beschikbaarheid of voorwaarden, kan zelf geen afspraken bevestigen, en stuurt alles wat hij niet weet door naar je team.</p>
        </Card>
        <ShareCard />
      </div>
    </div>
  );
}

function ShareCard() {
  const { company } = useAuth();
  const toast = useToast();
  const links = [['Chatpagina', `${window.location.origin}/chat/${company.slug}`], ['Boekingspagina (met chat)', `${window.location.origin}/book/${company.slug}`]];
  return (
    <Card className="p-5">
      <Link2 className="size-6 text-sky-500" />
      <h3 className="mt-3 font-semibold">Deel je assistent</h3>
      <div className="mt-3 space-y-3">
        {links.map(([label, url]) => (
          <div key={label}>
            <p className="text-xs font-semibold text-navy-400">{label}</p>
            <div className="mt-1 flex gap-2">
              <input readOnly value={url} className="input py-2 text-xs" aria-label={label} onFocus={(e) => e.target.select()} />
              <Button size="sm" variant="secondary" icon={Copy} aria-label={`${label} kopiëren`} onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link gekopieerd'), () => toast.error('Kopiëren is mislukt'))} />
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
      toast.success('Vraag opgeslagen'); setEditing(null); onChange();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await api.del(`/assistant/faqs/${deleting.id}`); toast.success('Vraag verwijderd'); setDeleting(null); onChange(); } catch (err) { toast.error(err.message); }
  };
  return (
    <Card>
      <CardHeader title="Veelgestelde vragen" description="Vaste antwoorden die je assistent letterlijk mag gebruiken." action={<Button size="sm" icon={Plus} onClick={() => setEditing({ question: '', answer: '' })}>Vraag toevoegen</Button>} />
      {faqs.length === 0 ? <EmptyState icon={HelpCircle} title="Nog geen vragen" description="Voeg vragen toe die klanten vaak stellen, zoals over sleutels of wat ze moeten klaarzetten." action={<Button size="sm" icon={Plus} onClick={() => setEditing({ question: '', answer: '' })}>Vraag toevoegen</Button>} /> : (
        <ul className="divide-y divide-navy-100">
          {faqs.map((f) => (
            <li key={f.id} className="flex gap-4 px-5 py-4">
              <div className="min-w-0 flex-1"><p className="font-semibold">{f.question}</p><p className="mt-1 text-sm whitespace-pre-line text-navy-500">{f.answer}</p></div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(f)} aria-label="Vraag wijzigen" />
                <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(f)} aria-label="Vraag verwijderen" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Vraag wijzigen' : 'Vraag toevoegen'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuleren</Button><Button onClick={save} loading={saving}>Opslaan</Button></>}>
        {editing && <div className="space-y-4">
          <Input label="Vraag" value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
          <Textarea label="Antwoord" rows={5} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
        </div>}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} danger title="Deze vraag verwijderen?" confirmLabel="Verwijderen" message={deleting?.question} />
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
          <p className="font-semibold">{settings.assistant_name} testen</p>
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setMessages([]); setMeta([]); }}>Opnieuw</Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">
          <Bubble m={{ role: 'assistant', content: settings.welcome_message }} />
          {messages.map((m, i) => <Bubble key={i} m={m} />)}
          {busy && <Spinner className="ml-9 size-5" />}
          <div ref={end} />
        </div>
        {error && <p className="px-5 text-xs font-medium text-red-600">{error}</p>}
        <form onSubmit={send} className="flex gap-2 border-t border-navy-100 p-3">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Stel een vraag zoals een klant dat zou doen…" aria-label="Testbericht" />
          <Button type="submit" icon={Send} disabled={!text.trim()} loading={busy}>Versturen</Button>
        </form>
      </Card>
      <div className="space-y-6">
        <Card className="p-5">
          <p className="text-xs font-semibold tracking-wide text-navy-400 uppercase">Laatste antwoord</p>
          {!last ? <p className="mt-2 text-sm text-navy-400">Stuur een bericht om te zien hoe de assistent het inschat.</p> : (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-navy-500">Systeem</dt><dd className="font-medium">{last.engine === 'claude' ? 'Claude' : 'Ingebouwde regels'}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Soort vraag</dt><dd className="font-medium">{INTENT_LABEL[last.intent] || last.intent}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Doorsturen naar team</dt><dd>{last.escalate ? <Badge color="amber">Ja</Badge> : <Badge color="emerald">Nee</Badge>}</dd></div>
              {last.escalate && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{last.escalation_reason}</p>}
            </dl>
          )}
        </Card>
        <Card className="p-5 text-sm text-navy-500">
          <Info className="mb-2 size-5 text-sky-500" />
          Testgesprekken worden niet bewaard en je team krijgt er geen melding van. Probeer: “Wat kost een dieptereiniging?”, “Zijn jullie zondag open?”, “Ik wil mijn geld terug”.
          {engine !== 'claude' && <p className="mt-2">Je gebruikt de ingebouwde assistent. Die koppelt vragen aan je diensten, openingstijden en veelgestelde vragen.</p>}
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
    try { await api.post(`/assistant/conversations/${openId}/reply`, { message: reply }); setReply(''); conv.reload(true); list.reload(true); toast.success('Antwoord verstuurd in de chat'); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const setConvStatus = async (s) => {
    try { await api.post(`/assistant/conversations/${openId}/status`, { status: s }); conv.reload(true); list.reload(true); toast.success(s === 'resolved' ? 'Gemarkeerd als afgehandeld' : 'Weer geopend'); }
    catch (err) { toast.error(err.message); }
  };
  const counts = list.data?.counts || {};
  const c = conv.data?.conversation;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className={cx('lg:col-span-2', openId && 'hidden lg:block')}>
        <div className="px-3 pt-1"><Tabs value={status} onChange={setStatus} tabs={[{ value: 'all', label: 'Alle' }, { value: 'escalated', label: 'Wacht op antwoord', count: counts.escalated || 0 }, { value: 'open', label: 'Open' }, { value: 'resolved', label: 'Afgehandeld' }]} /></div>
        {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.conversations.length === 0 ? <EmptyState icon={Inbox} title="Geen gesprekken" description="Chats via je boekingspagina en chatlink verschijnen hier." /> : (
          <ul className="max-h-[600px] divide-y divide-navy-100 overflow-y-auto">
            {list.data.conversations.map((x) => (
              <li key={x.id}>
                <button onClick={() => open(x.id)} className={cx('w-full px-4 py-3 text-left transition hover:bg-navy-50/60', String(x.id) === openId && 'bg-emerald-50/60')}>
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{x.visitor_name || 'Anonieme bezoeker'}</p><span className="shrink-0 text-xs text-navy-400">{timeAgo(x.updated_at)}</span></div>
                  <p className="mt-0.5 truncate text-xs text-navy-500">{x.last_message}</p>
                  <div className="mt-1.5 flex gap-1.5">{x.status === 'escalated' && <Badge color="amber">Wacht op antwoord</Badge>}{x.status === 'resolved' && <Badge color="emerald">Afgehandeld</Badge>}{x.contact_consent ? <Badge color="sky">Contactgegevens gedeeld</Badge> : null}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className={cx('flex min-h-[500px] flex-col lg:col-span-3', !openId && 'hidden lg:flex')}>
        {!openId ? <EmptyState icon={Inbox} title="Kies een gesprek" className="flex-1" /> : conv.loading && !conv.data ? <PageLoader /> : conv.error ? <ErrorState error={conv.error} /> : (<>
          <div className="flex flex-wrap items-center gap-3 border-b border-navy-100 px-5 py-3">
            <button onClick={close} className="rounded-lg p-1 hover:bg-navy-50 lg:hidden" aria-label="Terug"><ArrowLeft className="size-5" /></button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.visitor_name || 'Anonieme bezoeker'}</p>
              <p className="truncate text-xs text-navy-400">{c.contact_consent ? [c.visitor_email, c.visitor_phone].filter(Boolean).join(' · ') + ' (gedeeld met toestemming)' : 'Geen contactgegevens gedeeld'}</p>
            </div>
            {c.status === 'resolved' ? <Button size="sm" variant="secondary" onClick={() => setConvStatus('open')}>Weer openen</Button> : <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => setConvStatus('resolved')}>Afgehandeld</Button>}
          </div>
          {c.status === 'escalated' && <div className="flex items-center gap-2 bg-amber-50 px-5 py-2 text-xs text-amber-800"><AlertTriangle className="size-4" />Doorgestuurd: {c.escalation_reason}</div>}
          <div className="flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">{conv.data.messages.map((m) => <Bubble key={m.id} m={m} />)}</div>
          <form onSubmit={send} className="flex gap-2 border-t border-navy-100 p-3">
            <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Antwoord in de chat als medewerker…" aria-label="Antwoord" />
            <Button type="submit" icon={Send} loading={busy} disabled={!reply.trim()}>Antwoorden</Button>
          </form>
          <p className="px-4 pb-2 text-[11px] text-navy-400">De bezoeker ziet je antwoord als de chat nog openstaat of als hij terugkomt.{c.visitor_email ? ` Je kunt ook mailen naar ${c.visitor_email}.` : ''}</p>
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
  if (!can('ai_assistant')) return <><PageHeader title="AI-assistent" /><UpgradeNotice feature="De AI-klantenservice-assistent" /></>;
  if (res.loading && !res.data) return <PageLoader />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const d = res.data;
  return (
    <div>
      <PageHeader title="AI-assistent" description="Automatische, kloppende antwoorden voor je klanten – en jij houdt de regie."
        actions={<Badge color={d.settings.enabled ? 'emerald' : 'navy'}>{d.settings.enabled ? 'Actief op je boekingspagina' : 'Uit'}</Badge>} />
      <div className={cx('mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm', d.engine === 'claude' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>
        <Bot className="mt-0.5 size-5 shrink-0" />
        {d.engine === 'claude'
          ? <p><strong>Claude is gekoppeld</strong> ({d.model}). Antwoorden worden alleen gemaakt op basis van jouw gegevens. Is Claude niet bereikbaar, dan neemt de ingebouwde assistent het automatisch over.</p>
          : <p><strong>De ingebouwde assistent is actief.</strong> Hij beantwoordt vragen over prijzen, diensten, openingstijden, veelgestelde vragen en beschikbaarheid direct uit je gegevens, en stuurt de rest door. Voor slimmere AI-antwoorden (en meerdere talen) kan de beheerder van de server <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code> instellen.</p>}
      </div>
      <Tabs className="mb-6" value={tab} onChange={(v) => setParams({ tab: v })} tabs={[
        { value: 'settings', label: 'Instellingen', icon: Settings2 }, { value: 'faqs', label: 'Veelgestelde vragen', icon: HelpCircle, count: d.faqs.length },
        { value: 'test', label: 'Testen', icon: FlaskConical }, { value: 'inbox', label: 'Inbox', icon: Inbox },
      ]} />
      {tab === 'settings' && <SettingsTab data={d} onSaved={() => res.reload(true)} />}
      {tab === 'faqs' && <FaqTab faqs={d.faqs} onChange={() => res.reload(true)} />}
      {tab === 'test' && <TestTab settings={d.settings} engine={d.engine} />}
      {tab === 'inbox' && <InboxTab />}
    </div>
  );
}
