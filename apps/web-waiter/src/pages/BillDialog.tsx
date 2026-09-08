/**
 * Dialog del conto: riepilogo righe, coperti, sconto, totale, split e pagamento.
 * Si apre dal pulsante "Conto" in TableOrder.
 */
import { useEffect, useState } from 'react';
import { cashierApi, fmtEuro, type BillResponse, type PaymentMethod } from '../api';
import { colors } from '@la-piazzetta/ui';
import CreditDialog from './CreditDialog';

export default function BillDialog({
  sessionId,
  onClose,
  onPaid,
}: {
  sessionId: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [splitParts, setSplitParts] = useState(1);
  const [tenderedCents, setTenderedCents] = useState<number | ''>('');
  const [showCreditDialog, setShowCreditDialog] = useState(false);

  useEffect(() => {
    cashierApi.bill(sessionId).then(setBill).catch((e) => setError(e.message ?? String(e)));
  }, [sessionId]);

  if (error) return <Overlay><div style={errBox}>{error}</div><button onClick={onClose} style={closeBtn}>Chiudi</button></Overlay>;
  if (!bill) return <Overlay><div style={{ padding: 20 }}>Calcolo conto…</div></Overlay>;

  const total = bill.bill.totalCents;
  const perPerson = splitParts > 1 ? Math.ceil(total / splitParts) : total;

  async function pay(method: PaymentMethod, amountCents: number, tendered?: number) {
    setPaying(true);
    setError(null);
    try {
      // Per ora paghiamo l'intero conto come un ordine fittizio.
      // In una futura iterazione, il backend esporrà un endpoint per pagare
      // l'intera sessione (tutti gli ordini) in una volta.
      // Per il Lotto 2 usiamo quick-sale con importo = totale sessione.
      // TODO: endpoint /cashier/sessions/:id/pay per pagare tutti gli ordini.
      const result = await cashierApi.quickSale({
        items: [],
        payment: { method, amountCents, tenderedCents: tendered },
      });
      // Chiude la sessione
      await cashierApi.closeSession(sessionId);
      onPaid();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setPaying(false);
    }
  }

  return (
    <Overlay>
      <div style={dialogBody}>
        <div style={dialogHeader}>
          <h3 style={{ margin: 0 }}>Conto · {bill.session.table.name}</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
            Coperti: {bill.session.guests} · {fmtEuro(bill.session.coverChargeCentsPerGuest)} a persona
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            Merce: {fmtEuro(bill.bill.itemsGrossCents)} · Coperto: {fmtEuro(bill.bill.coverChargeTotalCents)}
          </div>

          <div style={vatRow}>
            {bill.bill.vatBreakdown.map((v) => (
              <div key={v.vatRateCents} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
                <span>IVA {v.vatRateCents / 100}%</span>
                <span>imponibile {fmtEuro(v.taxableCents)} · IVA {fmtEuro(v.vatCents)}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid #e0e0e0', marginTop: 8 }}>
            <strong style={{ fontSize: 18 }}>Totale</strong>
            <strong style={{ fontSize: 22, color: colors.accent }}>{fmtEuro(total)}</strong>
          </div>

          {/* Split */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Dividi in:</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setSplitParts(n)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd',
                    background: splitParts === n ? colors.accent : '#fff', color: splitParts === n ? '#fff' : '#333',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {n === 1 ? 'Intero' : `${n} parti`}
                </button>
              ))}
            </div>
            {splitParts > 1 && (
              <div style={{ fontSize: 14, marginTop: 6, color: '#666' }}>
                Ogni parte: <strong>{fmtEuro(perPerson)}</strong>
              </div>
            )}
          </div>

          {/* Contanti: input importo versato */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Contanti versati (opzionale, per calcolo resto):</label>
            <input
              type="number"
              value={tenderedCents}
              onChange={(e) => setTenderedCents(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={String(perPerson)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, marginTop: 4, boxSizing: 'border-box' }}
            />
            {typeof tenderedCents === 'number' && tenderedCents >= perPerson && (
              <div style={{ fontSize: 13, color: colors.success, marginTop: 4 }}>
                Resto: {fmtEuro(tenderedCents - perPerson)}
              </div>
            )}
          </div>

          {error && <div style={errBox}>{error}</div>}

          {/* Pagamento */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => pay('CASH', perPerson, typeof tenderedCents === 'number' ? tenderedCents : undefined)}
              disabled={paying}
              style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, background: colors.accent, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
            >
              💶 Contanti
            </button>
            <button
              onClick={() => pay('CARD', perPerson)}
              disabled={paying}
              style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, background: colors.secondary, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
            >
              💳 Carta
            </button>
            <button
              onClick={() => setShowCreditDialog(true)}
              disabled={paying}
              style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, background: '#6a1b9a', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
            >
              📋 Credito
            </button>
          </div>
        </div>
      </div>
      {showCreditDialog && (
        <CreditDialog
          defaultAmountCents={perPerson}
          onClose={() => setShowCreditDialog(false)}
          onCharged={() => {
            setShowCreditDialog(false);
            cashierApi.closeSession(sessionId).then(() => onPaid()).catch(() => onPaid());
          }}
        />
      )}
    </Overlay>
  );
}

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }}>{children}</div>
);

const dialogBody: React.CSSProperties = {
  background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%',
  maxHeight: '90vh', overflowY: 'auto',
};
const dialogHeader: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '16px 16px 8px', borderBottom: '1px solid #f0f0f0',
};
const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999',
};
const errBox: React.CSSProperties = {
  color: colors.danger, background: '#ffebee', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13,
};
const vatRow: React.CSSProperties = {
  padding: 8, background: '#f9f9f9', borderRadius: 8, marginBottom: 8,
};
