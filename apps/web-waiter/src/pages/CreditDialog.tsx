/**
 * Dialog per registrare una consumazione a credito.
 * Usato sia in Modalità Banco (Counter) che in Sala (TableOrder/BillDialog).
 *
 * Flusso:
 * 1. Inserisci telefono → cerca cliente esistente
 * 2. Se esiste: mostra nome e saldo, precompila
 * 3. Se non esiste: inserisci nome e cognome
 * 4. Inserisci importo → conferma
 */
import { useState } from 'react';
import { creditApi, fmtEuro, type CreditCustomer } from '../api';
import { colors } from '@la-piazzetta/ui';

export default function CreditDialog({
  defaultAmountCents,
  onClose,
  onCharged,
}: {
  defaultAmountCents?: number;
  onClose: () => void;
  onCharged?: (customer: CreditCustomer) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [amountCents, setAmountCents] = useState<number | ''>(defaultAmountCents ?? '');
  const [note, setNote] = useState('');
  const [found, setFound] = useState<CreditCustomer | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; balance: number } | null>(null);

  async function lookup() {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await creditApi.lookup(phone.trim());
      setFound(result.customer);
      setSearched(true);
      if (result.customer) {
        setName(result.customer.name);
        setSurname(result.customer.surname ?? '');
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function charge() {
    const amount = typeof amountCents === 'number' ? amountCents : 0;
    if (amount <= 0) { setError('Importo obbligatorio'); return; }
    if (!phone.trim()) { setError('Telefono obbligatorio'); return; }
    if (!found && !name.trim()) { setError('Nome obbligatorio per nuovo cliente'); return; }

    setLoading(true);
    setError(null);
    try {
      const result = await creditApi.staffCharge({
        name: name.trim(),
        surname: surname.trim() || undefined,
        phone: phone.trim(),
        amountCents: amount,
        note: note.trim() || undefined,
      });
      setSuccess({ name: `${result.customer.name} ${result.customer.surname ?? ''}`.trim(), balance: result.customer.balanceCents });
      onCharged?.(result.customer);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, maxWidth: 420, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 8px', borderBottom: '1px solid #f0f0f0' }}>
          <h3 style={{ margin: 0 }}>📋 Consumazione a credito</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                Credito registrato per {success.name}
              </div>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
                Nuovo saldo: <strong style={{ color: success.balance > 0 ? colors.danger : colors.success }}>{fmtEuro(success.balance)}</strong>
              </div>
              <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: colors.accent, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Chiudi
              </button>
            </div>
          ) : (
            <>
              {error && <div style={{ background: '#ffebee', color: colors.danger, padding: 10, borderRadius: 8, fontSize: 14 }}>{error}</div>}

              {/* Telefono con lookup */}
              <div>
                <label style={labelStyle}>Telefono cliente *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setFound(null); setSearched(false); }}
                    placeholder="es. 333 1234567"
                    style={{ flex: 1, ...inputStyle }}
                  />
                  <button
                    onClick={lookup}
                    disabled={loading || !phone.trim()}
                    style={{ padding: '0 16px', borderRadius: 10, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Cerca
                  </button>
                </div>
              </div>

              {/* Cliente trovato */}
              {found && (
                <div style={{ background: '#e8f5e9', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    ✓ {found.name} {found.surname ?? ''}
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    Saldo attuale: <strong style={{ color: found.balanceCents > 0 ? colors.danger : colors.success }}>
                      {fmtEuro(found.balanceCents)}
                    </strong>
                    {found.limitCents > 0 && ` · fido ${fmtEuro(found.limitCents)}`}
                  </div>
                </div>
              )}

              {/* Nome (se nuovo cliente) */}
              {!found && (
                <>
                  <div>
                    <label style={labelStyle}>Nome *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nome del cliente"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cognome</label>
                    <input
                      type="text"
                      value={surname}
                      onChange={(e) => setSurname(e.target.value)}
                      placeholder="Cognome"
                      style={inputStyle}
                    />
                  </div>
                </>
              )}

              {/* Importo */}
              <div>
                <label style={labelStyle}>Importo (€) *</label>
                <input
                  type="number"
                  value={amountCents === '' ? '' : amountCents / 100}
                  onChange={(e) => setAmountCents(e.target.value === '' ? '' : Math.round(Number(e.target.value) * 100))}
                  placeholder="es. 15.50"
                  step="0.50"
                  style={inputStyle}
                />
              </div>

              {/* Nota opzionale */}
              <div>
                <label style={labelStyle}>Nota (opzionale)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="es. 2 caffè + 1 cornetto"
                  style={inputStyle}
                />
              </div>

              <button
                onClick={charge}
                disabled={loading}
                style={{
                  padding: '14px', fontSize: 16, fontWeight: 700,
                  background: colors.accent, color: '#fff', border: 'none',
                  borderRadius: 12, cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Registrazione…' : 'Registra a credito'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#555' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd',
  fontSize: 15, boxSizing: 'border-box',
};
