import { useEffect, useRef, useState } from 'react';
import { api, NEXT_STATUS, type BoardOrder, type ItemStatus } from '../api';
import { colors } from '@la-piazzetta/ui';

const STATION = ((import.meta.env.VITE_STATION as string | undefined) || 'BAR') as 'BAR' | 'TAVOLA_CALDA';
const STATION_LABEL = STATION === 'BAR' ? 'Bar' : 'Cucina';

const COLUMNS: { status: ItemStatus; label: string }[] = [
  { status: 'PENDING', label: 'In arrivo' },
  { status: 'IN_PREPARATION', label: 'In preparazione' },
  { status: 'READY', label: 'Pronti' },
];

function ageColor(waitingSec: number): string {
  if (waitingSec > 600) return colors.danger;
  if (waitingSec > 300) return '#ef6c00';
  return colors.success;
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

  // WebSocket: reload on push notification + polling fallback
  useEffect(() => {
    load();
    // WebSocket connection
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
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const totalCount = orders.reduce((s, o) => s + o.items.length, 0);

  return (
    <div style={{ fontFamily: 'system-ui', minHeight: '100vh', background: '#111', color: '#fff', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>KDS · {STATION_LABEL}</h1>
        <span style={{ fontSize: 14, opacity: 0.6 }}>{totalCount} articoli attivi</span>
      </div>
      {error && <p style={{ color: '#ff8a80' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 12 }}>
        {COLUMNS.map((col) => {
          const cards = orders.flatMap((o) =>
            o.items
              .filter((i) => i.status === col.status)
              .map((i) => ({ item: i, order: o })),
          );
          return (
            <div key={col.status} style={{ background: '#1c1c1c', borderRadius: 10, padding: 10, minHeight: '70vh' }}>
              <h2 style={{ fontSize: 16, margin: '4px 0 10px' }}>
                {col.label} · {cards.length}
              </h2>
              {cards.map(({ item, order }) => (
                <div
                  key={item.id}
                  onClick={() => bump(item.id, item.status)}
                  style={{
                    background: '#2a2a2a',
                    borderLeft: `5px solid ${ageColor(order.waitingSec)}`,
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 8,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    {order.table} · {Math.floor(order.waitingSec / 60)}′{order.waitingSec % 60}s
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {item.quantity}× {item.name}
                  </div>
                  {item.notes && (
                    <div style={{
                      marginTop: 6, padding: '6px 8px', borderRadius: 6,
                      background: '#4e342e', color: '#ffab91', fontSize: 13, fontStyle: 'italic',
                    }}>
                      📝 {item.notes}
                    </div>
                  )}
                </div>
              ))}
              {cards.length === 0 && (
                <div style={{ textAlign: 'center', color: '#555', padding: 20, fontSize: 14 }}>
                  Nessun articolo
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
