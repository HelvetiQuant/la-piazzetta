/**
 * OwnerNotes — Gestione disposizioni/note dell'owner verso dipendenti e reparti.
 *
 * - Crea nota con target: ALL, DEPARTMENT (KITCHEN/BAR/WAITERS), INDIVIDUAL (userId)
 * - Tipo: NOTE, TASK, WARNING, RULE, SUGGESTION
 * - Priorità 1-5 (1=urgente, lampeggiante nel banner dipendenti)
 * - Ack obbligatorio: il dipendente vede il banner lampeggiante e deve confermare
 * - Visualizza chi ha confermato e le risposte ricevute
 * - Archivia o elimina note
 */
import { useEffect, useState } from 'react';
import { notesApi, type StaffNote } from '../api';
import { colors } from '@la-piazzetta/ui';

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  WARNING: { icon: '⚠️', label: 'AVVISO', color: '#E68C26' },
  TASK: { icon: '✅', label: 'DA FARE', color: '#0066CC' },
  RULE: { icon: '📋', label: 'REGOLA', color: '#6B4FBB' },
  SUGGESTION: { icon: '💡', label: 'SUGGERIMENTO', color: '#D9A633' },
  NOTE: { icon: '📝', label: 'NOTA', color: '#669933' },
};

const SCOPE_LABELS: Record<string, (v: string) => string> = {
  ALL: () => 'Tutti',
  DEPARTMENT: (v) => v === 'KITCHEN' ? 'Cucina' : v === 'BAR' ? 'Bar' : v === 'WAITERS' ? 'Sala' : v,
  INDIVIDUAL: (v) => `Dipendente ${v.slice(-6)}`,
};

export default function OwnerNotes() {
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');

  async function load() {
    try {
      const list = await notesApi.list(filter);
      setNotes(list);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function archive(id: string) {
    try {
      await notesApi.update(id, { status: 'ARCHIVED' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Eliminare definitivamente questa disposizione?')) return;
    try {
      await notesApi.remove(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Disposizioni</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setFilter('ACTIVE')}
            style={filter === 'ACTIVE' ? btnActive : btnInactive}
          >Attive</button>
          <button
            onClick={() => setFilter('ARCHIVED')}
            style={filter === 'ARCHIVED' ? btnActive : btnInactive}
          >Archiviate</button>
          <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>
            {showForm ? 'Annulla' : '+ Nuova disposizione'}
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
        Le disposizioni con ack obbligatorio appaiono come notifica lampeggiante nei dispositivi dei dipendenti.
        Devono confermare ricezione ("✓ Ricevuto e capito") o rispondere.
      </p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}

      {showForm && <NewNoteForm onCreated={() => { setShowForm(false); load(); }} />}

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {notes.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 12 }}>
            {filter === 'ACTIVE' ? 'Nessuna disposizione attiva.' : 'Nessuna disposizione archiviata.'}
          </div>
        )}
        {notes.map((n) => {
          const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.NOTE;
          const scopeLabel = SCOPE_LABELS[n.targetScope]?.(n.targetValue) ?? n.targetValue;
          const ackCount = n.acknowledgedBy.length;
          const isUrgent = n.priority <= 2;
          return (
            <div key={n.id} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${isUrgent ? config.color : '#e0e0e0'}`,
              borderLeft: `4px solid ${config.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fafafa' }}>
                <span style={{ fontSize: 20 }}>{config.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, color: config.color }}>{config.label}</span>
                {isUrgent && (
                  <span style={{ background: '#B31A19', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                    URGENTE
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
                  → {scopeLabel}
                </span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{n.title}</div>
                <div style={{ fontSize: 14, color: '#444', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                {n.dueDate && (
                  <div style={{ fontSize: 12, marginTop: 8, color: '#888' }}>
                    ⏰ Scadenza: {new Date(n.dueDate).toLocaleString('it-IT')}
                  </div>
                )}

                {/* Ack badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12 }}>
                  <span style={{
                    background: ackCount > 0 ? '#e8f5e9' : '#fff3e0',
                    color: ackCount > 0 ? colors.success : '#E68C26',
                    borderRadius: 6, padding: '3px 8px', fontWeight: 600,
                  }}>
                    ✓ {ackCount} conferme
                  </span>
                  {n.responses.length > 0 && (
                    <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
                      💬 {n.responses.length} risposte
                    </span>
                  )}
                  <span style={{ color: '#999' }}>
                    {new Date(n.createdAt).toLocaleString('it-IT')}
                  </span>
                </div>

                {/* Risposte */}
                {n.responses.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                    {n.responses.map((r, i) => (
                      <div key={i} style={{ fontSize: 13, marginBottom: 4, color: '#555' }}>
                        <strong>{r.userId.slice(-6)}</strong>: {r.text}
                        <span style={{ color: '#aaa', marginLeft: 6, fontSize: 11 }}>
                          {new Date(r.at).toLocaleString('it-IT')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Azioni */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {n.status === 'ACTIVE' && (
                    <button onClick={() => archive(n.id)} style={btnSmall}>Archivia</button>
                  )}
                  <button onClick={() => remove(n.id)} style={{ ...btnSmall, color: colors.danger }}>Elimina</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewNoteForm({ onCreated }: { onCreated: () => void }) {
  const [targetScope, setTargetScope] = useState<'ALL' | 'DEPARTMENT' | 'INDIVIDUAL'>('ALL');
  const [targetValue, setTargetValue] = useState('ALL');
  const [type, setType] = useState('NOTE');
  const [priority, setPriority] = useState(3);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [requiresAck, setRequiresAck] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !body.trim()) { setErr('Titolo e contenuto obbligatori'); return; }
    setSaving(true);
    setErr('');
    try {
      await notesApi.create({
        targetScope,
        targetValue: targetScope === 'ALL' ? 'ALL' : targetValue,
        type,
        priority,
        title: title.trim(),
        body: body.trim(),
        dueDate: dueDate || undefined,
        requiresAck,
      });
      setTitle(''); setBody(''); setDueDate(''); setErr('');
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e0e0e0', marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Nuova disposizione</h3>
      {err && <div style={{ color: colors.danger, marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {/* Destinatario */}
        <div>
          <label style={labelStyle}>Destinatario</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['ALL', 'DEPARTMENT', 'INDIVIDUAL'] as const).map((s) => (
              <button key={s} onClick={() => {
                setTargetScope(s);
                setTargetValue(s === 'ALL' ? 'ALL' : s === 'DEPARTMENT' ? 'KITCHEN' : '');
              }} style={targetScope === s ? btnActive : btnInactive}>
                {s === 'ALL' ? 'Tutti' : s === 'DEPARTMENT' ? 'Reparto' : 'Singolo'}
              </button>
            ))}
          </div>
          {targetScope === 'DEPARTMENT' && (
            <select value={targetValue} onChange={(e) => setTargetValue(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
              <option value="KITCHEN">Cucina</option>
              <option value="BAR">Bar</option>
              <option value="WAITERS">Sala</option>
            </select>
          )}
          {targetScope === 'INDIVIDUAL' && (
            <input
              placeholder="ID dipendente (es. usr_abc123)"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          )}
        </div>

        {/* Tipo e priorità */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              <option value="NOTE">📝 Nota</option>
              <option value="TASK">✅ Da fare</option>
              <option value="WARNING">⚠️ Avviso</option>
              <option value="RULE">📋 Regola</option>
              <option value="SUGGESTION">💡 Suggerimento</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priorità (1=urgente, 5=informativa)</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} style={inputStyle}>
              <option value={1}>1 - Urgente (lampeggiante)</option>
              <option value={2}>2 - Alta</option>
              <option value={3}>3 - Normale</option>
              <option value={4}>4 - Bassa</option>
              <option value={5}>5 - Informativa</option>
            </select>
          </div>
        </div>

        {/* Titolo */}
        <div>
          <label style={labelStyle}>Titolo *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Nuova procedura chiusura cassa" style={inputStyle} />
        </div>

        {/* Corpo */}
        <div>
          <label style={labelStyle}>Contenuto *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Descrivi la disposizione..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {/* Scadenza e ack */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Scadenza (opzionale)</label>
            <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, paddingBottom: 10 }}>
            <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
            Conferma ricezione obbligatoria
          </label>
        </div>

        <button onClick={submit} disabled={saving} style={btnPrimary}>
          {saving ? 'Invio…' : 'Invia disposizione'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#555' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd',
  fontSize: 14, boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  background: colors.accent, color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
};
const btnActive: React.CSSProperties = {
  background: colors.accent, color: '#fff', border: 'none', borderRadius: 8,
  padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
};
const btnInactive: React.CSSProperties = {
  background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: 8,
  padding: '6px 12px', cursor: 'pointer', fontSize: 13,
};
const btnSmall: React.CSSProperties = {
  background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: 6,
  padding: '4px 10px', cursor: 'pointer', fontSize: 12,
};
