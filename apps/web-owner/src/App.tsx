import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import OrdersBoard from './components/OrdersBoard';
import PrepTimeStats from './components/PrepTimeStats';
import CreditManagement from './components/CreditManagement';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
import Marketing from './components/Marketing';
import StaffShifts from './components/StaffShifts';
import StaffSchedule from './components/StaffSchedule';
import StaffChat from './components/StaffChat';
import Payroll from './components/Payroll';
import Accounting from './components/Accounting';
import DailyClose from './components/DailyClose';
import MenuManagement from './components/MenuManagement';
import OwnerNotes from './components/OwnerNotes';
import Login from './pages/Login';
import Setup from './pages/Setup';
import { setup } from './api';
import { currentUser, isLoggedIn, logout } from '@la-piazzetta/api-client';

type Tab = 'dashboard' | 'board' | 'stats' | 'marketing' | 'menu' | 'inventory' | 'suppliers' | 'purchases' | 'staff' | 'schedule' | 'chat' | 'payroll' | 'credit' | 'accounting' | 'dailyclose' | 'notes';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'board', label: 'Comande', icon: '🍽️' },
  { id: 'stats', label: 'Tempi', icon: '⏱️' },
  { id: 'marketing', label: 'Marketing', icon: '✨' },
  { id: 'menu', label: 'Menu', icon: '📋' },
  { id: 'inventory', label: 'Magazzino', icon: '📦' },
  { id: 'suppliers', label: 'Fornitori', icon: '🚚' },
  { id: 'purchases', label: 'Acquisti', icon: '🧾' },
  { id: 'staff', label: 'Presenze', icon: '🕐' },
  { id: 'schedule', label: 'Orari', icon: '📅' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'notes', label: 'Disposizioni', icon: '📌' },
  { id: 'payroll', label: 'Stipendi', icon: '💰' },
  { id: 'credit', label: 'Crediti', icon: '💳' },
  { id: 'accounting', label: 'Contabilità', icon: '📒' },
  { id: 'dailyclose', label: 'Chiusura', icon: '🔒' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    if (loggedIn) { setNeedsSetup(false); return; }
    setup.status()
      .then((s) => setNeedsSetup(s.needsSetup))
      .catch(() => setNeedsSetup(false)); // API irraggiungibile: mostra il login
  }, [loggedIn]);

  if (!loggedIn) {
    if (needsSetup === null) {
      return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', color: '#fff', fontFamily: 'system-ui' }}>Caricamento…</div>;
    }
    if (needsSetup) return <Setup onDone={() => setNeedsSetup(false)} />;
    return <Login onLoggedIn={() => setLoggedIn(true)} />;
  }

  const user = currentUser();

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif', background: '#f5f5f7', minHeight: '100vh', color: '#1d1d1f' }}>
      {/* Apple-style translucent header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.72)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
          <strong style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>La Piazzetta</strong>
        </div>

        {/* Tab bar */}
        <nav style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? '#0071e3' : 'transparent',
                color: tab === t.id ? '#fff' : '#1d1d1f',
                border: 'none',
                borderRadius: 980,
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* User badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{
            fontSize: 13, color: '#86868b',
            borderRadius: 980, padding: '4px 12px', background: '#f0f0f5',
          }}>{user?.userId ?? '—'}</span>
          <button
            onClick={() => { logout(); setLoggedIn(false); }}
            style={{
              background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', color: '#1d1d1f',
              borderRadius: 980, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
          >Esci</button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'board' && <OrdersBoard />}
        {tab === 'stats' && <PrepTimeStats />}
        {tab === 'marketing' && <Marketing />}
        {tab === 'menu' && <MenuManagement />}
        {tab === 'inventory' && <Inventory />}
        {tab === 'suppliers' && <Suppliers />}
        {tab === 'purchases' && <PurchaseOrders />}
        {tab === 'staff' && <StaffShifts />}
        {tab === 'schedule' && <StaffSchedule />}
        {tab === 'chat' && <StaffChat />}
        {tab === 'notes' && <OwnerNotes />}
        {tab === 'payroll' && <Payroll />}
        {tab === 'accounting' && <Accounting />}
        {tab === 'credit' && <CreditManagement />}
        {tab === 'dailyclose' && <DailyClose />}
      </main>
    </div>
  );
}
