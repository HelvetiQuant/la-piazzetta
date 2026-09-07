import { useEffect, useRef, useState } from 'react';
import { api, NEXT_STATUS, type BoardOrder, type ItemStatus, type BoardItem } from '../api';

const STATION = ((import.meta.env.VITE_STATION as string | undefined) || 'BAR') as 'BAR' | 'TAVOLA_CALDA';
const STATION_LABEL = STATION === 'BAR' ? 'Bar' : 'Cucina';
const STATION_ICON = STATION === 'BAR' ? '🍸' : '🍳';

const COLUMNS: { status: ItemStatus; label: string; color: string }[] = [
  { status: 'PENDING', label: 'In arrivo', color: '#0071e3' },
  { status: 'IN_PREPARATION', label: 'In preparazione', color: '#ff9500' },
  { status: 'READY', label: 'Pronti', color: '#34c759' },
];

function ageColor(waitingSec: number): string {
  if (waitingSec > 600) return '#ff3b30';
  if (waitingSec > 300) return '#ff9500';
  return '#34c759';
}

function ageLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio non disponibile */ }
}

export default function Board() {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  async function load() {
    try {
      const { orders: fresh } = await api.board(STATION);
      const freshItemIds = new Set(fresh.flatMap((o) => o.items.map((i) => i.id)));
      const isFirstLoad = knownIds.current.size === 0;
      const hasNew = !isFirstLoad && [...freshItemIds].some((id) => !knownIds.current.has(id));
      if (hasNew) beep();
      knownIds.current = freshItemIds;
      setOrders(fresh);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bump(itemId: string, current: ItemStatus) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    try {
      await api.bumpItem(itemId, next);
      setSelectedItem(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const totalCount = orders.reduce((s, o) => s + o.items.length, 0);
  const pendingCount = orders.reduce((s, o) => s + o.items.filter((i) => i.status === 'PENDING').length, 0);
  const readyCount = orders.reduce((s, o) => s + o.items.filter((i) => i.status === 'READY').length, 0);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif', minHeight: '100vh', background: '#000', color: '#fff' }}>
      {/* Header Apple-style */}
      <header style={{
        padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(28,28,30,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>{STATION_ICON}</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{STATION_LABEL}</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>La Piazzetta KDS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0071e3' }}>{pendingCount}</div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>In arrivo</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ff9500' }}>{totalCount - pendingCount - readyCount}</div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>In prep.</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#34c759' }}>{readyCount}</div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>Pronti</div>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ margin: 16, padding: '12px 16px', background: 'rgba(255,59,48,0.15)', borderRadius: 12, color: '#ff3b30', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Colonne Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 16, padding: 16 }}>
        {COLUMNS.map((col) => {
          const cards = orders.flatMap((o) =>
            o.items
              .filter((i) => i.status === col.status)
              .map((i) => ({ item: i, order: o })),
          );
          return (
            <div key={col.status} style={{ background: 'rgba(28,28,30,0.6)', borderRadius: 16, padding: 12, minHeight: '75vh' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{col.label}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 13, fontWeight: 700,
                  background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '2px 10px',
                }}>
                  {cards.length}
                </span>
              </div>

              {cards.map(({ item, order }) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  style={{
                    background: 'rgba(44,44,46,0.8)',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    cursor: 'pointer',
                    borderLeft: `4px solid ${ageColor(order.waitingSec)}`,
                    transition: 'transform 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(58,58,60,0.9)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(44,44,46,0.8)'; }}
                >
                  {/* Header card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{order.table}</div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: ageColor(order.waitingSec),
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      ⏱ {ageLabel(order.waitingSec)}
                    </div>
                  </div>

                  {/* Nome prodotto */}
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, letterSpacing: -0.3 }}>
                    {item.quantity}× {item.name}
                  </div>

                  {/* Note cliente */}
                  {item.notes && (
                    <div style={{
                      marginTop: 8, padding: '8px 10px', borderRadius: 10,
                      background: 'rgba(255,149,0,0.12)', color: '#ff9500',
                      fontSize: 13, fontStyle: 'italic',
                    }}>
                      📝 {item.notes}
                    </div>
                  )}

                  {/* Indicatore ricetta disponibile */}
                  {item.preparation && (
                    <div style={{
                      marginTop: 8, fontSize: 12, color: '#0071e3',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      📖 Tocca per la ricetta
                    </div>
                  )}
                </div>
              ))}

              {cards.length === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: 30, fontSize: 15 }}>
                  Nessun articolo
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal ricetta Apple-style */}
      {selectedItem && (
        <RecipeModal
          item={selectedItem}
          order={orders.find((o) => o.items.some((i) => i.id === selectedItem.id))!}
          onClose={() => setSelectedItem(null)}
          onBump={() => bump(selectedItem.id, selectedItem.status)}
        />
      )}
    </div>
  );
}

function RecipeModal({
  item, order, onClose, onBump,
}: {
  item: BoardItem;
  order: BoardOrder;
  onClose: () => void;
  onBump: () => void;
}) {
  const nextStatus = NEXT_STATUS[item.status];
  const statusLabels: Record<string, string> = {
    PENDING: 'In arrivo', IN_PREPARATION: 'In preparazione', READY: 'Pronto', SERVED: 'Servito',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(28,28,30,0.95)',
          borderRadius: 24, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header modal */}
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 4 }}>
                {order.table} · {statusLabels[item.status]}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
                {item.quantity}× {item.name}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)', border: 0, color: '#fff',
                cursor: 'pointer', fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Note cliente */}
        {item.notes && (
          <div style={{ padding: '16px 28px' }}>
            <div style={{
              padding: '14px 16px', borderRadius: 14,
              background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.2)',
            }}>
              <div style={{ fontSize: 12, color: '#ff9500', fontWeight: 600, marginBottom: 4 }}>
                📝 RICHIESTA DEL CLIENTE
              </div>
              <div style={{ fontSize: 16, color: '#ff9500', fontStyle: 'italic' }}>
                {item.notes}
              </div>
            </div>
          </div>
        )}

        {/* Ricetta / Preparazione */}
        {item.preparation ? (
          <div style={{ padding: '16px 28px' }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#0071e3',
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
            }}>
              📖 Preparazione
            </div>
            <div style={{
              fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)',
            }}>
              {item.preparation}
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px 28px' }}>
            <div style={{
              padding: 20, borderRadius: 14, background: 'rgba(255,255,255,0.05)',
              textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15,
            }}>
              Nessuna ricetta specificata per questo prodotto.
            </div>
          </div>
        )}

        {/* Azione avanzamento stato */}
        <div style={{ padding: '20px 28px 28px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {nextStatus ? (
            <button
              onClick={onBump}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 14, border: 0,
                background: nextStatus === 'READY' ? '#34c759' : nextStatus === 'IN_PREPARATION' ? '#ff9500' : '#0071e3',
                color: '#fff', fontSize: 17, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {nextStatus === 'IN_PREPARATION' && '🔥 Inizia preparazione'}
              {nextStatus === 'READY' && '✅ Segna come pronto'}
              {nextStatus === 'SERVED' && '🍽️ Segna come servito'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>
              Articolo completato
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
