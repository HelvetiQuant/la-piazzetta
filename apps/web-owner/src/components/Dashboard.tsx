import { useState, useEffect, useCallback, useRef } from 'react';
import { dash, fmtEuro, fmtSec, subscribeDashboard, type DashboardData, type DashboardEvent } from '../api';

const RANGES = [
  { id: 'today', label: 'Oggi' },
  { id: 'yesterday', label: 'Ieri' },
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
] as const;

const COLORS = {
  bg: '#f5f5f7',
  card: '#ffffff',
  text: '#1d1d1f',
  secondary: '#86868b',
  accent: '#0071e3',
  success: '#34c759',
  danger: '#ff3b30',
  warning: '#ff9500',
  border: '#d2d2d7',
};

const cardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  padding: 20,
};

function Delta({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span style={{ fontSize: 13, color: positive ? COLORS.success : COLORS.danger, fontWeight: 500 }}>
      {positive ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({ label, value, delta, sub }: { label: string; value: string; delta?: number; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLORS.text, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        {delta !== undefined && <Delta pct={delta} />}
        {sub && <span style={{ fontSize: 13, color: COLORS.secondary }}>{sub}</span>}
      </div>
    </div>
  );
}

function MiniBarChart({ data, max, color = COLORS.accent, height = 120, format }: {
  data: { label: string; value: number }[];
  max: number;
  color?: string;
  height?: number;
  format?: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, padding: '8px 0' }}>
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * height : 0;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div title={format ? format(d.value) : String(d.value)} style={{
              width: '100%', maxWidth: 24, height: Math.max(h, 2), borderRadius: 4, background: color, opacity: d.value > 0 ? 1 : 0.15, transition: 'height 0.3s',
            }} />
            {d.label && <span style={{ fontSize: 9, color: COLORS.secondary, whiteSpace: 'nowrap', overflow: 'hidden' }}>{d.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState<string>('today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await dash.metrics(range);
      setData(d);
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Real-time: ricarica i KPI su evento operativo (incasso, chiusura, scorta),
  // con un piccolo debounce per assorbire raffiche di eventi. Polling di
  // sicurezza ridotto a 60s (prima non c'era push).
  const [toast, setToast] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const describe = (ev: DashboardEvent): string => {
      if (ev.kind === 'order.paid') return `Incasso registrato${ev.amountCents ? ` · ${fmtEuro(ev.amountCents)}` : ''}`;
      if (ev.kind === 'session.closed') return `Tavolo chiuso${ev.amountCents ? ` · ${fmtEuro(ev.amountCents)}` : ''}`;
      return `Scorta sotto soglia: ${ev.productName ?? 'prodotto'} (${ev.quantity ?? 0}/${ev.reorderLevel ?? 0})`;
    };
    const unsub = subscribeDashboard((ev) => {
      setToast(describe(ev));
      setTimeout(() => setToast(null), 4000);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => { load(); }, 800);
    });
    const poll = setInterval(load, 60_000);
    return () => { unsub(); clearInterval(poll); if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.secondary }}>Caricamento…</div>;
  if (error) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.danger }}>{error}</div>;
  if (!data) return null;

  const maxRevenue = Math.max(...data.revenueByDay.map(d => d.cents), 1);
  const maxHourly = Math.max(...data.ordersByHour.map(d => d.count), 1);
  const k = data.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 76, right: 24, zIndex: 100,
          background: COLORS.text, color: '#fff', padding: '10px 16px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 320,
        }}>
          <span style={{ marginRight: 8 }}>⚡</span>{toast}
        </div>
      )}
      {/* Range selector */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ display: 'inline-flex', background: '#e8e8ed', borderRadius: 980, padding: 3 }}>
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)} style={{
              border: 'none', borderRadius: 980, padding: '6px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 13,
              background: range === r.id ? '#fff' : 'transparent', color: range === r.id ? COLORS.text : COLORS.secondary,
              boxShadow: range === r.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s',
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <KpiCard label="Ricavo Totale" value={fmtEuro(k.totalRevenueCents)} delta={k.revenueDeltaPct} sub="vs periodo prec." />
        <KpiCard label="Ordini" value={String(k.totalOrders)} delta={k.ordersDeltaPct} sub="vs periodo prec." />
        <KpiCard label="Scontrino Medio" value={fmtEuro(k.avgTicketCents)} />
        <KpiCard label="Coperti" value={String(k.totalGuests)} delta={k.guestsDeltaPct} sub="vs periodo prec." />
        <KpiCard label="Tempo Consegna" value={fmtSec(k.avgDeliverySec)} sub="medio" />
        <KpiCard label="Ricavo Incassato" value={fmtEuro(k.paidRevenueCents)} sub="ordini pagati" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Revenue by day */}
        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: COLORS.text }}>Ricavi per giorno</div>
          {data.revenueByDay.length > 0 ? (
            <MiniBarChart
              data={data.revenueByDay.map(d => ({ label: d.date.slice(5), value: d.cents }))}
              max={maxRevenue}
              format={fmtEuro}
              height={140}
            />
          ) : <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.secondary, fontSize: 14 }}>Nessun dato</div>}
        </div>

        {/* Orders by hour */}
        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: COLORS.text }}>Ordini per ora</div>
          <MiniBarChart
            data={data.ordersByHour.map(d => ({ label: d.hour % 4 === 0 ? `${d.hour}h` : '', value: d.count }))}
            max={maxHourly}
            color={COLORS.success}
            height={140}
            format={v => `${v} ordini`}
          />
        </div>
      </div>

      {/* Top products + Station breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Top products */}
        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: COLORS.text }}>Top 10 prodotti per ricavo</div>
          {data.topProducts.byRevenue.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: COLORS.secondary, padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>#</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: COLORS.secondary, padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>Prodotto</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: COLORS.secondary, padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>Qtà</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: COLORS.secondary, padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>Ricavo</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.byRevenue.map((p, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', color: COLORS.secondary, fontSize: 13 }}>{i + 1}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14, color: COLORS.text }}>{p.name}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.quantity}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmtEuro(p.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ padding: 40, textAlign: 'center', color: COLORS.secondary, fontSize: 14 }}>Nessun ordine nel periodo</div>}
        </div>

        {/* Station breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.stationBreakdown.map(s => (
            <div key={s.station} style={cardStyle}>
              <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>{s.station === 'BAR' ? 'Bar' : 'Tavola Calda'}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(s.revenueCents)}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 13, color: COLORS.secondary }}>
                <span>{s.orderCount} ordini</span>
                <span>{s.itemCount} articoli</span>
              </div>
            </div>
          ))}
          {/* Payment status */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 10 }}>Stati pagamento</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.paymentStatus.map(p => (
                <span key={p.status} style={{
                  borderRadius: 980, padding: '4px 12px', fontSize: 12, fontWeight: 500,
                  background: p.status === 'PAID' ? '#e8f8ed' : p.status === 'SERVED' ? '#fff4e6' : p.status === 'READY' ? '#e8f0ff' : '#f0f0f0',
                  color: p.status === 'PAID' ? COLORS.success : p.status === 'SERVED' ? COLORS.warning : p.status === 'READY' ? COLORS.accent : COLORS.secondary,
                }}>{p.status}: {p.count}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
