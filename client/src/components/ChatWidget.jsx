import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, MessageCircle, UserRound, CalendarPlus, Contact, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Checkbox, Input, cx } from './ui.jsx';

const storageKey = (slug) => `cf_chat_${slug}`;
const safeStorage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

export function Bubble({ m, assistantName }) {
  const mine = m.role === 'visitor';
  return (
    <div className={cx('flex gap-2', mine && 'justify-end')}>
      {!mine && (
        <span className={cx('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', m.role === 'staff' ? 'bg-navy-900 text-white' : 'bg-emerald-100 text-emerald-700')}>
          {m.role === 'staff' ? <UserRound className="size-3.5" /> : <Bot className="size-3.5" />}
        </span>
      )}
      <div className={cx('max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line',
        mine ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-navy-50 text-navy-800')}>
        {m.role === 'staff' && <span className="mb-0.5 block text-[11px] font-semibold text-navy-400">Medewerker</span>}
        {m.role === 'assistant' && assistantName && <span className="sr-only">{assistantName}: </span>}
        {m.content}
      </div>
    </div>
  );
}

export function ChatPanel({ slug, assistantName, welcome, onBook, onClose, className }) {
  const [token, setToken] = useState(() => safeStorage.get(storageKey(slug)));
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', consent: false });
  const [contactErr, setContactErr] = useState('');
  const [contactShared, setContactShared] = useState(false);
  const endRef = useRef(null);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  // Resume an existing conversation and poll for team replies.
  useEffect(() => {
    if (!token) return undefined;
    let stop = false;
    const poll = async (after) => {
      try {
        const d = await api.get(`/public/chat/${token}?after=${after}`);
        if (stop) return;
        setContactShared(d.contactShared);
        if (d.messages.length) setMessages((ms) => [...ms, ...d.messages.filter((m) => !ms.some((x) => x.id === m.id))]);
      } catch (err) {
        if (err.status === 404) { safeStorage.del(storageKey(slug)); setToken(null); setMessages([]); }
      }
    };
    poll(0);
    return () => { stop = true; };
  }, [token, slug]);

  useEffect(() => {
    if (!token) return undefined;
    const t = setInterval(async () => {
      try {
        const d = await api.get(`/public/chat/${token}?after=${lastId}`);
        if (d.messages.length) setMessages((ms) => [...ms, ...d.messages.filter((m) => !ms.some((x) => x.id === m.id))]);
      } catch { /* ignore transient errors */ }
    }, 8000);
    return () => clearInterval(t);
  }, [token, lastId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending, showContact]);

  const send = async (e) => {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true); setError(''); setText('');
    const optimistic = { id: `tmp-${Date.now()}`, role: 'visitor', content: msg };
    setMessages((ms) => [...ms, optimistic]);
    try {
      const d = await api.post(`/public/company/${slug}/chat`, { message: msg, token: token || undefined });
      if (d.token !== token) { safeStorage.set(storageKey(slug), d.token); setToken(d.token); }
      setMessages((ms) => [...ms.filter((m) => m.id !== optimistic.id), ...d.messages.filter((m) => !ms.some((x) => x.id === m.id))]);
    } catch (err) {
      setMessages((ms) => ms.filter((m) => m.id !== optimistic.id));
      setText(msg);
      setError(err.message);
    } finally { setSending(false); }
  };

  const shareContact = async (e) => {
    e.preventDefault(); setContactErr('');
    try {
      const d = await api.post(`/public/chat/${token}/contact`, { ...contact, after: lastId });
      setMessages((ms) => [...ms, ...d.messages.filter((m) => !ms.some((x) => x.id === m.id))]);
      setShowContact(false); setContactShared(true);
    } catch (err) { setContactErr(err.message); }
  };

  const newChat = () => { safeStorage.del(storageKey(slug)); setToken(null); setMessages([]); setContactShared(false); };

  return (
    <div className={cx('flex flex-col overflow-hidden bg-white', className)}>
      <div className="flex items-center gap-3 bg-navy-900 px-4 py-3.5 text-white">
        <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500"><Bot className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{assistantName}</p>
          <p className="text-xs text-navy-300">Virtuele assistent · antwoordt op basis van bedrijfsinformatie</p>
        </div>
        {token && <button onClick={newChat} className="rounded-lg px-2 py-1 text-xs text-navy-300 hover:bg-white/10 hover:text-white">Nieuw gesprek</button>}
        {onClose && <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Chat sluiten"><X className="size-5" /></button>}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin" aria-live="polite">
        <Bubble m={{ role: 'assistant', content: welcome }} assistantName={assistantName} />
        {messages.map((m) => <Bubble key={m.id} m={m} assistantName={assistantName} />)}
        {sending && <div className="flex gap-2 pl-9"><span className="flex gap-1 rounded-2xl bg-navy-50 px-4 py-3">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-navy-300" style={{ animationDelay: `${i * 0.15}s` }} />)}</span></div>}
        {showContact && (
          <form onSubmit={shareContact} className="animate-slide-up space-y-3 rounded-2xl border border-navy-100 p-4">
            <p className="text-sm font-semibold">Deel je contactgegevens</p>
            <Input placeholder="Je naam" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-label="Je naam" />
            <Input placeholder="E-mailadres" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-label="E-mailadres" />
            <Input placeholder="Telefoonnummer (optioneel)" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-label="Telefoonnummer" />
            <Checkbox checked={contact.consent} onChange={(v) => setContact({ ...contact, consent: v })} label="Ik ga ermee akkoord dat het bedrijf deze gegevens bewaart en contact met me opneemt over mijn vraag." />
            {contactErr && <p className="text-xs font-medium text-red-600">{contactErr}</p>}
            <div className="flex gap-2"><Button type="submit" size="sm">Gegevens delen</Button><Button size="sm" variant="ghost" onClick={() => setShowContact(false)}>Annuleren</Button></div>
          </form>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 overflow-x-auto border-t border-navy-100 px-3 pt-2.5 scrollbar-thin">
        {onBook && <button onClick={onBook} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><CalendarPlus className="size-3.5" />Nu boeken</button>}
        {token && !contactShared && !showContact && <button onClick={() => setShowContact(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"><Contact className="size-3.5" />Contactgegevens delen</button>}
        {['Wat zijn jullie prijzen?', 'Wat zijn de openingstijden?', 'Welke diensten bieden jullie aan?'].map((q) => (
          <button key={q} onClick={() => setText(q)} className="shrink-0 rounded-full border border-navy-200 px-3 py-1 text-xs text-navy-600 hover:bg-navy-50">{q}</button>
        ))}
      </div>
      {error && <p className="px-4 pt-2 text-xs font-medium text-red-600">{error}</p>}
      <form onSubmit={send} className="flex items-center gap-2 p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Typ je vraag…" aria-label="Bericht" className="input flex-1 rounded-full" />
        <button type="submit" disabled={!text.trim() || sending} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-40" aria-label="Versturen">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
      <p className="pb-2 text-center text-[10px] text-navy-300">AI-antwoorden kunnen onvolledig zijn. Afspraken worden alleen door het team bevestigd.</p>
    </div>
  );
}

export default function ChatLauncher(props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 sm:inset-auto sm:right-5 sm:bottom-24 sm:h-[600px] sm:max-h-[calc(100vh-8rem)] sm:w-[380px]">
          <ChatPanel {...props} onClose={() => setOpen(false)} onBook={props.onBook ? () => { setOpen(false); props.onBook(); } : undefined}
            className="h-full animate-slide-up shadow-soft sm:rounded-2xl sm:border sm:border-navy-100" />
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className={cx('fixed right-5 bottom-5 z-50 size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-glow transition hover:scale-105 hover:bg-emerald-600', open ? 'hidden sm:flex' : 'flex')}
        aria-label={open ? 'Chat sluiten' : `Chat met ${props.assistantName}`}>
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </>
  );
}
