import { useEffect, useRef, useState } from 'react';
import { api, STATION_LABEL, type TableRow, type BoardResponse, type Station } from '../api';
import { colors } from '@la-piazzetta/ui';

interface TableReadyInfo {
  readyCount: number;
  readyItems: { name: string; quantity: number; station: Station }[];
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1046; // Do6 - più urgente
      gain.gain.value = 0.25;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.12);
    }
  } catch { /* audio non disponibile */ }
}

interface ReadyNotification {
  id: string;
  table: string;
  items: { name: string; quantity: number; station: Station }[];
  timestamp: number;
}

export default function Tables({ onOpenTable }: { onOpenTable: (table: TableRow) => void }) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState('');
  const [guestsFor, setGuestsFor] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [filter, setFilter] = useState<'all' | 'free' | 'occupied' | 'ready'>('all');
  const [notifications, setNotifications] = useState<ReadyNotification[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<ReadyNotification | null>(null);

  // Traccia stati precedenti per rilevare nuove transizioni a READY
  const prevReadyItems = useRef<Map<string, string>>(new Map()); // itemId → status

  async function load() {
    try {
      const [t, b] = await Promise.all([api.tables(), api.board()]);
      setTables(t);
      setBoard(b);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();

    // WebSocket per real-time
    let ws: WebSocket | null = null;
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = JSON.parse(localStorage.getItem('piazzetta.tokens') || '{}').accessToken;
      if (token) {
        ws = new WebSocket(`${protocol}//${location.hostname}:3000/ws?token=${token}`);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'board-update') load();
          } catch { /* ignore */ }
        };
      }
    } catch { /* ignore */ }

    const t = setInterval(load, 5000);
    return () => { clearInterval(t); if (ws) ws.close(); };
  }, []);

  // Mappa table name → ready items dal board
  const readyByTable = (() => {
    const map = new Map<string, TableReadyInfo>();
    if (!board) return map;
    const allOrders = [...board.BAR, ...board.TAVOLA_CALDA];
    // Deduplica per order id (un ordine può apparire in entrambe le colonne)
    const seen = new Set<string>();
    for (const o of allOrders) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const readyItems = o.items.filter((it) => it.status === 'READY');
      if (readyItems.length > 0) {
        const existing = map.get(o.table) ?? { readyCount: 0, readyItems: [] };
        for (const it of readyItems) {
          existing.readyCount += it.quantity;
          existing.readyItems.push({ name: it.name, quantity: it.quantity, station: it.station });
        }
        map.set(o.table, existing);
      }
    }
    return map;
  })();

  const totalReady = Array.from(readyByTable.values()).reduce((s, v) => s + v.readyItems.length, 0);

  // Rileva nuovi articoli diventati READY e crea notifiche + beep
  useEffect(() => {
    if (!board) return;
    const newStatuses = new Map<string, string>();
    const newReadyByTable = new Map<string, { name: string; quantity: number; station: Station }[]>();

    for (const station of ['BAR', 'TAVOLA_CALDA'] as Station[]) {
      for (const o of board[station]) {
        for (const it of o.items) {
          newStatuses.set(it.id, it.status);
          const prev = prevReadyItems.current.get(it.id);
          // Solo se passa DA non-READY A READY
          if (it.status === 'READY' && prev && prev !== 'READY') {
            if (!newReadyByTable.has(o.table)) newReadyByTable.set(o.table, []);
            newReadyByTable.get(o.table)!.push({ name: it.name, quantity: it.quantity, station: it.station });
          }
        }
      }
    }
    prevReadyItems.current = newStatuses;

    // Crea notifiche per i tavoli con nuovi articoli pronti
    if (newReadyByTable.size > 0) {
      beep();
      const newNotifs: ReadyNotification[] = [];
      for (const [table, items] of newReadyByTable) {
        newNotifs.push({
          id: `${table}-${Date.now()}-${Math.random()}`,
          table,
          items,
          timestamp: Date.now(),
        });
      }
      setNotifications((prev) => [...prev, ...newNotifs]);
      // Auto-rimuovi dopo 20 secondi
      for (const n of newNotifs) {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((x) => x.id !== n.id));
        }, 20000);
      }
    }
  }, [board]);

  async function openTable(t: TableRow) {
    const openSession = t.sessions.find((s) => s.state === 'OPEN');
    if (openSession) {
      onOpenTable(t);
      return;
    }
    setGuestsFor(t.id);
  }

  async function confirmOpen(t: TableRow) {
    try {
      await api.openSession(t.id, guests);
      setGuestsFor(null);
      await load();
      onOpenTable(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const filtered = tables.filter((t) => {
    if (filter === 'free') return t.state === 'FREE';
    if (filter === 'occupied') return t.state === 'OCCUPIED';
    if (filter === 'ready') return readyByTable.has(t.name);
    return true;
  });

  const freeCount = tables.filter((t) => t.state === 'FREE').length;
  const occCount = tables.filter((t) => t.state === 'OCCUPIED').length;
  const readyTablesCount = readyByTable.size;

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Sala</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={{ ...filterBtn, ...(filter === 'all' ? activeFilter : {}) }}>
            Tutti ({tables.length})
          </button>
          <button onClick={() => setFilter('free')} style={{ ...filterBtn, ...(filter === 'free' ? activeFilter : {}) }}>
            Liberi ({freeCount})
          </button>
          <button onClick={() => setFilter('occupied')} style={{ ...filterBtn, ...(filter === 'occupied' ? activeFilter : {}) }}>
            Occupati ({occCount})
          </button>
          {readyTablesCount > 0 && (
            <button onClick={() => setFilter('ready')} className="filter-ready-flash" style={filterBtn}>
              🔔 Pronti ({readyTablesCount})
            </button>
          )}
        </div>
      </div>

      {/* Banner globale lampeggiante se ci sono articoli pronti */}
      {totalReady > 0 && (
        <div className="global-ready-banner">
          <span style={{ fontSize: 28 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {totalReady} {totalReady === 1 ? 'ARTICOLO PRONTO' : 'ARTICOLI PRONTI'} · {readyTablesCount} {readyTablesCount === 1 ? 'TAVOLO' : 'TAVOLI'} DA RITIRARE!
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {Array.from(readyByTable.entries()).map(([table, info]) =>
                `${table}: ${info.readyItems.map((it) => `${it.quantity}× ${it.name}`).join(', ')}`
              ).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {error && <div style={errBox}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        {filtered.map((t) => {
          const occupied = t.state === 'OCCUPIED';
          const openSession = t.sessions.find((s) => s.state === 'OPEN');
          const readyInfo = readyByTable.get(t.name);
          const hasReady = !!readyInfo;

          return (
            <button
              key={t.id}
              onClick={() => openTable(t)}
              className={hasReady ? 'table-card-ready-flash' : ''}
              style={{
                ...tableCard,
                background: hasReady ? colors.warning : occupied ? colors.danger : colors.success,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{t.name}</div>
                {hasReady && (
                  <span className="table-ready-badge-flash">
                    🔔 {readyInfo!.readyCount}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                {t.seats} posti · {t.area === 'indoor' ? '🏠 Interno' : '🌿 Esterno'}
              </div>
              <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                {hasReady ? '🔔 PRONTO DA RITIRARE!' : occupied ? `Occupato · ${openSession?.guests ?? 0} coperti` : 'Libero'}
              </div>

              {/* Dettaglio articoli pronti */}
              {hasReady && (
                <div style={{ marginTop: 8, fontSize: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 8px' }}>
                  {readyInfo!.readyItems.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{it.quantity}× {it.name}</span>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{STATION_LABEL[it.station]}</span>
                    </div>
                  ))}
                </div>
              )}

              {guestsFor === t.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 10, background: '#ffffff22', borderRadius: 8, padding: 10,
                    display: 'flex', gap: 6, alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 12 }}>Coperti:</span>
                  <input
                    type="number"
                    min={1}
                    max={t.seats}
                    value={guests}
                    onChange={(e) => setGuests(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ width: 50, borderRadius: 6, border: 0, padding: '4px 6px', fontSize: 16, textAlign: 'center' }}
                  />
                  <button
                    onClick={() => confirmOpen(t)}
                    style={{ border: 0, borderRadius: 6, padding: '6px 12px', background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Apri
                  </button>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          Nessun tavolo in questa vista.
        </div>
      )}

      {/* Toast notifications lampeggianti — tocca per vedere cosa ritirare */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400,
      }}>
        {notifications.map((n) => {
          const totalQty = n.items.reduce((s, it) => s + it.quantity, 0);
          return (
            <div
              key={n.id}
              onClick={() => { setSelectedNotif(n); setNotifications((prev) => prev.filter((x) => x.id !== n.id)); }}
              className="toast-ready-flash"
            >
              <span style={{ fontSize: 32 }}>🔔</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {totalQty} {totalQty === 1 ? 'articolo pronto' : 'articoli pronti'} — {n.table}
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>
                  {n.items.map((it) => `${it.quantity}× ${it.name}`).join(' · ')}
                </div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
                  👆 Tocca per dettagli ritiro
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal dettaglio ritiro — cosa prendere e dove portare */}
      {selectedNotif && (
        <div
          onClick={() => setSelectedNotif(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="pickup-modal"
          >
            {/* Header */}
            <div style={{
              textAlign: 'center', marginBottom: 20,
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 14, color: colors.warning, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                Articoli pronti da ritirare
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                Porta a: {selectedNotif.table}
              </div>
            </div>

            {/* Lista articoli da ritirare */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {selectedNotif.items.map((it, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 14,
                  background: it.station === 'BAR' ? '#fff8e1' : '#fff3e0',
                  border: `2px solid ${it.station === 'BAR' ? '#ffc107' : '#ff9800'}`,
                }}>
                  {/* Quantità grande */}
                  <div style={{
                    fontSize: 28, fontWeight: 800, minWidth: 44, textAlign: 'center',
                    color: colors.warning,
                  }}>
                    {it.quantity}×
                  </div>
                  {/* Nome prodotto */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{it.name}</div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, marginTop: 2,
                      color: it.station === 'BAR' ? '#f57c00' : colors.warning,
                    }}>
                      📍 Ritira da: {STATION_LABEL[it.station]}
                    </div>
                  </div>
                  {/* Icona postazione */}
                  <div style={{ fontSize: 28 }}>
                    {it.station === 'BAR' ? '🍸' : '🍳'}
                  </div>
                </div>
              ))}
            </div>

            {/* Riepilogo postazioni */}
            <div style={{
              padding: '12px 16px', borderRadius: 12,
              background: '#f5f5f7', marginBottom: 20, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#1a1a2e' }}>
                📋 Riepilogo ritiri:
              </div>
              {(() => {
                const byStation = new Map<Station, number>();
                for (const it of selectedNotif.items) {
                  byStation.set(it.station, (byStation.get(it.station) ?? 0) + it.quantity);
                }
                return Array.from(byStation.entries()).map(([st, qty]) => (
                  <div key={st} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{st === 'BAR' ? '🍸 Bar' : '🍳 Cucina'}</span>
                    <span style={{ fontWeight: 700 }}>{qty} articoli</span>
                  </div>
                ));
              })()}
            </div>

            {/* Pulsanti */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  // Trova il tavolo e aprilo
                  const t = tables.find((x) => x.name === selectedNotif.table);
                  setSelectedNotif(null);
                  if (t) onOpenTable(t);
                }}
                style={{
                  flex: 1, padding: '16px 0', borderRadius: 14, border: 0,
                  background: colors.warning, color: '#fff', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✅ Vai al tavolo
              </button>
              <button
                onClick={() => setSelectedNotif(null)}
                style={{
                  padding: '16px 20px', borderRadius: 14, border: '2px solid #ddd',
                  background: '#fff', color: '#666', fontSize: 16, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS — lampeggiante giallo/arancio */}
      <style>{`
        @keyframes flashYellow {
          0%, 49% { background: ${colors.warning}; box-shadow: 0 0 16px rgba(255,111,0,0.6); }
          50%, 100% { background: #ffd600; box-shadow: 0 0 24px rgba(255,214,0,0.8); }
        }
        @keyframes flashBorder {
          0%, 49% { border-color: ${colors.warning}; box-shadow: 0 0 16px rgba(255,111,0,0.5); }
          50%, 100% { border-color: #ffd600; box-shadow: 0 0 24px rgba(255,214,0,0.7); }
        }
        @keyframes flashBadge {
          0%, 49% { background: #fff; color: ${colors.warning}; }
          50%, 100% { background: #1a1a2e; color: #ffd600; }
        }
        @keyframes flashBanner {
          0%, 49% {
            background: #ffd600;
            color: #1a1a2e;
            border-color: ${colors.warning};
            box-shadow: 0 4px 24px rgba(255,111,0,0.5);
          }
          50%, 100% {
            background: ${colors.warning};
            color: #fff;
            border-color: #ffd600;
            box-shadow: 0 4px 32px rgba(255,214,0,0.7);
          }
        }
        @keyframes flashFilter {
          0%, 49% { background: ${colors.warning}; color: #fff; border-color: ${colors.warning}; }
          50%, 100% { background: #ffd600; color: #1a1a2e; border-color: #ffd600; }
        }

        .table-card-ready-flash {
          animation: flashBorder 0.7s infinite !important;
          border: 4px solid ${colors.warning} !important;
        }

        .table-ready-badge-flash {
          font-size: 14px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 12px;
          animation: flashBadge 0.7s infinite;
        }

        .global-ready-banner {
          margin-bottom: 14px;
          padding: 14px 18px;
          border-radius: 14px;
          border: 3px solid ${colors.warning};
          display: flex;
          align-items: center;
          gap: 12px;
          animation: flashBanner 0.7s infinite;
        }

        .filter-ready-flash {
          animation: flashFilter 0.7s infinite !important;
        }

        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes flashToast {
          0%, 49% {
            background: linear-gradient(135deg, ${colors.warning} 0%, #f57c00 100%);
            color: #fff;
            border-color: #ffd600;
          }
          50%, 100% {
            background: linear-gradient(135deg, #ffd600 0%, ${colors.warning} 100%);
            color: #1a1a2e;
            border-color: ${colors.warning};
          }
        }
        @keyframes modalPop {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .toast-ready-flash {
          background: linear-gradient(135deg, ${colors.warning} 0%, #ffd600 100%);
          color: #1a1a2e;
          border-radius: 16px;
          padding: 16px 20px;
          box-shadow: 0 8px 32px rgba(255,111,0,0.5), 0 2px 8px rgba(255,214,0,0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: slideIn 0.3s ease-out, flashToast 0.7s infinite 0.3s;
          border: 2px solid #ffd600;
        }

        .pickup-modal {
          background: #fff;
          borderRadius: 24px;
          padding: 28px;
          max-width: 480px;
          width: 100%;
          borderRadius: 24px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.3);
          animation: modalPop 0.25s ease-out;
          max-height: 85vh;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}

const filterBtn: React.CSSProperties = {
  border: '1px solid #ddd', background: '#fff', borderRadius: 16, padding: '6px 14px',
  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a1a2e',
};
const activeFilter: React.CSSProperties = {
  background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e',
};
const tableCard: React.CSSProperties = {
  padding: 18, borderRadius: 14, border: 'none', color: '#fff',
  textAlign: 'left', cursor: 'pointer', transition: 'transform 0.1s',
};
const errBox: React.CSSProperties = {
  color: colors.danger, background: '#ffebee', borderRadius: 8, padding: '8px 12px',
  marginBottom: 12, fontSize: 13,
};
