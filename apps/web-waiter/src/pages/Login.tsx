import { useEffect, useState } from 'react';
import { listPinUsers, loginPassword, loginPin, type PinUser } from '@la-piazzetta/api-client';

const ROLE_LABEL: Record<string, string> = {
  WAITER: 'Sala', BARMAN: 'Bar', COOK: 'Cucina', CASHIER: 'Cassa', OWNER: 'Titolare', MANAGER: 'Manager',
};

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'password' | 'pin'>('pin'); // PIN: device condiviso in sala
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staff, setStaff] = useState<PinUser[]>([]);
  const [selected, setSelected] = useState<PinUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'pin') listPinUsers().then(setStaff).catch(() => setStaff([]));
  }, [mode]);

  async function doLogin(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'password') await doLogin(() => loginPassword(email, password));
    else if (selected && pin) await doLogin(() => loginPin(selected.id, pin));
  }

  function tapDigit(d: string) {
    if (pin.length < 8) setPin(pin + d);
    setError('');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        fontFamily: 'system-ui',
      }}
    >
      <form
        onSubmit={submit}
        style={{ background: '#fff', borderRadius: 10, padding: 32, width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <img src="/logo.jpg" alt="La Piazzetta" style={{ width: 120, height: 'auto', borderRadius: 8, margin: '0 auto 8px' }} />
        <h1 style={{ fontSize: 18, margin: 0, textAlign: 'center' }}>La Piazzetta · Cameriere</h1>
        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <button type="button" onClick={() => setMode('password')} style={tabStyle(mode === 'password')}>
            Email
          </button>
          <button type="button" onClick={() => setMode('pin')} style={tabStyle(mode === 'pin')}>
            PIN
          </button>
        </div>

        {mode === 'password' ? (
          <>
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </>
        ) : !selected ? (
          /* Passo 1: chi sei? — picker staff (pattern POS: niente testo da digitare) */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {staff.length === 0 && <p style={{ gridColumn: '1/-1', fontSize: 13, color: '#888', textAlign: 'center' }}>Caricamento staff…</p>}
            {staff.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { setSelected(u); setPin(''); setError(''); }}
                style={{
                  padding: '16px 8px', borderRadius: 12, border: '1px solid #e0e0e0', background: '#fafafa',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{
                  width: 48, height: 48, borderRadius: '50%', background: '#1a1a2e', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700,
                }}>
                  {u.name.charAt(0).toUpperCase()}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{u.name}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</span>
              </button>
            ))}
          </div>
        ) : (
          /* Passo 2: PIN — tastierino numerico per tablet condiviso */
          <>
            <button type="button" onClick={() => { setSelected(null); setPin(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, textAlign: 'left', padding: 0 }}>
              ← {selected.name}
            </button>
            <div style={{
              textAlign: 'center', letterSpacing: 10, fontSize: 26, fontWeight: 700, padding: '6px 0',
              minHeight: 34, color: '#1a1a2e',
            }}>
              {'●'.repeat(pin.length)}{'○'.repeat(Math.max(0, 4 - pin.length))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d) => (
                d === '' ? <span key="x" /> : (
                  <button
                    key={d}
                    type="button"
                    onClick={() => (d === '⌫' ? setPin(pin.slice(0, -1)) : tapDigit(d))}
                    style={{
                      padding: '14px 0', borderRadius: 10, border: '1px solid #e0e0e0', background: '#f5f5f7',
                      fontSize: 20, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                )
              ))}
            </div>
          </>
        )}

        {error && <p style={{ color: '#c62828', fontSize: 13, margin: 0 }}>{error}</p>}

        {(mode === 'password' || selected) && (
          <button type="submit" disabled={busy || (mode === 'pin' && !pin)} style={submitStyle}>
            {busy ? 'Accesso…' : 'Accedi'}
          </button>
        )}
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 };
const submitStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 6,
  border: 0,
  background: '#1a1a2e',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};
function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: active ? '#1a1a2e' : '#fff',
    color: active ? '#fff' : '#1a1a2e',
    cursor: 'pointer',
  };
}
