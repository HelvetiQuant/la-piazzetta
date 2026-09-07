import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi, type ChatRoom, type ChatMessage } from '../api';
import { currentUser } from '../lib/client';

const ROOM_TYPE_ICON: Record<string, string> = {
  COLLECTIVE: '📢',
  DEPARTMENT: '👥',
  PERSONAL: '👤',
  DIRECT_TO_OWNER: '📩',
};

const ROOM_TYPE_LABEL: Record<string, string> = {
  COLLECTIVE: 'Collettiva',
  DEPARTMENT: 'Reparto',
  PERSONAL: 'Personale',
  DIRECT_TO_OWNER: 'Con Owner',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const user = currentUser();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadRooms = useCallback(async () => {
    try {
      const r = await chatApi.rooms();
      setRooms(r);
      if (r.length > 0 && !activeRoom) {
        // Preferisci la room collettiva o personale come default
        const first = r.find(x => x.type === 'COLLECTIVE') ?? r[0];
        setActiveRoom(first.id);
      }
    } catch {} finally { setLoading(false); }
  }, [activeRoom]);

  const loadMessages = useCallback(async () => {
    if (!activeRoom) return;
    try {
      const msgs = await chatApi.messages(activeRoom);
      setMessages(msgs);
      // Segna come letti
      for (const m of msgs) {
        if (user && !m.readBy.includes(user.userId)) {
          chatApi.markRead(activeRoom, m.id).catch(() => {});
        }
      }
    } catch {}
  }, [activeRoom, user]);

  useEffect(() => { loadRooms(); }, [loadRooms]);
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || !activeRoom) return;
    const msgText = text.trim();
    setText('');
    try {
      const msg = await chatApi.send(activeRoom, msgText);
      setMessages(prev => [...prev, msg]);
    } catch (e: any) { alert(e.message); }
  };

  async function createDirectToOwner() {
    try {
      const room = await chatApi.createRoom({ name: `${user?.userId ?? 'Io'} → Owner`, type: 'DIRECT_TO_OWNER' });
      setRooms(prev => [...prev, room]);
      setActiveRoom(room.id);
      setShowNewDirect(false);
    } catch (e: any) { alert(e.message); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 60px)', maxWidth: 900, margin: '0 auto' }}>
      {/* Sidebar rooms */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Chat</span>
          <button
            onClick={() => setShowNewDirect(true)}
            title="Nuova chat con owner"
            style={{
              borderRadius: '50%', width: 28, height: 28, border: 'none', cursor: 'pointer', fontSize: 16,
              background: '#0071e3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>
        {rooms.map(r => (
          <button key={r.id} onClick={() => setActiveRoom(r.id)} style={{
            textAlign: 'left', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', border: 'none',
            background: activeRoom === r.id ? '#0071e3' : '#fff', color: activeRoom === r.id ? '#fff' : '#1d1d1f',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>{ROOM_TYPE_ICON[r.type] ?? '💬'}</span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
              {ROOM_TYPE_LABEL[r.type] ?? r.type}
            </div>
          </button>
        ))}
        {rooms.length === 0 && (
          <div style={{ fontSize: 13, color: '#888', padding: 12 }}>
            Nessuna chat disponibile. Tocca + per scrivere all'owner.
          </div>
        )}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {/* Header */}
        {activeRoom && (() => {
          const room = rooms.find(r => r.id === activeRoom);
          if (!room) return null;
          return (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #d2d2d7', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{ROOM_TYPE_ICON[room.type] ?? '💬'}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{room.name}</div>
                <div style={{ fontSize: 10, color: '#86868b' }}>{ROOM_TYPE_LABEL[room.type]}</div>
              </div>
            </div>
          );
        })()}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#86868b', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>💬</div>
              Nessun messaggio.
            </div>
          ) : (
            messages.map(m => {
              const isMe = user && m.userId === user.userId;
              const isOwner = m.user?.roles?.includes('OWNER');
              return (
                <div key={m.id} style={{ display: 'flex', gap: 8, flexDirection: 'row', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  {!isMe && (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: isOwner ? '#0071e3' : '#e8f0ff',
                      color: isOwner ? '#fff' : '#0071e3',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                    }}>{isOwner ? 'N' : (m.user?.name?.[0] ?? '?')}</div>
                  )}
                  <div style={{ flex: 1, maxWidth: '75%' }}>
                    {!isMe && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>
                          {isOwner ? 'Owner' : (m.user?.name ?? 'Sistema')}
                        </span>
                        <span style={{ fontSize: 10, color: '#86868b' }}>{fmtTime(m.createdAt)}</span>
                      </div>
                    )}
                    <div style={{
                      fontSize: 14, lineHeight: 1.4,
                      color: isMe ? '#fff' : '#1d1d1f',
                      background: isMe ? '#0071e3' : '#f5f5f7',
                      borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      padding: '8px 12px', display: 'inline-block',
                    }}>{m.text}</div>
                    {isMe && (
                      <div style={{ fontSize: 10, color: '#86868b', textAlign: 'right', marginTop: 2 }}>{fmtTime(m.createdAt)}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: 12, borderTop: '1px solid #d2d2d7', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Scrivi un messaggio…"
            style={{
              flex: 1, borderRadius: 20, border: '1px solid #d2d2d7', padding: '10px 16px', fontSize: 14, outline: 'none',
            }}
          />
          <button onClick={send} disabled={!text.trim()} style={{
            borderRadius: 20, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: text.trim() ? '#0071e3' : '#e8e8ed', color: text.trim() ? '#fff' : '#86868b',
          }}>Invia</button>
        </div>
      </div>

      {/* Modal nuova chat diretta a owner */}
      {showNewDirect && (
        <div onClick={() => setShowNewDirect(false)} style={{
          position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, padding: 24, maxWidth: 380, width: '100%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📩</div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Chat con l'Owner</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#86868b' }}>
                Scrivi direttamente al proprietario. Solo tu e l'owner vedrete i messaggi.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={createDirectToOwner} style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: '#0071e3', color: '#fff', fontSize: 15, fontWeight: 600,
              }}>Crea chat</button>
              <button onClick={() => setShowNewDirect(false)} style={{
                padding: '14px 20px', borderRadius: 14, border: '1px solid #d2d2d7',
                background: '#fff', color: '#1d1d1f', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
