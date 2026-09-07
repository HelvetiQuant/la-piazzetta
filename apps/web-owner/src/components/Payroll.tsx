import { useState, useEffect, useCallback } from 'react';
import { staff, fmtEuro, type StaffMember, type PayrollEntry, type PayrollSummary } from '../api';

const COLORS = {
  bg: '#f5f5f7', card: '#ffffff', text: '#1d1d1f', secondary: '#86868b',
  accent: '#0071e3', success: '#34c759', danger: '#ff3b30', warning: '#ff9500', border: '#d2d2d7',
};

const cardStyle: React.CSSProperties = { background: COLORS.card, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 24 };

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: '#f0f0f0', color: COLORS.secondary },
  APPROVED: { bg: '#e8f0ff', color: COLORS.accent },
  PAID: { bg: '#e8f8ed', color: COLORS.success },
};

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Bozza', APPROVED: 'Approvato', PAID: 'Pagato' };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number): string { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

export default function Payroll() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState<StaffMember | null>(null);
  const [rateValue, setRateValue] = useState(0);

  // Calculate form
  const [calcUser, setCalcUser] = useState('');
  const [calcFrom, setCalcFrom] = useState(daysAgoISO(14));
  const [calcTo, setCalcTo] = useState(todayISO());
  const [calcBonus, setCalcBonus] = useState(0);
  const [calcDeduction, setCalcDeduction] = useState(0);
  const [calcLoading, setCalcLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e, sum] = await Promise.all([
        staff.list(),
        staff.payroll({}),
        staff.payrollSummary({}),
      ]);
      setStaffList(s);
      setEntries(e);
      setSummary(sum);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doCalculate = async () => {
    if (!calcUser) return;
    setCalcLoading(true);
    try {
      await staff.calculatePayroll({
        userId: calcUser,
        periodStart: new Date(calcFrom).toISOString(),
        periodEnd: new Date(calcTo).toISOString(),
        bonusCents: calcBonus,
        deductionCents: calcDeduction,
      });
      await load();
    } catch (e: any) { alert(e.message ?? 'Errore'); } finally { setCalcLoading(false); }
  };

  const updateStatus = async (id: string, status: 'DRAFT' | 'APPROVED' | 'PAID') => {
    try { await staff.updatePayroll(id, { status }); await load(); } catch (e: any) { alert(e.message ?? 'Errore'); }
  };

  const saveRate = async () => {
    if (!editingRate) return;
    try { await staff.setRate(editingRate.id, rateValue); setEditingRate(null); await load(); } catch (e: any) { alert(e.message ?? 'Errore'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.secondary }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>Totale Lordo</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLORS.text }}>{fmtEuro(summary.totalGrossCents)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>Totale Netto</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLORS.text }}>{fmtEuro(summary.totalNetCents)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>Ore totali</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLORS.text }}>{summary.totalHours.toFixed(1)}h</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>Bonus</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLORS.success }}>{fmtEuro(summary.totalBonusCents)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 6 }}>Deduzioni</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLORS.danger }}>{fmtEuro(summary.totalDeductionsCents)}</div>
          </div>
        </div>
      )}

      {/* Hourly rates */}
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: COLORS.text }}>Tariffe orarie dipendenti</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {staffList.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, background: '#f5f5f7' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{m.name}</div>
                <div style={{ fontSize: 12, color: COLORS.secondary }}>{m.roles.join(', ')}</div>
              </div>
              <button onClick={() => { setEditingRate(m); setRateValue(m.hourlyRateCents); }} style={{
                borderRadius: 980, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: `1px solid ${COLORS.border}`,
                background: '#fff', color: COLORS.text, fontVariantNumeric: 'tabular-nums',
              }}>{fmtEuro(m.hourlyRateCents)}/h</button>
            </div>
          ))}
        </div>
      </div>

      {/* Calculate payroll */}
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: COLORS.text }}>Calcola stipendio</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 13, color: COLORS.secondary, display: 'block', marginBottom: 6 }}>Dipendente</label>
            <select value={calcUser} onChange={e => setCalcUser(e.target.value)} style={{ width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '8px 12px', fontSize: 14, background: '#fff', boxSizing: 'border-box' }}>
              <option value="">Seleziona…</option>
              {staffList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: COLORS.secondary, display: 'block', marginBottom: 6 }}>Dal</label>
            <input type="date" value={calcFrom} onChange={e => setCalcFrom(e.target.value)} style={{ width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: COLORS.secondary, display: 'block', marginBottom: 6 }}>Al</label>
            <input type="date" value={calcTo} onChange={e => setCalcTo(e.target.value)} style={{ width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: COLORS.secondary, display: 'block', marginBottom: 6 }}>Bonus (€)</label>
            <input type="number" value={calcBonus / 100} onChange={e => setCalcBonus(Math.round(Number(e.target.value) * 100))} min={0} style={{ width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <button onClick={doCalculate} disabled={!calcUser || calcLoading} style={{
            borderRadius: 980, padding: '10px 20px', fontSize: 15, fontWeight: 500, cursor: calcLoading ? 'wait' : 'pointer', border: 'none',
            background: !calcUser || calcLoading ? '#b0b0b5' : COLORS.accent, color: '#fff',
          }}>{calcLoading ? 'Calcolo…' : 'Calcola'}</button>
        </div>
      </div>

      {/* Payroll entries */}
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: COLORS.text }}>Voci stipendio ({entries.length})</div>
        {entries.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Dipendente', 'Periodo', 'Ore', 'Tariffa', 'Base', 'Bonus', 'Deduz.', 'Netto', 'Stato', 'Azioni'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Azioni' || h === 'Netto' || h === 'Deduz.' || h === 'Bonus' || h === 'Base' || h === 'Tariffa' ? 'right' : 'left', fontSize: 12, color: COLORS.secondary, padding: '8px 0', borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const sc = STATUS_COLORS[e.status] ?? STATUS_COLORS.DRAFT;
                return (
                  <tr key={e.id}>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>{e.user.name}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14, color: COLORS.secondary }}>{fmtDate(e.periodStart)} - {fmtDate(e.periodEnd)}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{e.totalHours.toFixed(1)}h</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, color: COLORS.secondary, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(e.hourlyRateCents)}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(e.basePayCents)}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, color: COLORS.success, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(e.bonusCents)}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, color: COLORS.danger, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(e.deductionCents)}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(e.netPayCents)}</td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ borderRadius: 980, padding: '3px 10px', fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color }}>{STATUS_LABELS[e.status] ?? e.status}</span>
                    </td>
                    <td style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                      {e.status === 'DRAFT' && <button onClick={() => updateStatus(e.id, 'APPROVED')} style={{ border: 'none', background: 'transparent', color: COLORS.accent, cursor: 'pointer', fontSize: 13, marginRight: 8 }}>Approva</button>}
                      {e.status === 'APPROVED' && <button onClick={() => updateStatus(e.id, 'PAID')} style={{ border: 'none', background: 'transparent', color: COLORS.success, cursor: 'pointer', fontSize: 13 }}>Segna pagato</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div style={{ padding: 40, textAlign: 'center', color: COLORS.secondary, fontSize: 14 }}>Nessuna voce stipendio. Calcola il primo stipendio sopra.</div>}
      </div>

      {/* Edit rate modal */}
      {editingRate && (
        <div onClick={() => setEditingRate(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 28, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: COLORS.text }}>Tariffa oraria — {editingRate.name}</div>
            <div style={{ fontSize: 14, color: COLORS.secondary, marginBottom: 20 }}>Inserisci la paga oraria in euro</div>
            <input type="number" value={rateValue / 100} onChange={e => setRateValue(Math.round(Number(e.target.value) * 100))} min={0} step={0.5} style={{ width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setEditingRate(null)} style={{ flex: 1, borderRadius: 980, padding: '10px', fontSize: 15, fontWeight: 500, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.text }}>Annulla</button>
              <button onClick={saveRate} style={{ flex: 1, borderRadius: 980, padding: '10px', fontSize: 15, fontWeight: 500, cursor: 'pointer', border: 'none', background: COLORS.accent, color: '#fff' }}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
