import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api, fmtEuro, CATEGORY_LABELS, STATION_LABEL, stationForCategory,
  type OrderRow, type OrderItem, type Product, type TableRow, type Station,
} from '../api';
import { colors } from '@la-piazzetta/ui';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bozza',
  SENT: 'Inviata',
  IN_PREPARATION: 'In preparazione',
  READY: 'Pronta',
  SERVED: 'Servita',
  PAID: 'Pagata',
  CANCELLED: 'Annullata',
  PENDING: 'In attesa',
};

const STATUS_COLOR: Record<string, string> = {
  SENT: '#1976d2',
  IN_PREPARATION: '#f57c00',
  READY: colors.success,
  SERVED: '#6a1b9a',
  PAID: '#455a64',
  CANCELLED: colors.danger,
  PENDING: '#1976d2',
};

interface CartLine {
  product: Product;
  quantity: number;
  notes: string;
}

interface ReadyNotification {
  id: string;
  itemId: string;
  productName: string;
  quantity: number;
  station: Station;
  table: string;
  timestamp: number;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Doppio beep per "ordine pronto"
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 988; // Si5
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.15);
    }
  } catch { /* audio non disponibile */ }
}

export default function TableOrder({ table, onBack }: { table: TableRow; onBack: () => void }) {
  const session = table.sessions.find((s) => s.state === 'OPEN');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notifications, setNotifications] = useState<ReadyNotification[]>([]);

  // Traccia stati precedenti degli item per rilevare transizioni a READY
  const prevStatuses = useRef<Map<string, string>>(new Map());

  function addNotification(n: Omit<ReadyNotification, 'id' | 'timestamp'>) {
    const notif: ReadyNotification = { ...n, id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, timestamp: Date.now() };
    setNotifications((prev) => [...prev, notif]);
    beep();
    // Auto-rimuovi dopo 15 secondi
    setTimeout(() => {
      setNotifications((prev) => prev.filter((x) => x.id !== notif.id));
    }, 15000);
  }

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((x) => x.id !== id));
  }

  async function loadOrders() {
    if (!session) return;
    try {
      const fresh = await api.sessionOrders(session.id);

      // Rileva transizioni a READY
      const newStatuses = new Map<string, string>();
      for (const o of fresh) {
        for (const it of o.items) {
          newStatuses.set(it.id, it.status);
          const prev = prevStatuses.current.get(it.id);
          // Notifica solo se passa DA non-READY A READY
          if (it.status === 'READY' && prev && prev !== 'READY') {
            addNotification({
              itemId: it.id,
              productName: it.product.name,
              quantity: it.quantity,
              station: it.station as Station,
              table: table.name,
            });
          }
        }
      }
      prevStatuses.current = newStatuses;
      setOrders(fresh);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError((e as Error).message));
    loadOrders();

    // WebSocket per aggiornamento real-time
    let ws: WebSocket | null = null;
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = JSON.parse(localStorage.getItem('piazzetta.tokens') || '{}').accessToken;
      if (token) {
        ws = new WebSocket(`${protocol}//${location.hostname}:3000/ws?token=${token}`);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'board-update') loadOrders();
          } catch { /* ignore */ }
        };
      }
    } catch { /* ignore */ }

    const t = setInterval(loadOrders, 5000);
    return () => { clearInterval(t); if (ws) ws.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products],
  );
  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [categories, category]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.filter((p) => p.category === category);
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, category, search]);

  const cartTotal = cart.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);

  const cartByStation = useMemo(() => {
    const groups: Record<Station, CartLine[]> = { BAR: [], TAVOLA_CALDA: [] };
    for (const l of cart) {
      groups[stationForCategory(l.product.category)].push(l);
    }
    return groups;
  }, [cart]);

  // Conta articoli pronti non ancora serviti
  const readyItems = useMemo(() => {
    return orders.flatMap((o) => o.items.filter((it) => it.status === 'READY'));
  }, [orders]);

  function addToCart(p: Product) {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id && !l.notes);
      if (existing) {
        return c.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...c, { product: p, quantity: 1, notes: '' }];
    });
  }

  function changeQty(line: CartLine, delta: number) {
    setCart((c) =>
      c
        .map((l) => (l === line ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(line: CartLine) {
    setCart((c) => c.filter((l) => l !== line));
  }

  function startEditNotes(line: CartLine) {
    setEditingNotesFor(line.product.id + line.notes);
    setNotesDraft(line.notes);
  }

  function saveNotes(line: CartLine) {
    setCart((c) => c.map((l) => (l === line ? { ...l, notes: notesDraft.trim() } : l)));
    setEditingNotesFor(null);
    setNotesDraft('');
  }

  async function sendOrder() {
    if (!session || cart.length === 0) return;
    setSending(true);
    setError('');
    try {
      const clientOrderId = crypto.randomUUID?.() ?? `${session.id}-${Date.now()}`;
      await api.createOrder(
        session.id,
        cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          notes: l.notes || undefined,
        })),
        clientOrderId,
      );
      setCart([]);
      await loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function advance(order: OrderRow, status: 'SERVED' | 'PAID') {
    try {
      await api.setOrderStatus(order.id, status);
      await loadOrders();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!session) {
    return (
      <div style={{ padding: 16, fontFamily: 'system-ui' }}>
        <button onClick={onBack} style={backBtn}>← Sala</button>
        <p style={{ color: '#888' }}>Nessuna sessione aperta per questo tavolo.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui', background: '#f5f5f7' }}>
      {/* Colonna sinistra: menu prodotti */}
      <div style={{ flex: 2, padding: 16, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={backBtn}>← Sala</button>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            {table.name} <span style={{ color: '#888', fontWeight: 400 }}>· {session.guests} coperti</span>
          </h2>
          {readyItems.length > 0 && (
            <span className="ready-badge-flash">
              🔔 {readyItems.length} PRONTI!
            </span>
          )}
        </div>

        {error && <div style={errBox}>{error}</div>}

        {/* Banner articoli pronti — lampeggiante */}
        {readyItems.length > 0 && (
          <div className="ready-banner-flash">
            <span style={{ fontSize: 28 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {readyItems.length} {readyItems.length === 1 ? 'ARTICOLO PRONTO' : 'ARTICOLI PRONTI'} DA RITIRARE!
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                {readyItems.map((it) => `${it.quantity}× ${it.product.name} [${STATION_LABEL[it.station as Station] ?? it.station}]`).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <input
          placeholder="Cerca prodotto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchStyle}
        />

        {/* Categorie */}
        {!search && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                style={{
                  ...catBtn,
                  background: category === c ? '#1a1a2e' : '#fff',
                  color: category === c ? '#fff' : '#1a1a2e',
                }}
              >
                {CATEGORY_LABELS[c] ?? c}
              </button>
            ))}
          </div>
        )}

        {/* Griglia prodotti */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
          {filteredProducts.map((p) => {
            const station = stationForCategory(p.category);
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                style={productCard}
              >
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 700 }}>{fmtEuro(p.priceCents)}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: station === 'BAR' ? '#e3f2fd' : '#fff3e0',
                    color: station === 'BAR' ? colors.secondary : colors.warning,
                    fontWeight: 600,
                  }}>
                    {STATION_LABEL[station]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Comande esistenti */}
        <h3 style={{ marginTop: 24, marginBottom: 8, fontSize: 16 }}>Comande del tavolo</h3>
        {orders.length === 0 && <p style={{ color: '#888' }}>Nessuna comanda ancora.</p>}
        {orders.map((o) => {
          const hasReady = o.items.some((it) => it.status === 'READY');
          return (
            <div key={o.id} className={hasReady ? 'order-card-ready-flash' : ''} style={orderCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...statusBadge, background: STATUS_COLOR[o.status] ?? '#999' }}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <span style={{ fontWeight: 700 }}>{fmtEuro(o.totalCents)}</span>
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, listStyle: 'none' }}>
                {o.items.map((it) => (
                  <li key={it.id} className={it.status === 'READY' ? 'item-ready-flash' : ''} style={{
                    padding: '6px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        <strong>{it.quantity}×</strong> {it.product.name}
                        <span style={{
                          marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 3,
                          background: it.station === 'BAR' ? '#e3f2fd' : '#fff3e0',
                          color: it.station === 'BAR' ? colors.secondary : colors.warning,
                        }}>
                          {STATION_LABEL[it.station as Station] ?? it.station}
                        </span>
                        {it.status === 'READY' && (
                          <span className="ready-tag-flash">
                            ✅ PRONTO
                          </span>
                        )}
                      </span>
                      <span style={{ color: STATUS_COLOR[it.status] ?? '#999', fontSize: 11 }}>
                        {STATUS_LABEL[it.status] ?? it.status}
                      </span>
                    </div>
                    {it.notes && (
                      <div style={{ color: colors.warning, fontSize: 12, fontStyle: 'italic', marginTop: 2, paddingLeft: 8 }}>
                        📝 {it.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                {o.status === 'READY' && (
                  <button onClick={() => advance(o, 'SERVED')} style={{ ...actionBtn, background: colors.warning, color: '#fff', borderColor: colors.warning }}>
                    ✅ Segna servita
                  </button>
                )}
                {o.status === 'SERVED' && (
                  <button onClick={() => advance(o, 'PAID')} style={actionBtn}>
                    Segna pagata
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Colonna destra: carrello */}
      <div style={{
        flex: 1, background: '#fff', padding: 16, borderLeft: '1px solid #e0e0e0',
        display: 'flex', flexDirection: 'column', minWidth: 320,
      }}>
        <h3 style={{ marginTop: 0, fontSize: 18 }}>Carrello</h3>

        {cart.length === 0 && <p style={{ color: '#888' }}>Vuoto. Tocca un prodotto per aggiungerlo.</p>}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {cart.map((line, idx) => {
            const station = stationForCategory(line.product.category);
            const noteKey = line.product.id + line.notes;
            const isEditing = editingNotesFor === noteKey;
            return (
              <div key={idx} style={cartLineBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{line.product.name}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      {fmtEuro(line.product.priceCents)} · {STATION_LABEL[station]}
                    </div>
                  </div>
                  <button onClick={() => removeLine(line)} style={removeBtn}>✕</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button onClick={() => changeQty(line, -1)} style={qtyBtn}>−</button>
                  <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{line.quantity}</span>
                  <button onClick={() => changeQty(line, 1)} style={qtyBtn}>+</button>
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                    {fmtEuro(line.product.priceCents * line.quantity)}
                  </span>
                </div>

                {/* Note per riga */}
                <div style={{ marginTop: 8 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        autoFocus
                        placeholder="es. senza cipolla, ben cotta, senza ghiaccio…"
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveNotes(line); if (e.key === 'Escape') setEditingNotesFor(null); }}
                        style={noteInput}
                        maxLength={200}
                      />
                      <button onClick={() => saveNotes(line)} style={noteSaveBtn}>OK</button>
                    </div>
                  ) : line.notes ? (
                    <button onClick={() => startEditNotes(line)} style={noteDisplayBtn}>
                      📝 {line.notes}
                    </button>
                  ) : (
                    <button onClick={() => startEditNotes(line)} style={noteAddBtn}>
                      + Aggiungi nota
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Anteprima routing bar/cucina */}
        {cart.length > 0 && (
          <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 12, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Invio a:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {cartByStation.BAR.length > 0 && (
                <span style={{ ...routeBadge, background: '#e3f2fd', color: colors.secondary }}>
                  🍸 Bar: {cartByStation.BAR.reduce((s, l) => s + l.quantity, 0)} articoli
                </span>
              )}
              {cartByStation.TAVOLA_CALDA.length > 0 && (
                <span style={{ ...routeBadge, background: '#fff3e0', color: colors.warning }}>
                  🍳 Cucina: {cartByStation.TAVOLA_CALDA.reduce((s, l) => s + l.quantity, 0)} articoli
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ fontWeight: 700, fontSize: 18, padding: '8px 0' }}>
          Totale: {fmtEuro(cartTotal)}
        </div>
        <button
          onClick={sendOrder}
          disabled={sending || cart.length === 0}
          style={{
            ...sendBtn,
            opacity: sending || cart.length === 0 ? 0.5 : 1,
          }}
        >
          {sending ? 'Invio in corso…' : 'Invia comanda a Bar/Cucina'}
        </button>
      </div>

      {/* Toast notifications - articoli pronti */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380,
      }}>
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => dismissNotification(n.id)}
            className="toast-ready-flash"
          >
            <span style={{ fontSize: 32 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {n.quantity}× {n.productName} — PRONTO!
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                Ritira da {STATION_LABEL[n.station]} · {n.table}
              </div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
                Tocca per chiudere
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CSS animations — lampeggiante giallo/arancio per ordini pronti */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        /* === Lampeggiante giallo/arancio per "pronto" === */

        /* Badge header */
        .ready-badge-flash {
          padding: 6px 14px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          animation: flashYellow 0.8s infinite;
        }
        @keyframes flashYellow {
          0%, 49% { background: ${colors.warning}; box-shadow: 0 0 12px rgba(255,111,0,0.6); }
          50%, 100% { background: #ffd600; color: #1a1a2e; box-shadow: 0 0 20px rgba(255,214,0,0.8); }
        }

        /* Banner grande lampeggiante */
        .ready-banner-flash {
          margin-bottom: 12px;
          padding: 14px 18px;
          border-radius: 14px;
          color: #1a1a2e;
          display: flex;
          align-items: center;
          gap: 12;
          animation: flashBanner 0.8s infinite;
          border: 3px solid ${colors.warning};
        }
        @keyframes flashBanner {
          0%, 49% {
            background: #ffd600;
            border-color: ${colors.warning};
            box-shadow: 0 0 20px rgba(255,111,0,0.5);
          }
          50%, 100% {
            background: ${colors.warning};
            color: #fff;
            border-color: #ffd600;
            box-shadow: 0 0 30px rgba(255,214,0,0.7);
          }
        }

        /* Card ordine con articoli pronti — bordo lampeggiante */
        .order-card-ready-flash {
          border: 3px solid ${colors.warning} !important;
          animation: flashBorder 0.8s infinite;
        }
        @keyframes flashBorder {
          0%, 49% {
            border-color: ${colors.warning};
            box-shadow: 0 0 12px rgba(255,111,0,0.4);
          }
          50%, 100% {
            border-color: #ffd600;
            box-shadow: 0 0 20px rgba(255,214,0,0.6);
          }
        }

        /* Riga articolo pronto — sfondo lampeggiante */
        .item-ready-flash {
          border-radius: 8px;
          padding: 8px 10px !important;
          margin: 2px -10px !important;
          animation: flashItem 0.8s infinite;
        }
        @keyframes flashItem {
          0%, 49% { background: rgba(255,214,0,0.25); }
          50%, 100% { background: rgba(255,111,0,0.15); }
        }

        /* Tag "PRONTO" lampeggiante */
        .ready-tag-flash {
          margin-left: 6px;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 6px;
          animation: flashTag 0.8s infinite;
        }
        @keyframes flashTag {
          0%, 49% { background: ${colors.warning}; color: #fff; }
          50%, 100% { background: #ffd600; color: #1a1a2e; }
        }

        /* Toast notification lampeggiante */
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
          animation: slideIn 0.3s ease-out, flashToast 0.8s infinite 0.3s;
          border: 2px solid #ffd600;
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
      `}</style>
    </div>
  );
}

// === Styles ===
const backBtn: React.CSSProperties = {
  border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '6px 12px',
  cursor: 'pointer', fontSize: 14,
};
const searchStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e0e0e0',
  fontSize: 15, marginBottom: 12, boxSizing: 'border-box', background: '#fff',
};
const catBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 16, border: '1px solid #e0e0e0',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const productCard: React.CSSProperties = {
  padding: 12, borderRadius: 12, border: '1px solid #e8e8e8', background: '#fff',
  textAlign: 'left', cursor: 'pointer', transition: 'transform 0.1s',
};
const orderCard: React.CSSProperties = {
  border: '1px solid #e8e8e8', borderRadius: 12, padding: 12, marginBottom: 8, background: '#fff',
};
const statusBadge: React.CSSProperties = {
  color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
};
const actionBtn: React.CSSProperties = {
  border: '1px solid #1a1a2e', background: '#fff', borderRadius: 8, padding: '6px 12px',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const errBox: React.CSSProperties = {
  color: colors.danger, background: '#ffebee', borderRadius: 8, padding: '8px 12px',
  marginBottom: 12, fontSize: 13,
};
const cartLineBox: React.CSSProperties = {
  borderBottom: '1px solid #f0f0f0', padding: '10px 0',
};
const qtyBtn: React.CSSProperties = {
  border: '1px solid #ddd', background: '#fff', borderRadius: 6, width: 28, height: 28,
  cursor: 'pointer', fontSize: 16, fontWeight: 700,
};
const removeBtn: React.CSSProperties = {
  border: 0, background: 'transparent', color: colors.danger, cursor: 'pointer',
  fontSize: 14, padding: 4,
};
const noteInput: React.CSSProperties = {
  flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12,
};
const noteSaveBtn: React.CSSProperties = {
  border: 0, borderRadius: 6, background: '#1a1a2e', color: '#fff', padding: '6px 10px',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
};
const noteDisplayBtn: React.CSSProperties = {
  border: '1px solid #ffe0b2', background: '#fff8e1', borderRadius: 6, padding: '4px 8px',
  cursor: 'pointer', fontSize: 12, color: colors.warning, fontStyle: 'italic', textAlign: 'left',
};
const noteAddBtn: React.CSSProperties = {
  border: '1px dashed #bbb', background: 'transparent', borderRadius: 6, padding: '4px 8px',
  cursor: 'pointer', fontSize: 12, color: '#888',
};
const routeBadge: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
};
const sendBtn: React.CSSProperties = {
  padding: '14px 0', borderRadius: 12, border: 0, background: '#1a1a2e', color: '#fff',
  fontWeight: 700, fontSize: 16, cursor: 'pointer',
};
