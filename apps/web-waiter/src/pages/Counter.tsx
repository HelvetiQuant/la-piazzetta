/**
 * Modalità Banco: vendita al banco senza tavolo.
 *
 * Criterio di accettazione: due tap per un caffè.
 *   1° tap: prodotto (aggiunge al carrello)
 *   2° tap: "Incassa contanti" (chiude la vendita)
 *
 * Griglia dei 20 prodotti più venduti + ricerca rapida.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, cashierApi, fmtEuro, type Product, type PaymentMethod } from '../api';
import CreditDialog from './CreditDialog';

interface CartLine {
  product: Product;
  quantity: number;
}

export default function Counter() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [paying, setPaying] = useState(false);
  const [lastResult, setLastResult] = useState<{ orderId: string; totalCents: number; changeCents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCredit, setShowCredit] = useState(false);

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError(String(e.message ?? e)));
  }, []);

  // Griglia: tutti i prodotti filtrati per ricerca. I "20 più venduti" verranno
  // ordinati per frequenza reale quando l'endpoint products esporrà il conteggio.
  const grid = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = s
      ? products.filter((p) => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s))
      : products;
    return filtered.slice(0, 20);
  }, [products, search]);

  const totalCents = cart.reduce((s, l) => s + l.product.priceCents * l.quantity, 0);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) return prev.map((l) => l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product: p, quantity: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) => prev
      .map((l) => l.product.id === productId ? { ...l, quantity: l.quantity + delta } : l)
      .filter((l) => l.quantity > 0));
  }

  async function quickSale(method: PaymentMethod, tenderedCents?: number) {
    if (cart.length === 0) return;
    setPaying(true);
    setError(null);
    try {
      const result = await cashierApi.quickSale({
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        payment: { method, amountCents: method === 'CASH' ? (tenderedCents ?? totalCents) : totalCents, tenderedCents },
      });
      setLastResult(result);
      setCart([]);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, paddingBottom: 80 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>☕ Modalità Banco</h2>

      {error && <div style={{ background: '#ffebee', color: '#c62828', padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {lastResult && (
        <div style={{ background: '#e8f5e9', color: '#2e7d32', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          ✓ Vendita chiusa · Totale {fmtEuro(lastResult.totalCents)}
          {lastResult.changeCents > 0 && ` · Resto ${fmtEuro(lastResult.changeCents)}`}
          <button onClick={() => setLastResult(null)} style={{ float: 'right', background: 'transparent', border: 'none', cursor: 'pointer', color: '#2e7d32' }}>✕</button>
        </div>
      )}

      <input
        type="search"
        placeholder="Cerca prodotto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '12px 16px', fontSize: 16, borderRadius: 12,
          border: '2px solid #e0e0e0', marginBottom: 16, boxSizing: 'border-box',
        }}
      />

      {/* Griglia prodotti: 1° tap aggiunge al carrello */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {grid.map((p) => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            style={{
              background: '#fff', border: '2px solid #e0e0e0', borderRadius: 12,
              padding: 14, cursor: 'pointer', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#C71F14' }}>{fmtEuro(p.priceCents)}</span>
          </button>
        ))}
      </div>

      {/* Carrello + incasso: 2° tap chiude la vendita */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '2px solid #e0e0e0', padding: 16,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', zIndex: 20,
        }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Carrello ({cart.reduce((s, l) => s + l.quantity, 0)} articoli)</strong>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#C71F14' }}>{fmtEuro(totalCents)}</span>
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 8 }}>
              {cart.map((l) => (
                <div key={l.product.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 14 }}>
                  <span>{l.product.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => changeQty(l.product.id, -1)} style={qtyBtn}>−</button>
                    {l.quantity}
                    <button onClick={() => changeQty(l.product.id, 1)} style={qtyBtn}>+</button>
                    <span style={{ minWidth: 60, textAlign: 'right' }}>{fmtEuro(l.product.priceCents * l.quantity)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => quickSale('CASH')}
                disabled={paying}
                style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, background: '#C71F14', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
              >
                💶 Incassa contanti
              </button>
              <button
                onClick={() => quickSale('CARD')}
                disabled={paying}
                style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, background: '#1565c0', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
              >
                💳 Carta
              </button>
              <button
                onClick={() => setShowCredit(true)}
                disabled={paying}
                style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, background: '#6a1b9a', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
              >
                📋 Credito
              </button>
              <button
                onClick={() => setCart([])}
                style={{ padding: '14px 16px', fontSize: 14, background: '#f5f5f5', border: 'none', borderRadius: 12, cursor: 'pointer' }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {showCredit && (
        <CreditDialog
          defaultAmountCents={totalCents}
          onClose={() => setShowCredit(false)}
          onCharged={() => {
            setShowCredit(false);
            setCart([]);
            setLastResult({ orderId: 'credito', totalCents, changeCents: 0 });
          }}
        />
      )}
    </div>
  );
}

const qtyBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid #ddd',
  background: '#f5f5f5', cursor: 'pointer', fontSize: 16, fontWeight: 700,
};
