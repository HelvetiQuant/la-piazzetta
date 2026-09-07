import { useState, useEffect, useCallback } from 'react';
import { staff, schedule, fmtEuro, type StaffMember, type ScheduledShift, type AvailabilitySlot, type AIShiftSuggestion } from '../api';

const COLORS = {
  bg: '#f5f5f7', card: '#ffffff', text: '#1d1d1f', secondary: '#86868b',
  accent: '#0071e3', success: '#34c759', danger: '#ff3b30', warning: '#ff9500', border: '#d2d2d7',
};

const cardStyle: React.CSSProperties = { background: COLORS.card, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 24 };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const STATION_COLORS: Record<string, string> = {
  BAR: '#0071e3', TAVOLA_CALDA: '#ff9500', GENERALE: '#34c759',
};

function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtDate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export default function StaffSchedule() {
  const [tab, setTab] = useState<'schedule' | 'availability' | 'ai'>('schedule');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<ScheduledShift[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [weekStart_, setWeekStart_] = useState(weekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState<AIShiftSuggestion[]>([]);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Coverage config for AI
  const [coverage, setCoverage] = useState([
    { dayOfWeek: 1, slots: [{ startHour: 8, endHour: 16, minStaff: 2, station: 'BAR' }] },
    { dayOfWeek: 2, slots: [{ startHour: 8, endHour: 16, minStaff: 2, station: 'BAR' }] },
    { dayOfWeek: 3, slots: [{ startHour: 8, endHour: 16, minStaff: 2, station: 'BAR' }] },
    { dayOfWeek: 4, slots: [{ startHour: 8, endHour: 16, minStaff: 2, station: 'BAR' }] },
    { dayOfWeek: 5, slots: [{ startHour: 8, endHour: 16, minStaff: 2, station: 'BAR' }, { startHour: 18, endHour: 23, minStaff: 3, station: 'BAR' }] },
    { dayOfWeek: 6, slots: [{ startHour: 10, endHour: 23, minStaff: 3, station: 'BAR' }] },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sh, av] = await Promise.all([
        staff.list(),
        schedule.list(fmtDate(weekStart_), fmtDate(addDays(weekStart_, 7))),
        schedule.availability(),
      ]);
      setStaffList(s);
      setShifts(sh);
      setAvailability(av);
    } catch {} finally { setLoading(false); }
  }, [weekStart_]);

  useEffect(() => { load(); }, [load]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart_, i));

  const shiftsByDayUser = (day: Date, userId: string) =>
    shifts.filter(s => s.date.slice(0, 10) === fmtDate(day) && s.userId === userId);

  const doAiOptimize = async () => {
    setAiLoading(true);
    try {
      const r = await schedule.aiOptimize({
        weekStart: fmtDate(weekStart_),
        coverage,
        constraints: { maxHoursPerWeek: 40, minRestBetweenShifts: 11 },
      });
      setAiSuggestions(r.suggestions);
      setAiApplied(r.aiApplied);
    } catch (e: any) { alert(e.message ?? 'Errore AI'); } finally { setAiLoading(false); }
  };

  const doApply = async () => {
    if (aiSuggestions.length === 0) return;
    try {
      await schedule.apply(aiSuggestions.map(s => ({
        userId: s.userId, date: s.date, startHour: s.startHour, endHour: s.endHour, station: s.station,
      })));
      setAiSuggestions([]);
      await load();
      alert('Turni applicati!');
    } catch (e: any) { alert(e.message ?? 'Errore'); }
  };

  const doConfirm = async (id: string) => {
    try { await schedule.confirm(id); await load(); } catch (e: any) { alert(e.message); }
  };
  const doCancel = async (id: string) => {
    try { await schedule.cancel(id); await load(); } catch (e: any) { alert(e.message); }
  };
  const doDelete = async (id: string) => {
    if (!confirm('Eliminare questo turno?')) return;
    try { await schedule.delete(id); await load(); } catch (e: any) { alert(e.message); }
  };

  // Availability editor
  const [editAvailUser, setEditAvailUser] = useState<string>('');
  const [availSlots, setAvailSlots] = useState<Array<{ dayOfWeek: number; startHour: number; endHour: number; preference: string }>>([]);

  const startEditAvail = (userId: string) => {
    setEditAvailUser(userId);
    setAvailSlots(availability.filter(a => a.userId === userId).map(a => ({
      dayOfWeek: a.dayOfWeek, startHour: a.startHour, endHour: a.endHour, preference: a.preference,
    })));
  };

  const saveAvail = async () => {
    if (!editAvailUser) return;
    try { await schedule.setAvailability(editAvailUser, availSlots); setEditAvailUser(''); await load(); }
    catch (e: any) { alert(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.secondary }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { id: 'schedule', label: 'Calendario' },
          { id: 'availability', label: 'Disponibilità' },
          { id: 'ai', label: 'AI Ottimizzazione' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            borderRadius: 980, padding: '6px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: tab === t.id ? COLORS.accent : '#e8e8ed', color: tab === t.id ? '#fff' : COLORS.text,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ===== SCHEDULE VIEW ===== */}
      {tab === 'schedule' && (
        <>
          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setWeekStart_(addDays(weekStart_, -7))} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '8px 16px', cursor: 'pointer', background: '#fff' }}>← Prec</button>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {weekStart_.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} — {addDays(weekStart_, 6).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
            </span>
            <button onClick={() => setWeekStart_(addDays(weekStart_, 7))} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '8px 16px', cursor: 'pointer', background: '#fff' }}>Succ →</button>
          </div>

          {/* Grid: rows=staff, cols=days */}
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: COLORS.secondary, padding: '8px', borderBottom: `1px solid ${COLORS.border}`, width: 120 }}>Dipendente</th>
                  {weekDays.map(d => (
                    <th key={fmtDate(d)} style={{ textAlign: 'center', fontSize: 12, color: COLORS.secondary, padding: '8px', borderBottom: `1px solid ${COLORS.border}` }}>
                      {DAYS[d.getDay()]} {d.getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffList.map(m => (
                  <tr key={m.id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: 13, fontWeight: 500 }}>{m.name}</td>
                    {weekDays.map(d => {
                      const dayShifts = shiftsByDayUser(d, m.id);
                      return (
                        <td key={fmtDate(d)} style={{ padding: '4px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
                          {dayShifts.map(s => (
                            <div key={s.id} style={{
                              borderRadius: 8, padding: '4px 8px', marginBottom: 4, fontSize: 11, fontWeight: 500,
                              background: (STATION_COLORS[s.station ?? ''] ?? COLORS.accent) + '20',
                              color: STATION_COLORS[s.station ?? ''] ?? COLORS.accent,
                              border: `1px solid ${(STATION_COLORS[s.station ?? ''] ?? COLORS.accent) + '40'}`,
                            }}>
                              {s.startHour}:00-{s.endHour}:00
                              {s.aiSuggested && ' ✨'}
                              {s.status === 'CONFIRMED' && ' ✓'}
                              <div style={{ marginTop: 2, display: 'flex', gap: 4 }}>
                                {s.status === 'SCHEDULED' && <button onClick={() => doConfirm(s.id)} style={{ border: 'none', background: 'transparent', color: COLORS.success, cursor: 'pointer', fontSize: 10 }}>Conferma</button>}
                                <button onClick={() => doCancel(s.id)} style={{ border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontSize: 10 }}>Canc</button>
                                <button onClick={() => doDelete(s.id)} style={{ border: 'none', background: 'transparent', color: COLORS.secondary, cursor: 'pointer', fontSize: 10 }}>Del</button>
                              </div>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add shift manually */}
          <AddShiftForm staffList={staffList} weekStart_={weekStart_} onCreated={load} />
        </>
      )}

      {/* ===== AVAILABILITY VIEW ===== */}
      {tab === 'availability' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: COLORS.text }}>Disponibilità dipendenti</div>
          {editAvailUser ? (
            <div>
              <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 500 }}>
                Modifica disponibilità: {staffList.find(s => s.id === editAvailUser)?.name}
              </div>
              {DAYS.map((dayName, dayIdx) => (
                <div key={dayIdx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 40, fontSize: 13, fontWeight: 500 }}>{dayName}</span>
                  {availSlots.filter(s => s.dayOfWeek === dayIdx).map((slot, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f5f5f7', borderRadius: 8, padding: '4px 8px' }}>
                      <input type="number" value={slot.startHour} min={0} max={23} onChange={e => {
                        const updated = [...availSlots];
                        updated[availSlots.indexOf(slot)].startHour = Number(e.target.value);
                        setAvailSlots(updated);
                      }} style={{ width: 40, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '2px 4px', fontSize: 12 }} />
                      <span>-</span>
                      <input type="number" value={slot.endHour} min={1} max={24} onChange={e => {
                        const updated = [...availSlots];
                        updated[availSlots.indexOf(slot)].endHour = Number(e.target.value);
                        setAvailSlots(updated);
                      }} style={{ width: 40, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '2px 4px', fontSize: 12 }} />
                      <select value={slot.preference} onChange={e => {
                        const updated = [...availSlots];
                        updated[availSlots.indexOf(slot)].preference = e.target.value;
                        setAvailSlots(updated);
                      }} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '2px 4px', fontSize: 12 }}>
                        <option value="AVAILABLE">Disponibile</option>
                        <option value="PREFERRED">Preferito</option>
                        <option value="UNAVAILABLE">Non disp.</option>
                      </select>
                      <button onClick={() => setAvailSlots(availSlots.filter(s => s !== slot))} style={{ border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setAvailSlots([...availSlots, { dayOfWeek: dayIdx, startHour: 8, endHour: 16, preference: 'AVAILABLE' }])} style={{
                    border: `1px dashed ${COLORS.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', background: 'transparent', color: COLORS.accent, fontSize: 12,
                  }}>+ Aggiungi</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button onClick={saveAvail} style={{ borderRadius: 980, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', border: 'none', background: COLORS.accent, color: '#fff' }}>Salva</button>
                <button onClick={() => setEditAvailUser('')} style={{ borderRadius: 980, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.text }}>Annulla</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {staffList.map(m => {
                const slots = availability.filter(a => a.userId === m.id);
                return (
                  <div key={m.id} style={{ padding: 16, borderRadius: 12, background: '#f5f5f7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.secondary }}>{m.roles.join(', ')}</div>
                      </div>
                      <button onClick={() => startEditAvail(m.id)} style={{ borderRadius: 980, padding: '4px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1px solid ${COLORS.accent}`, background: '#fff', color: COLORS.accent }}>Modifica</button>
                    </div>
                    {slots.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {slots.map((s, i) => (
                          <span key={i} style={{
                            borderRadius: 6, padding: '2px 8px', fontSize: 11,
                            background: s.preference === 'PREFERRED' ? '#e8f8ed' : s.preference === 'UNAVAILABLE' ? '#fff0f0' : '#e8f0ff',
                            color: s.preference === 'PREFERRED' ? COLORS.success : s.preference === 'UNAVAILABLE' ? COLORS.danger : COLORS.accent,
                          }}>{DAYS[s.dayOfWeek]} {s.startHour}-{s.endHour}</span>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 12, color: COLORS.secondary }}>Nessuna disponibilità impostata</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== AI OPTIMIZATION VIEW ===== */}
      {tab === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: COLORS.text }}>✨ AI Ottimizzazione turni</div>
            <div style={{ fontSize: 14, color: COLORS.secondary, marginBottom: 20 }}>L'AI analizza disponibilità, copertura richiesta e vincoli per generare lo schedule ottimale</div>

            {/* Coverage editor */}
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Copertura richiesta</div>
            {coverage.map((cov, ci) => (
              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 40, fontSize: 13, fontWeight: 500 }}>{DAYS[cov.dayOfWeek]}</span>
                {cov.slots.map((slot, si) => (
                  <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f5f5f7', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}>
                    {slot.startHour}-{slot.endHour}h · {slot.minStaff} pers · {slot.station}
                  </span>
                ))}
              </div>
            ))}

            <button onClick={doAiOptimize} disabled={aiLoading} style={{
              borderRadius: 980, padding: '10px 24px', fontSize: 15, fontWeight: 500, cursor: aiLoading ? 'wait' : 'pointer', border: 'none',
              background: aiLoading ? '#b0b0b5' : COLORS.accent, color: '#fff', marginTop: 16,
            }}>{aiLoading ? 'AI sta elaborando…' : '✨ Genera schedule con AI'}</button>
          </div>

          {/* AI Results */}
          {aiSuggestions.length > 0 && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  Suggerimenti AI ({aiSuggestions.length} turni)
                  {aiApplied && <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.success }}>✓ Generato da AI</span>}
                  {!aiApplied && <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.warning }}>Fallback (AI non disponibile)</span>}
                </div>
                <button onClick={doApply} style={{
                  borderRadius: 980, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', border: 'none', background: COLORS.success, color: '#fff',
                }}>Applica tutti</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Dipendente', 'Giorno', 'Orario', 'Postazione', 'Confidenza', ''].map(h => (
                      <th key={h} style={{ textAlign: h === 'Confidenza' || h === '' ? 'right' : 'left', fontSize: 12, color: COLORS.secondary, padding: '8px 0', borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiSuggestions.map((s, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>{s.userName}</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14, color: COLORS.secondary }}>{new Date(s.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>{s.startHour}:00 - {s.endHour}:00</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>
                        <span style={{ borderRadius: 6, padding: '2px 8px', fontSize: 11, background: (STATION_COLORS[s.station ?? ''] ?? COLORS.accent) + '20', color: STATION_COLORS[s.station ?? ''] ?? COLORS.accent }}>{s.station ?? '—'}</span>
                      </td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.confidence * 100)}%</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                        <button onClick={() => setAiSuggestions(aiSuggestions.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontSize: 13 }}>Rimuovi</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddShiftForm({ staffList, weekStart_, onCreated }: { staffList: StaffMember[]; weekStart_: Date; onCreated: () => void }) {
  const [userId, setUserId] = useState('');
  const [day, setDay] = useState(1);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(16);
  const [station, setStation] = useState('BAR');
  const COLORS_ = COLORS;

  const submit = async () => {
    if (!userId) return;
    const date = addDays(weekStart_, day);
    try {
      await schedule.create({ userId, date: fmtDate(date), startHour, endHour, station });
      setUserId(''); onCreated();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: COLORS_.text }}>Aggiungi turno manuale</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 12, color: COLORS_.secondary, display: 'block', marginBottom: 4 }}>Dipendente</label>
          <select value={userId} onChange={e => setUserId(e.target.value)} style={{ borderRadius: 10, border: `1px solid ${COLORS_.border}`, padding: '8px 10px', fontSize: 14, background: '#fff' }}>
            <option value="">Seleziona…</option>
            {staffList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: COLORS_.secondary, display: 'block', marginBottom: 4 }}>Giorno</label>
          <select value={day} onChange={e => setDay(Number(e.target.value))} style={{ borderRadius: 10, border: `1px solid ${COLORS_.border}`, padding: '8px 10px', fontSize: 14, background: '#fff' }}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: COLORS_.secondary, display: 'block', marginBottom: 4 }}>Da</label>
          <input type="number" value={startHour} onChange={e => setStartHour(Number(e.target.value))} min={0} max={23} style={{ width: 60, borderRadius: 10, border: `1px solid ${COLORS_.border}`, padding: '8px', fontSize: 14 }} />:00
        </div>
        <div>
          <label style={{ fontSize: 12, color: COLORS_.secondary, display: 'block', marginBottom: 4 }}>A</label>
          <input type="number" value={endHour} onChange={e => setEndHour(Number(e.target.value))} min={1} max={24} style={{ width: 60, borderRadius: 10, border: `1px solid ${COLORS_.border}`, padding: '8px', fontSize: 14 }} />:00
        </div>
        <div>
          <label style={{ fontSize: 12, color: COLORS_.secondary, display: 'block', marginBottom: 4 }}>Postazione</label>
          <select value={station} onChange={e => setStation(e.target.value)} style={{ borderRadius: 10, border: `1px solid ${COLORS_.border}`, padding: '8px 10px', fontSize: 14, background: '#fff' }}>
            <option value="BAR">Bar</option>
            <option value="TAVOLA_CALDA">Tavola Calda</option>
            <option value="GENERALE">Generale</option>
          </select>
        </div>
        <button onClick={submit} disabled={!userId} style={{
          borderRadius: 980, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', border: 'none',
          background: !userId ? '#b0b0b5' : COLORS_.accent, color: '#fff',
        }}>Aggiungi</button>
      </div>
    </div>
  );
}
