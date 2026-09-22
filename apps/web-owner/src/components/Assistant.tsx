import { useState, useEffect, useRef, useCallback } from 'react';
import { assistant, type AssistantMessage, type AssistantConversation, type AiInstruction } from '../api';
import { uiAlert, uiConfirm } from '@la-piazzetta/ui';

const COLORS = {
  bg: '#f5f5f7', card: '#ffffff', text: '#1d1d1f', secondary: '#86868b',
  accent: '#0071e3', success: '#34c759', danger: '#ff3b30', warning: '#ff9500', border: '#d2d2d7',
};

const SUGGESTIONS = [
  'Resoconto incassi degli ultimi 3 giorni',
  'Disponibilità delle ragazze del bar per venerdì sera',
  'Cosa c\'è sotto scorta in magazzino?',
  'Quando carico una foto, prepara un post per l\'evento di venerdì con tono divertente e tema festa latina',
  'Situazione tavoli e ordini adesso',
  'Crediti clienti ancora aperti',
];

const TRIGGER_LABEL: Record<string, string> = {
  media_upload: '📷 al caricamento foto',
  scheduled: '📅 programmato',
  manual: '▶️ manuale',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function Assistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [instructions, setInstructions] = useState<AiInstruction[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const loadSide = useCallback(async () => {
    const [convs, instr] = await Promise.all([
      assistant.conversations().catch(() => [] as AssistantConversation[]),
      assistant.instructions().catch(() => [] as AiInstruction[]),
    ]);
    setConversations(convs);
    setInstructions(instr.filter((i) => i.status === 'PENDING'));
  }, []);

  useEffect(() => {
    loadSide().finally(() => setLoading(false));
  }, [loadSide]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const openConversation = async (id: string) => {
    const conv = await assistant.conversation(id).catch(() => null);
    if (!conv) return;
    setConversationId(conv.id);
    setMessages(conv.messages.filter((m) => m.role !== 'tool'));
  };

  const newConversation = () => {
    setConversationId(null);
    setMessages([]);
  };

  const send = async (msg?: string) => {
    const message = (msg ?? text).trim();
    if (!message || sending) return;
    setText('');
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: message, createdAt: new Date().toISOString() }]);
    try {
      const r = await assistant.chat(message, conversationId ?? undefined);
      setConversationId(r.conversationId);
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: 'assistant', content: r.reply, createdAt: new Date().toISOString() },
      ]);
      if (r.actions.some((a) => a.tool === 'schedule_instruction')) loadSide();
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : 'Errore di connessione';
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: 'assistant', content: `⚠️ ${msg2}`, createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const cancelInstruction = async (id: string) => {
    if (!(await uiConfirm('Annullare questo comando in attesa?'))) return;
    await assistant.cancelInstruction(id).catch(() => uiAlert('Errore annullamento'));
    loadSide();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: COLORS.secondary }}>Caricamento assistente…</div>;
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      {/* Sidebar: conversazioni + comandi in attesa */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
        <button
          onClick={newConversation}
          style={{
            padding: '10px 14px', borderRadius: 10, border: 'none',
            background: COLORS.accent, color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Nuova conversazione
        </button>

        <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, flex: 1, overflowY: 'auto', border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondary, marginBottom: 8 }}>CONVERSAZIONI</div>
          {conversations.length === 0 && (
            <div style={{ fontSize: 13, color: COLORS.secondary }}>Nessuna ancora — inizia a chattare.</div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 4,
                background: c.id === conversationId ? '#e8f0fe' : 'transparent',
                fontSize: 13, color: COLORS.text,
              }}
            >
              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title ?? 'Conversazione'}
              </div>
              <div style={{ fontSize: 11, color: COLORS.secondary }}>{c._count.messages} messaggi</div>
            </button>
          ))}
        </div>

        {instructions.length > 0 && (
          <div style={{ background: '#fff8e6', borderRadius: 12, padding: 12, border: `1px solid ${COLORS.warning}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8a6100', marginBottom: 8 }}>
              ⏳ COMANDI IN ATTESA ({instructions.length})
            </div>
            {instructions.map((i) => (
              <div key={i.id} style={{ fontSize: 12, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: COLORS.text }}>{i.description}</div>
                  <div style={{ color: COLORS.secondary, fontSize: 11 }}>
                    {TRIGGER_LABEL[i.triggerType] ?? i.triggerType}
                  </div>
                </div>
                <button
                  onClick={() => cancelInstruction(i.id)}
                  style={{ border: 'none', background: 'none', color: COLORS.danger, cursor: 'pointer', fontSize: 14 }}
                  title="Annulla"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Area chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: COLORS.card, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          🤖 Assistente
          <span style={{ fontSize: 12, fontWeight: 400, color: COLORS.secondary }}>
            — analisi business, report, comandi su marketing e operazioni
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.length === 0 && (
            <div style={{ maxWidth: 520, margin: '24px auto' }}>
              <div style={{ textAlign: 'center', color: COLORS.secondary, marginBottom: 16, fontSize: 14 }}>
                Ciao! Posso analizzare il tuo business ed eseguire comandi.<br />Prova ad esempio:
              </div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', margin: '6px 0',
                    padding: '10px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`,
                    background: COLORS.bg, cursor: 'pointer', fontSize: 13, color: COLORS.text,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: m.role === 'user' ? COLORS.accent : COLORS.bg,
                  color: m.role === 'user' ? '#fff' : COLORS.text,
                  fontSize: 14,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.45,
                }}
              >
                {m.content}
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{fmtTime(m.createdAt)}</div>
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', marginBottom: 10 }}>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: COLORS.bg, color: COLORS.secondary, fontSize: 14 }}>
                ⏳ Sto analizzando…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div style={{ padding: 12, borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Chiedi un'analisi o dai un comando…"
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`,
              fontSize: 14, outline: 'none',
            }}
            disabled={sending}
          />
          <button
            onClick={() => send()}
            disabled={sending || !text.trim()}
            style={{
              padding: '12px 20px', borderRadius: 10, border: 'none',
              background: sending || !text.trim() ? COLORS.border : COLORS.accent,
              color: '#fff', fontWeight: 600, cursor: sending ? 'default' : 'pointer',
            }}
          >
            Invia
          </button>
        </div>
      </div>
    </div>
  );
}
