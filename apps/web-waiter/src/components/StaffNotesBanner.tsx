import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/client';

/**
 * StaffNotesBanner: notifica lampeggiante per note/rule dello staff.
 * Il dipendente DEVE confermare ricezione (ack) o rispondere.
 * Non si può dismissare senza ack — è obbligatorio.
 */

export interface StaffNote {
  id: string;
  targetScope: string;
  targetValue: string;
  type: string; // NOTE | TASK | WARNING | RULE | SUGGESTION
  priority: number; // 1=urgente, 3=normale, 5=informativa
  title: string;
  body: string;
  dueDate: string | null;
  requiresAck: boolean;
  acknowledgedBy: string[];
  responses: Array<{ userId: string; text: string; at: string }>;
  status: string;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  WARNING: { icon: '⚠️', label: 'AVVISO', color: '#E68C26' },
  TASK: { icon: '✅', label: 'DA FARE', color: '#0066CC' },
  RULE: { icon: '📋', label: 'REGOLA', color: '#6B4FBB' },
  SUGGESTION: { icon: '💡', label: 'SUGGERIMENTO', color: '#D9A633' },
  NOTE: { icon: '📝', label: 'NOTA', color: '#669933' },
};

export function StaffNotesBanner() {
  const [pendingNotes, setPendingNotes] = useState<StaffNote[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showResponse, setShowResponse] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [sending, setSending] = useState(false);
  const [acking, setAcking] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const notes = await apiFetch<StaffNote[]>('/staff-notes/pending');
      setPendingNotes(notes);
      if (notes.length === 0) {
        setShowResponse(false);
        setResponseText('');
      }
    } catch {
      // Silenzioso
    }
  }, []);

  useEffect(() => {
    loadPending();
    // Poll ogni 10 secondi per nuove note
    const interval = setInterval(loadPending, 10000);
    return () => clearInterval(interval);
  }, [loadPending]);

  const ackNote = async (id: string) => {
    setAcking(true);
    try {
      await apiFetch(`/staff-notes/${id}/ack`, { method: 'POST' });
      // Ricarica pending
      await loadPending();
      setCurrentIdx(0);
    } catch {
    } finally {
      setAcking(false);
    }
  };

  const respondNote = async (id: string) => {
    if (!responseText.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/staff-notes/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ text: responseText.trim() }),
      });
      setShowResponse(false);
      setResponseText('');
      await loadPending();
      setCurrentIdx(0);
    } catch {
    } finally {
      setSending(false);
    }
  };

  if (pendingNotes.length === 0) return null;

  const note = pendingNotes[currentIdx % pendingNotes.length];
  if (!note) return null;

  const config = TYPE_CONFIG[note.type] || TYPE_CONFIG.NOTE;
  const isUrgent = note.priority <= 2;
  const dueDateStr = note.dueDate
    ? new Date(note.dueDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 9999,
        maxWidth: 420,
        minWidth: 320,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${config.color} 0%, ${isUrgent ? '#B31A19' : config.color}dd 100%)`,
          color: '#fff',
          borderRadius: 14,
          padding: 0,
          boxShadow: isUrgent
            ? '0 0 0 3px rgba(229, 36, 36, 0.4), 0 4px 20px rgba(0,0,0,0.3)'
            : '0 4px 16px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          animation: isUrgent ? 'pulseBorder 1.5s ease-in-out infinite' : 'slideInRight 0.3s ease',
        }}
      >
        {/* Header con icona e tipo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontSize: 22, animation: isUrgent ? 'bounce 1s ease infinite' : 'none' }}>
            {config.icon}
          </span>
          <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {config.label}
          </span>
          {isUrgent && (
            <span style={{
              marginLeft: 'auto',
              background: '#fff',
              color: '#B31A19',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 800,
              animation: 'blink 1s ease infinite',
            }}>
              URGENTE
            </span>
          )}
          {pendingNotes.length > 1 && (
            <span style={{
              marginLeft: isUrgent ? '8px' : 'auto',
              background: 'rgba(255,255,255,0.25)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {currentIdx + 1}/{pendingNotes.length}
            </span>
          )}
        </div>

        {/* Corpo nota */}
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            {note.title}
          </div>
          <div style={{ fontSize: 14, opacity: 0.95, lineHeight: 1.4 }}>
            {note.body}
          </div>
          {dueDateStr && (
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
              ⏰ Scadenza: {dueDateStr}
            </div>
          )}
        </div>

        {/* Risposta (se aperta) */}
        {showResponse ? (
          <div style={{ padding: '0 14px 12px' }}>
            <textarea
              value={responseText}
              onChange={e => setResponseText(e.target.value)}
              placeholder="Scrivi la tua risposta..."
              style={{
                width: '100%',
                minHeight: 60,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => respondNote(note.id)}
                disabled={sending || !responseText.trim()}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.95)',
                  color: config.color,
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: sending ? 'wait' : 'pointer',
                  opacity: sending || !responseText.trim() ? 0.6 : 1,
                }}
              >
                {sending ? 'Invio...' : 'Invia risposta'}
              </button>
              <button
                onClick={() => { setShowResponse(false); setResponseText(''); }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          /* Pulsanti azione — ack obbligatorio */
          <div style={{
            padding: '0 14px 12px',
            display: 'flex',
            gap: 6,
          }}>
            <button
              onClick={() => ackNote(note.id)}
              disabled={acking}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.95)',
                color: config.color,
                border: 'none',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 700,
                cursor: acking ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {acking ? '...' : '✓ Ricevuto e capito'}
            </button>
            <button
              onClick={() => setShowResponse(true)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              💬 Rispondi
            </button>
            {pendingNotes.length > 1 && (
              <button
                onClick={() => setCurrentIdx(i => (i + 1) % pendingNotes.length)}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                →
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 0 3px rgba(229, 36, 36, 0.4), 0 4px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(229, 36, 36, 0.7), 0 4px 24px rgba(0,0,0,0.4); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
