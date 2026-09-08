import { useState, useEffect } from 'react';
import { shiftApi, type MyShift } from '../api';
import { currentUser } from '@la-piazzetta/api-client';

const ROLE_LABEL: Record<string, string> = {
  WAITER: 'Cameriere',
  BARMAN: 'Barman',
  COOK: 'Cuoco',
};

const ROLE_ICON: Record<string, string> = {
  WAITER: '🍽️',
  BARMAN: '🍸',
  COOK: '🍳',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ClockIn({ onEnterShift }: { onEnterShift?: () => void }) {
  const user = currentUser();
  const [shift, setShift] = useState<MyShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [clockingIn, setClockingIn] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [error, setError] = useState('');

  async function loadShift() {
    try {
      const s = await shiftApi.myShift();
      setShift(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShift();
    const t = setInterval(loadShift, 30000); // aggiorna durata
    return () => clearInterval(t);
  }, []);

  // Determina quali ruoli può scegliere
  const roles = user?.roles ?? [];
  const isCook = roles.includes('COOK') && !roles.includes('WAITER') && !roles.includes('BARMAN');
  const isFlexible = roles.includes('WAITER') && roles.includes('BARMAN');
  const isWaiterOnly = roles.includes('WAITER') && !roles.includes('BARMAN') && !roles.includes('COOK');
  const isBarmanOnly = roles.includes('BARMAN') && !roles.includes('WAITER') && !roles.includes('COOK');

  async function doClockIn(role: string) {
    setClockingIn(true);
    setError('');
    try {
      const s = await shiftApi.clockIn(role);
      setShift(s);
      setShowRoleSelect(false);
      if (onEnterShift) onEnterShift();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClockingIn(false);
    }
  }

  function handleEnter() {
    if (isCook) { doClockIn('COOK'); return; }
    if (isWaiterOnly) { doClockIn('WAITER'); return; }
    if (isBarmanOnly) { doClockIn('BARMAN'); return; }
    // Flessibile → mostra selezione
    setShowRoleSelect(true);
  }

  async function doClockOut() {
    setClockingIn(true);
    try {
      await shiftApi.clockOut(breakMinutes);
      setShift(null);
      setShowClockOut(false);
      setBreakMinutes(0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClockingIn(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Caricamento…</div>;
  }

  // Se ha un turno aperto → mostra stato turno
  if (shift && shift.status === 'OPEN') {
    return (
      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        <div style={{
          background: 'linear-gradient(135deg, #34c759 0%, #248a3d 100%)',
          borderRadius: 20, padding: 28, color: '#fff', textAlign: 'center',
          boxShadow: '0 8px 32px rgba(52,199,89,0.3)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {ROLE_ICON[shift.shiftRole ?? ''] ?? '✅'}
          </div>
          <div style={{ fontSize: 14, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1 }}>
            Sei in turno
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
            {ROLE_LABEL[shift.shiftRole ?? ''] ?? shift.shiftRole}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDuration(shift.startedAt)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
            Iniziato alle {fmtTime(shift.startedAt)}
          </div>
          <button
            onClick={() => setShowClockOut(true)}
            style={{
              marginTop: 20, borderRadius: 14, padding: '14px 32px', fontSize: 16, fontWeight: 700,
              border: '2px solid #fff', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
            }}
          >
            🏁 Esci (Clock-out)
          </button>
        </div>
        {error && <div style={{ color: '#ff3b30', textAlign: 'center', marginTop: 12, fontSize: 14 }}>{error}</div>}
      </div>
    );
  }

  // Nessun turno aperto → mostra pulsante entrata
  return (
    <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32, textAlign: 'center',
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>👋</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{user?.userId ? `Ciao, ${user.userId}` : 'Benvenuto'}</div>
        <div style={{ fontSize: 14, color: '#86868b', marginTop: 4, marginBottom: 24 }}>
          {isFlexible ? 'Seleziona il tuo ruolo per iniziare il turno' :
           isCook ? 'Pronto per il turno in cucina?' :
           isWaiterOnly ? 'Pronto per il turno come cameriere?' :
           isBarmanOnly ? 'Pronto per il turno al bar?' :
           'Pronto per iniziare?'}
        </div>

        {isFlexible ? (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => setSelectedRole('WAITER')}
              style={{
                flex: 1, padding: '24px 12px', borderRadius: 16, cursor: 'pointer',
                border: selectedRole === 'WAITER' ? '3px solid #0071e3' : '1px solid #d2d2d7',
                background: selectedRole === 'WAITER' ? '#e3f2fd' : '#fff',
              }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>🍽️</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Cameriere</div>
              <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>Servizio ai tavoli</div>
            </button>
            <button
              onClick={() => setSelectedRole('BARMAN')}
              style={{
                flex: 1, padding: '24px 12px', borderRadius: 16, cursor: 'pointer',
                border: selectedRole === 'BARMAN' ? '3px solid #ff9500' : '1px solid #d2d2d7',
                background: selectedRole === 'BARMAN' ? '#fff3e0' : '#fff',
              }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>🍸</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Barman</div>
              <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>Preparazione al bar</div>
            </button>
          </div>
        ) : null}

        <button
          onClick={() => isFlexible ? (selectedRole && doClockIn(selectedRole)) : handleEnter()}
          disabled={isFlexible && !selectedRole}
          style={{
            width: '100%', borderRadius: 16, padding: '16px 0', fontSize: 18, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: (isFlexible && !selectedRole) ? '#e8e8ed' : '#34c759',
            color: (isFlexible && !selectedRole) ? '#86868b' : '#fff',
          }}
        >
          {clockingIn ? 'Entrata in corso…' : '🟢 Entra in turno'}
        </button>

        {error && <div style={{ color: '#ff3b30', marginTop: 12, fontSize: 14 }}>{error}</div>}
      </div>

      {/* Clock-out modal */}
      {showClockOut && (
        <div onClick={() => setShowClockOut(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, padding: 28, width: 360,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Chiudi turno</div>
            <div style={{ fontSize: 14, color: '#86868b', marginBottom: 20 }}>
              {(shift && ROLE_LABEL[shift.shiftRole ?? '']) ?? ''} · iniziato alle {shift && fmtTime(shift.startedAt)}
            </div>
            <label style={{ fontSize: 13, color: '#86868b', display: 'block', marginBottom: 6 }}>Pausa (minuti)</label>
            <input
              type="number" value={breakMinutes} onChange={e => setBreakMinutes(Number(e.target.value))} min={0}
              style={{
                width: '100%', borderRadius: 12, border: '1px solid #d2d2d7', padding: '12px 14px',
                fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 20,
              }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowClockOut(false)} style={{
                flex: 1, borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f',
              }}>Annulla</button>
              <button onClick={doClockOut} disabled={clockingIn} style={{
                flex: 1, borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                border: 'none', background: '#ff3b30', color: '#fff',
              }}>{clockingIn ? 'Uscita…' : 'Conferma uscita'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
