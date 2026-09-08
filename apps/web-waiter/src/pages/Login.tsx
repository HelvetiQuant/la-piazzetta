import { useState } from 'react';
import { loginPassword, loginPin } from '@la-piazzetta/api-client';

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'password' | 'pin'>('pin'); // PIN: device condiviso in sala
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'password') await loginPassword(email, password);
      else await loginPin(userId, pin);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        style={{ background: '#fff', borderRadius: 10, padding: 32, width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}
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
        ) : (
          <>
            <input placeholder="Utente" value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle} />
            <input placeholder="PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} style={inputStyle} />
          </>
        )}

        {error && <p style={{ color: '#c62828', fontSize: 13, margin: 0 }}>{error}</p>}

        <button type="submit" disabled={busy} style={submitStyle}>
          {busy ? 'Accesso…' : 'Accedi'}
        </button>
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
