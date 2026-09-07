import { useState, useEffect, useCallback } from 'react';
import { staff, fmtEuro, type StaffMember, type Shift } from '../api';

const COLORS = {
  bg: '#f5f5f7', card: '#ffffff', text: '#1d1d1f', secondary: '#86868b',
  accent: '#0071e3', success: '#34c759', danger: '#ff3b30', warning: '#ff9500', border: '#d2d2d7',
};

const cardStyle: React.CSSProperties = { background: COLORS.card, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 24 };

const ROLE_LABEL: Record<string, string> = {
  WAITER: 'Cameriere',
  BARMAN: 'Barman',
  COOK: 'Cuoco',
  OWNER: 'Owner',
  MANAGER: 'Manager',
};

const ROLE_ICON: Record<string, string> = {
  WAITER: '🍽️',
  BARMAN: '🍸',
  COOK: '🍳',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtHours(h: number): string {
  return h.toFixed(1) + 'h';
}

export default function StaffShifts() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [clockOutShift, setClockOutShift] = useState<Shift | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [filterUser, setFilterUser] = useState('');
  const [roleSelectFor, setRoleSelectFor] = useState<StaffMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sh] = await Promise.all([
        staff.list(),
        staff.shifts({}),
      ]);
      setStaffList(s);
      setShifts(sh);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startClockIn = (m: StaffMember) => {
    // Se ha solo COOK → clock-in diretto
    if (m.roles.includes('COOK') && !m.roles.includes('WAITER') && !m.roles.includes('BARMAN')) {
      doClockIn(m, 'COOK');
      return;
    }
    // Se ha solo WAITER (no BARMAN) → diretto
    if (m.roles.includes('WAITER') && !m.roles.includes('BARMAN') && !m.roles.includes('COOK')) {
      doClockIn(m, 'WAITER');
      return;
    }
    // Se ha solo BARMAN (no WAITER) → diretto
    if (m.roles.includes('BARMAN') && !m.roles.includes('WAITER') && !m.roles.includes('COOK')) {
      doClockIn(m, 'BARMAN');
      return;
    }
    // Altrimenti mostra modal selezione ruolo
    setRoleSelectFor(m);
    setSelectedRole('');
  };

  const doClockIn = async (m: StaffMember, role: string) => {
    try {
      await staff.clockIn(m.id, role);
      setRoleSelectFor(null);
      await load();
    } catch (e: any) { alert(e.message ?? 'Errore'); }
  };

  const doClockOut = async () => {
    if (!clockOutShift) return;
    try {
      await staff.clockOut(clockOutShift.id, breakMinutes);
      setClockOutShift(null);
      setBreakMinutes(0);
      await load();
    } catch (e: any) { alert(e.message ?? 'Errore'); }
  };

  const doDelete = async (id: string) => {
    if (!confirm('Eliminare questo turno?')) return;
    try { await staff.deleteShift(id); await load(); } catch (e: any) { alert(e.message ?? 'Errore'); }
  };

  const openShifts = shifts.filter(s => s.status === 'OPEN');
  const closedShifts = shifts.filter(s => s.status === 'CLOSED');
  const filtered = filterUser ? closedShifts.filter(s => s.userId === filterUser) : closedShifts;

  // Raggruppa staff per categoria
  const cooks = staffList.filter(m => m.roles.includes('COOK') && !m.roles.includes('WAITER') && !m.roles.includes('BARMAN'));
  const flexible = staffList.filter(m => m.roles.includes('WAITER') || m.roles.includes('BARMAN'));
  const others = staffList.filter(m => !m.roles.includes('COOK') && !m.roles.includes('WAITER') && !m.roles.includes('BARMAN'));

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.secondary }}>Caricamento…</div>;

  function renderStaffCard(m: StaffMember) {
    const hasOpen = openShifts.some(s => s.userId === m.id);
    const openShift = openShifts.find(s => s.userId === m.id);
    const isFlexible = m.roles.includes('WAITER') && m.roles.includes('BARMAN');
    return (
      <div key={m.id} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: 12, background: hasOpen ? '#e8f8ed' : '#f5f5f7',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{m.name}</div>
          <div style={{ fontSize: 12, color: COLORS.secondary }}>
            {isFlexible ? '🍽️ Cameriere / 🍸 Barman' : m.roles.map(r => ROLE_LABEL[r] ?? r).join(', ')}
          </div>
          {openShift?.shiftRole && (
            <div style={{ fontSize: 11, color: COLORS.success, fontWeight: 600, marginTop: 2 }}>
              {ROLE_ICON[openShift.shiftRole] ?? ''} {ROLE_LABEL[openShift.shiftRole] ?? openShift.shiftRole}
            </div>
          )}
        </div>
        <button
          onClick={() => startClockIn(m)}
          disabled={hasOpen}
          style={{
            borderRadius: 980, padding: '6px 14px', fontSize: 13, fontWeight: 500,
            cursor: hasOpen ? 'not-allowed' : 'pointer', border: 'none',
            background: hasOpen ? '#e8e8ed' : COLORS.success, color: hasOpen ? COLORS.secondary : '#fff',
          }}
        >
          {hasOpen ? 'In turno' : isFlexible ? 'Entra…' : 'Entra'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Clock-in section */}
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: COLORS.text }}>Entrata (Clock-in)</div>

        {/* Cucina */}
        {cooks.length > 0 && (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.secondary, marginBottom: 8, marginTop: 4 }}>🍳 Cucina</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              {cooks.map(renderStaffCard)}
            </div>
          </>
        )}

        {/* Camerieri / Barman */}
        {flexible.length > 0 && (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.secondary, marginBottom: 8 }}>🍽️🍸 Camerieri & Barman</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              {flexible.map(renderStaffCard)}
            </div>
          </>
        )}

        {/* Altri */}
        {others.length > 0 && (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.secondary, marginBottom: 8 }}>Altri</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {others.map(renderStaffCard)}
            </div>
          </>
        )}
      </div>

      {/* Open shifts */}
      {openShifts.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: COLORS.text }}>Turni aperti ({openShifts.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openShifts.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 12, background: '#e8f8ed',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>
                    {s.user?.name ?? '—'}
                    {s.shiftRole && (
                      <span style={{
                        marginLeft: 8, fontSize: 12, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 8,
                        background: s.shiftRole === 'BARMAN' ? '#fff3e0' : s.shiftRole === 'COOK' ? '#fce4ec' : '#e3f2fd',
                        color: s.shiftRole === 'BARMAN' ? '#e65100' : s.shiftRole === 'COOK' ? '#c62828' : '#1565c0',
                      }}>
                        {ROLE_ICON[s.shiftRole] ?? ''} {ROLE_LABEL[s.shiftRole] ?? s.shiftRole}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.secondary }}>Iniziato: {fmtTime(s.startedAt)}</div>
                </div>
                <button onClick={() => setClockOutShift(s)} style={{
                  borderRadius: 980, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
                  background: COLORS.danger, color: '#fff',
                }}>Esci</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closed shifts */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.text }}>Storico turni</div>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{
            borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: '8px 12px', fontSize: 14,
          }}>
            <option value="">Tutti</option>
            {staffList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.slice(0, 20).map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderRadius: 10, background: '#f5f5f7',
            }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {s.user?.name ?? s.userId}
                  {s.shiftRole && <span style={{ marginLeft: 6, fontSize: 12, color: COLORS.secondary }}>({ROLE_LABEL[s.shiftRole] ?? s.shiftRole})</span>}
                </span>
                <span style={{ fontSize: 12, color: COLORS.secondary, marginLeft: 8 }}>
                  {fmtTime(s.startedAt)} → {s.endedAt ? fmtTime(s.endedAt) : '…'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtHours(s.hoursWorked)}</span>
                <span style={{ fontSize: 13, color: COLORS.success, fontWeight: 600 }}>{fmtEuro(s.payCents)}</span>
                <button onClick={() => doDelete(s.id)} style={{
                  borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.danger,
                }}>Elimina</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: COLORS.secondary, fontSize: 14 }}>Nessun turno chiuso.</div>}
        </div>
      </div>

      {/* Role selection modal */}
      {roleSelectFor && (
        <div onClick={() => setRoleSelectFor(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, padding: 28, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👋</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{roleSelectFor.name}</div>
              <div style={{ fontSize: 14, color: COLORS.secondary, marginTop: 4 }}>Seleziona il ruolo per questo turno</div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {roleSelectFor.roles.includes('WAITER') && (
                <button
                  onClick={() => setSelectedRole('WAITER')}
                  style={{
                    flex: 1, padding: '20px 12px', borderRadius: 16, cursor: 'pointer',
                    border: selectedRole === 'WAITER' ? `3px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
                    background: selectedRole === 'WAITER' ? '#e3f2fd' : '#fff',
                  }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🍽️</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Cameriere</div>
                  <div style={{ fontSize: 12, color: COLORS.secondary, marginTop: 2 }}>Servizio ai tavoli</div>
                </button>
              )}
              {roleSelectFor.roles.includes('BARMAN') && (
                <button
                  onClick={() => setSelectedRole('BARMAN')}
                  style={{
                    flex: 1, padding: '20px 12px', borderRadius: 16, cursor: 'pointer',
                    border: selectedRole === 'BARMAN' ? `3px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
                    background: selectedRole === 'BARMAN' ? '#fff3e0' : '#fff',
                  }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🍸</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Barman</div>
                  <div style={{ fontSize: 12, color: COLORS.secondary, marginTop: 2 }}>Preparazione al bar</div>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setRoleSelectFor(null)} style={{
                flex: 1, borderRadius: 14, padding: '12px', fontSize: 15, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.text,
              }}>Annulla</button>
              <button
                onClick={() => selectedRole && doClockIn(roleSelectFor, selectedRole)}
                disabled={!selectedRole}
                style={{
                  flex: 1, borderRadius: 14, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  border: 'none',
                  background: selectedRole ? COLORS.success : '#e8e8ed',
                  color: selectedRole ? '#fff' : COLORS.secondary,
                }}
              >Conferma entrata</button>
            </div>
          </div>
        </div>
      )}

      {/* Clock-out modal */}
      {clockOutShift && (
        <div onClick={() => setClockOutShift(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, padding: 28, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: COLORS.text }}>
              Chiudi turno — {clockOutShift.user?.name ?? '—'}
              {clockOutShift.shiftRole && (
                <span style={{ marginLeft: 8, fontSize: 13, color: COLORS.secondary }}>
                  ({ROLE_LABEL[clockOutShift.shiftRole] ?? clockOutShift.shiftRole})
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, color: COLORS.secondary, marginBottom: 20 }}>Iniziato: {fmtTime(clockOutShift.startedAt)}</div>
            <label style={{ fontSize: 13, color: COLORS.secondary, display: 'block', marginBottom: 6 }}>Pausa (minuti)</label>
            <input type="number" value={breakMinutes} onChange={e => setBreakMinutes(Number(e.target.value))} min={0}
              style={{ width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setClockOutShift(null)} style={{
                flex: 1, borderRadius: 14, padding: '12px', fontSize: 15, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.text,
              }}>Annulla</button>
              <button onClick={doClockOut} style={{
                flex: 1, borderRadius: 14, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                border: 'none', background: COLORS.danger, color: '#fff',
              }}>Conferma uscita</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
