import { useState } from 'react';
import { setup } from '../api';

/**
 * Wizard di primo avvio: crea il locale e l'utente proprietario a partire da un
 * token monouso generato da CLI (`npm run provision:token`). Sostituisce la
 * creazione manuale del primo OWNER da Prisma Studio.
 */
export default function Setup({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [venueName, setVenueName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (ownerPassword.length < 8) { setError('La password deve avere almeno 8 caratteri.'); return; }
    if (ownerPassword !== confirm) { setError('Le due password non coincidono.'); return; }
    setBusy(true);
    try {
      const res = await setup.provision({ token: token.trim(), venueName, ownerName, ownerEmail, ownerPassword });
      setDone(res.note ?? 'Locale configurato. Ora puoi accedere.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', fontFamily: 'system-ui', padding: 16 }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 12, padding: 32, width: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <img src="/logo.jpg" alt="La Piazzetta" style={{ width: 96, height: 'auto', borderRadius: 8, margin: '0 auto 4px' }} />
        <h1 style={{ fontSize: 18, margin: 0, textAlign: 'center' }}>Primo avvio · Configura il locale</h1>
        <p style={{ fontSize: 13, color: '#666', margin: 0, textAlign: 'center' }}>
          Serve il token di provisioning generato dal terminale.
        </p>

        {done ? (
          <>
            <div style={{ background: '#e8f5e9', color: '#1b5e20', borderRadius: 8, padding: 12, fontSize: 13 }}>✓ {done}</div>
            <button type="button" onClick={onDone} style={submitStyle}>Vai al login</button>
          </>
        ) : (
          <>
            <input placeholder="Token di provisioning" value={token} onChange={(e) => setToken(e.target.value)} style={inputStyle} required />
            <input placeholder="Nome del locale" value={venueName} onChange={(e) => setVenueName(e.target.value)} style={inputStyle} required />
            <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '4px 0' }} />
            <input placeholder="Nome proprietario" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} style={inputStyle} required />
            <input placeholder="Email proprietario" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} style={inputStyle} required />
            <input placeholder="Password (min 8 caratteri)" type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} style={inputStyle} required />
            <input placeholder="Conferma password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} required />

            {error && <p style={{ color: '#c62828', fontSize: 13, margin: 0 }}>{error}</p>}

            <button type="submit" disabled={busy} style={submitStyle}>
              {busy ? 'Configurazione…' : 'Crea locale e proprietario'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 };
const submitStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 6, border: 0, background: '#1a1a2e', color: '#fff', fontWeight: 600, cursor: 'pointer' };
