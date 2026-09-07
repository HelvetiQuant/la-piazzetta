import { useState } from 'react';
import Login from './pages/Login';
import Tables from './pages/Tables';
import TableOrder from './pages/TableOrder';
import Chat from './pages/Chat';
import ClockIn from './pages/ClockIn';
import { AddOnBanner } from './components/AddOnBanner';
import { StaffNotesBanner } from './components/StaffNotesBanner';
import { currentUser, isLoggedIn, logout } from './lib/client';
import type { TableRow } from './api';

type Tab = 'tables' | 'chat' | 'shift';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [table, setTable] = useState<TableRow | null>(null);
  const [tab, setTab] = useState<Tab>('shift');

  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;

  // Le note staff sono sempre visibili (anche in TableOrder) — sono importanti!
  const notesBanner = <StaffNotesBanner />;

  if (table) {
    return (
      <>
        {notesBanner}
        <TableOrder table={table} onBack={() => setTable(null)} />
      </>
    );
  }

  const user = currentUser();

  return (
    <div style={{ fontFamily: 'system-ui', minHeight: '100vh', background: '#f5f5f7' }}>
      <header style={{
        background: '#1a1a2e', color: '#fff', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <strong style={{ fontSize: 16 }}>La Piazzetta · Staff</strong>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          {/* Tab navigation */}
          <button
            onClick={() => setTab('shift')}
            style={{
              background: tab === 'shift' ? '#ffffff22' : 'transparent',
              border: '1px solid #ffffff33', color: '#fff',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >⏰ Turno</button>
          <button
            onClick={() => setTab('tables')}
            style={{
              background: tab === 'tables' ? '#ffffff22' : 'transparent',
              border: '1px solid #ffffff33', color: '#fff',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >🍽️ Sala</button>
          <button
            onClick={() => setTab('chat')}
            style={{
              background: tab === 'chat' ? '#ffffff22' : 'transparent',
              border: '1px solid #ffffff33', color: '#fff',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >💬 Chat</button>
          <span style={{ opacity: 0.8, marginLeft: 4 }}>👤 {user?.userId}</span>
          <button
            onClick={() => { logout(); setLoggedIn(false); }}
            style={{
              background: 'transparent', border: '1px solid #ffffff55', color: '#fff',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Esci
          </button>
        </span>
      </header>
      {notesBanner}
      {tab === 'tables' && <AddOnBanner />}
      {tab === 'shift' ? <ClockIn onEnterShift={() => setTab('tables')} /> :
       tab === 'tables' ? <Tables onOpenTable={setTable} /> :
       <Chat />}
    </div>
  );
}
