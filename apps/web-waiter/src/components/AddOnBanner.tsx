import { useEffect, useState } from 'react';
import { addOnApi, MenuAddOn } from '../api';

/**
 * Banner add-on: mostra i consigli dell'owner da proporre ai clienti.
 * Non invadente: banner scorrevole in alto, dismissable.
 * Il cameriere puo marcare "Proposto" o "Accettato" per le statistiche.
 */
export function AddOnBanner() {
  const [addons, setAddOns] = useState<MenuAddOn[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAddOns();
    // Refresh ogni 5 minuti
    const interval = setInterval(loadAddOns, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadAddOns() {
    try {
      const data = await addOnApi.active();
      // Filtra quelli non dismissati
      const visible = data.filter(a => !dismissed.has(a.id));
      setAddOns(visible);
    } catch {
      // Silenzioso: non bloccare l'app se non carica
    } finally {
      setLoading(false);
    }
  }

  async function trackProposed(id: string) {
    try {
      await addOnApi.track(id, false);
      dismiss(id);
    } catch {}
  }

  async function trackAccepted(id: string) {
    try {
      await addOnApi.track(id, true);
      dismiss(id);
    } catch {}
  }

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    setCurrentIdx(prev => prev + 1);
  }

  if (loading || addons.length === 0) return null;

  const addon = addons[currentIdx % addons.length];
  if (!addon) return null;

  const discountedPrice = addon.discountPct > 0
    ? Math.round(addon.product.priceCents * (1 - addon.discountPct / 100))
    : addon.product.priceCents;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #C71F14 0%, #D9A633 100%)',
      color: '#fff',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 12,
      boxShadow: '0 2px 12px rgba(199, 31, 20, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'slideDown 0.3s ease',
    }}>
      <div style={{ fontSize: 24 }}>✨</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{addon.title}</div>
        <div style={{ fontSize: 13, opacity: 0.95, marginTop: 2 }}>
          💬 {addon.staffScript}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          {addon.product.name} — {(discountedPrice / 100).toFixed(2)}€
          {addon.discountPct > 0 && (
            <span style={{ marginLeft: 6, textDecoration: 'line-through', opacity: 0.6 }}>
              {(addon.product.priceCents / 100).toFixed(2)}€
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => trackAccepted(addon.id)}
          style={{
            background: 'rgba(255,255,255,0.25)',
            border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ✓ Accettato
        </button>
        <button
          onClick={() => trackProposed(addon.id)}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Proposto
        </button>
        <button
          onClick={() => dismiss(addon.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
            opacity: 0.7,
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
