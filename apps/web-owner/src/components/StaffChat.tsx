import { useState, useEffect, useCallback, useRef } from 'react';
import { chat, type ChatRoom, type ChatMessage, type ChatStaffUser } from '../api';

const COLORS = {
  bg: '#f5f5f7', card: '#ffffff', text: '#1d1d1f', secondary: '#86868b',
  accent: '#0071e3', success: '#34c759', danger: '#ff3b30', warning: '#ff9500', border: '#d2d2d7',
};

const ROOM_TYPE_LABEL: Record<string, string> = {
  COLLECTIVE: 'Collettiva',
  DEPARTMENT: 'Reparto',
  PERSONAL: 'Personale',
  DIRECT_TO_OWNER: 'Dipendente → Owner',
};

const ROOM_TYPE_ICON: Record<string, string> = {
  COLLECTIVE: '📢',
  DEPARTMENT: '👥',
  PERSONAL: '👤',
  DIRECT_TO_OWNER: '📩',
};

const DEPT_LABEL: Record<string, string> = {
  KITCHEN: 'Cucina',
  BAR: 'Bar',
  WAITER: 'Camerieri',
  BAR_WAITER: 'Bar & Camerieri',
};

const VISIBILITY_LABEL: Record<string, string> = {
  ALL: 'Tutti vedono',
  OWNER_ONLY: 'Solo owner',
  DEPARTMENT: 'Solo reparto',
  MEMBERS: 'Solo membri',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function StaffChat() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [staffList, setStaffList] = useState<ChatStaffUser[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Form creazione room
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'COLLECTIVE' | 'DEPARTMENT' | 'PERSONAL'>('COLLECTIVE');
  const [newDept, setNewDept] = useState<string>('KITCHEN');
  const [newTarget, setNewTarget] = useState<string>('');
  const [newVisibility, setNewVisibility] = useState<string>('ALL');
  const [creating, setCreating] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const r = await chat.rooms();
      setRooms(r);
      if (r.length > 0 && !activeRoom) setActiveRoom(r[0].id);
    } catch {} finally { setLoading(false); }
  }, [activeRoom]);

  const loadMessages = useCallback(async () => {
    if (!activeRoom) return;
    try {
      const msgs = await chat.messages(activeRoom);
      setMessages(msgs);
      for (const m of msgs) {
        if (!m.readBy.includes('owner1')) {
          chat.markRead(activeRoom, m.id).catch(() => {});
        }
      }
    } catch {}
  }, [activeRoom]);

  useEffect(() => { loadRooms(); }, [loadRooms]);
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function openCreateModal() {
    try {
      const sl = await chat.staffList();
      setStaffList(sl);
    } catch {}
    setShowCreate(true);
  }

  async function createRoom() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const data: any = { name: newName.trim(), type: newType };
      if (newType === 'DEPARTMENT') data.department = newDept;
      if (newType === 'PERSONAL') data.targetUserId = newTarget;
      if (newType === 'COLLECTIVE') data.visibility = newVisibility;
      if (newType === 'DEPARTMENT') data.visibility = 'DEPARTMENT';
      if (newType === 'PERSONAL') data.visibility = 'MEMBERS';
      const room = await chat.createRoom(data);
      setRooms(prev => [...prev, room]);
      setActiveRoom(room.id);
      setShowCreate(false);
      setNewName('');
      setNewType('COLLECTIVE');
      setNewDept('KITCHEN');
      setNewTarget('');
      setNewVisibility('ALL');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  }

  const send = async () => {
    if (!text.trim() || !activeRoom) return;
    const msgText = text.trim();
    setText('');
    try {
      const msg = await chat.send(activeRoom, msgText);
      setMessages(prev => [...prev, msg]);
      setAiSuggestions([]);
    } catch (e: any) { alert(e.message); }
  };

  const sendSuggestion = async (suggestion: string) => {
    if (!activeRoom) return;
    setText('');
    setAiSuggestions([]);
    try {
      const msg = await chat.send(activeRoom, suggestion);
      setMessages(prev => [...prev, msg]);
    } catch (e: any) { alert(e.message); }
  };

  const getAiSuggestions = async () => {
    if (!activeRoom) return;
    setAiLoading(true);
    try {
      const r = await chat.aiSuggest(activeRoom);
      setAiSuggestions(r.suggestions);
      setAiEnabled(r.aiEnabled);
    } catch {} finally { setAiLoading(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.secondary }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      {/* Sidebar rooms */}
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Chat</span>
          <button onClick={openCreateModal} style={{
            borderRadius: '50%', width: 30, height: 30, border: 'none', cursor: 'pointer', fontSize: 18,
            background: COLORS.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        </div>
        {rooms.map(r => (
          <button key={r.id} onClick={() => setActiveRoom(r.id)} style={{
            textAlign: 'left', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', border: 'none',
            background: activeRoom === r.id ? COLORS.accent : '#fff', color: activeRoom === r.id ? '#fff' : COLORS.text,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>{ROOM_TYPE_ICON[r.type] ?? '💬'}</span>
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
              {ROOM_TYPE_LABEL[r.type] ?? r.type}
              {r.department && ` · ${DEPT_LABEL[r.department] ?? r.department}`}
              {r.type === 'DIRECT_TO_OWNER' && ` · da ${r.createdBy}`}
            </div>
            {r.messages && r.messages[0] && (
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.messages[0].text}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {/* Header chat */}
        {activeRoom && (() => {
          const room = rooms.find(r => r.id === activeRoom);
          if (!room) return null;
          return (
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{ROOM_TYPE_ICON[room.type] ?? '💬'}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{room.name}</div>
                <div style={{ fontSize: 11, color: COLORS.secondary }}>
                  {ROOM_TYPE_LABEL[room.type]} · Visibilità: {VISIBILITY_LABEL[room.visibility] ?? room.visibility}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: COLORS.secondary, fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
              Nessun messaggio. Inizia la conversazione!
            </div>
          ) : (
            messages.map(m => {
              const isOwner = m.user?.id === 'owner1';
              return (
                <div key={m.id} style={{ display: 'flex', gap: 10, flexDirection: 'row', justifyContent: isOwner ? 'flex-end' : 'flex-start' }}>
                  {!isOwner && (
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: m.aiGenerated ? '#e8f0ff' : COLORS.accent + '20',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>{m.aiGenerated ? '✨' : (m.user?.name?.[0] ?? '?')}</div>
                  )}
                  <div style={{ flex: 1, maxWidth: '70%' }}>
                    {!isOwner && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{m.user?.name ?? 'Sistema'}</span>
                        {m.aiGenerated && <span style={{ fontSize: 10, borderRadius: 980, padding: '1px 6px', background: '#e8f0ff', color: COLORS.accent }}>AI</span>}
                        <span style={{ fontSize: 11, color: COLORS.secondary }}>{fmtTime(m.createdAt)}</span>
                      </div>
                    )}
                    <div style={{
                      fontSize: 14, color: isOwner ? '#fff' : COLORS.text, lineHeight: 1.5,
                      background: isOwner ? COLORS.accent : m.aiGenerated ? '#f0f7ff' : '#f5f5f7',
                      borderRadius: isOwner ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '10px 14px', display: 'inline-block',
                    }}>{m.text}</div>
                    {isOwner && (
                      <div style={{ fontSize: 11, color: COLORS.secondary, textAlign: 'right', marginTop: 2 }}>{fmtTime(m.createdAt)}</div>
                    )}
                  </div>
                  {isOwner && (
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: COLORS.accent, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700,
                    }}>N</div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* AI Suggestions */}
        {aiSuggestions.length > 0 && (
          <div style={{ padding: '8px 20px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', background: '#f0f7ff' }}>
            <span style={{ fontSize: 12, color: COLORS.accent, fontWeight: 500, padding: '4px 0' }}>✨ Suggerimenti AI:</span>
            {aiSuggestions.map((s, i) => (
              <button key={i} onClick={() => sendSuggestion(s)} style={{
                borderRadius: 980, padding: '6px 14px', fontSize: 13, cursor: 'pointer', border: `1px solid ${COLORS.accent}40`,
                background: '#fff', color: COLORS.text,
              }}>{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={getAiSuggestions} disabled={aiLoading} title="Suggerimenti AI" style={{
            borderRadius: '50%', width: 36, height: 36, border: 'none', cursor: aiLoading ? 'wait' : 'pointer', fontSize: 16,
            background: aiLoading ? '#e8e8ed' : '#e8f0ff', color: COLORS.accent, flexShrink: 0,
          }}>✨</button>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Scrivi un messaggio…"
            style={{ flex: 1, borderRadius: 20, border: `1px solid ${COLORS.border}`, padding: '10px 16px', fontSize: 14, outline: 'none' }}
            onFocus={e => e.currentTarget.style.borderColor = COLORS.accent}
            onBlur={e => e.currentTarget.style.borderColor = COLORS.border}
          />
          <button onClick={send} disabled={!text.trim()} style={{
            borderRadius: 20, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: text.trim() ? COLORS.accent : '#e8e8ed', color: text.trim() ? '#fff' : COLORS.secondary, flexShrink: 0,
          }}>Invia</button>
        </div>
      </div>

      {/* Modal creazione room */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{
          position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, padding: 28, maxWidth: 460, width: '100%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 20 }}>Nuova chat</h3>

            {/* Tipo chat */}
            <label style={labelStyle}>Tipo di chat</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {([
                { v: 'COLLECTIVE', l: '📢 Collettiva', d: 'Tutto lo staff' },
                { v: 'DEPARTMENT', l: '👥 Reparto', d: 'Cucina / Bar / Camerieri' },
                { v: 'PERSONAL', l: '👤 Personale', d: '1:1 con dipendente' },
              ] as const).map(opt => (
                <button key={opt.v} onClick={() => setNewType(opt.v)} style={{
                  ...typeBtn, ...(newType === opt.v ? typeBtnActive : {}),
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.l}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{opt.d}</div>
                </button>
              ))}
            </div>

            {/* Nome */}
            <label style={labelStyle}>Nome chat</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={newType === 'COLLECTIVE' ? 'es. Annunci generali' : newType === 'DEPARTMENT' ? 'es. Chat Cucina' : 'es. Chat con Chiara'}
              style={inputStyle}
            />

            {/* Department selector */}
            {newType === 'DEPARTMENT' && (
              <>
                <label style={labelStyle}>Reparto</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {Object.entries(DEPT_LABEL).map(([v, l]) => (
                    <button key={v} onClick={() => setNewDept(v)} style={{
                      ...chipBtn, ...(newDept === v ? chipBtnActive : {}),
                    }}>{l}</button>
                  ))}
                </div>
              </>
            )}

            {/* Personal target */}
            {newType === 'PERSONAL' && (
              <>
                <label style={labelStyle}>Dipendente</label>
                <select value={newTarget} onChange={e => setNewTarget(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
                  <option value="">Seleziona dipendente…</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.roles.join(', ')})</option>
                  ))}
                </select>
              </>
            )}

            {/* Visibility per COLLECTIVE */}
            {newType === 'COLLECTIVE' && (
              <>
                <label style={labelStyle}>Visibilità risposte dipendenti</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {Object.entries(VISIBILITY_LABEL).filter(([v]) => v === 'ALL' || v === 'OWNER_ONLY').map(([v, l]) => (
                    <button key={v} onClick={() => setNewVisibility(v)} style={{
                      ...chipBtn, ...(newVisibility === v ? chipBtnActive : {}),
                    }}>{l}</button>
                  ))}
                </div>
              </>
            )}

            {/* Pulsanti */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={createRoom}
                disabled={!newName.trim() || (newType === 'PERSONAL' && !newTarget) || creating}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: (!newName.trim() || (newType === 'PERSONAL' && !newTarget) || creating) ? '#e8e8ed' : COLORS.accent,
                  color: (!newName.trim() || (newType === 'PERSONAL' && !newTarget) || creating) ? COLORS.secondary : '#fff',
                  fontSize: 15, fontWeight: 600,
                }}
              >
                {creating ? 'Creazione…' : 'Crea chat'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '14px 20px', borderRadius: 14, border: `1px solid ${COLORS.border}`,
                background: '#fff', color: COLORS.text, fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#1d1d1f', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`,
  fontSize: 14, outline: 'none', marginBottom: 16, boxSizing: 'border-box',
};
const typeBtn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 12, border: `1px solid ${COLORS.border}`, background: '#fff',
  cursor: 'pointer', textAlign: 'left', flex: '1 1 130px',
};
const typeBtnActive: React.CSSProperties = {
  border: `2px solid ${COLORS.accent}`, background: '#f0f7ff',
};
const chipBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 980, border: `1px solid ${COLORS.border}`, background: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 500,
};
const chipBtnActive: React.CSSProperties = {
  background: COLORS.accent, color: '#fff', borderColor: COLORS.accent,
};
