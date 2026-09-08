import { useEffect, useState } from 'react';
import { api, type Customer, type CreditTx, fmtEuro } from '../api';
import { colors } from '@la-piazzetta/ui';

function euroToCents(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// --- Form ricerca/aggiunta debitore con nome, cognome, whatsapp o email ---
function AddDebtorForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [limit, setLimit] = useState('');
  const [opening, setOpening] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    if (!name.trim()) { setErr('Nome obbligatorio'); return; }
    if (!phone.trim() && !email.trim()) { setErr('Inserire almeno un telefono o email per le notifiche'); return; }
    try {
      await api.createCustomer({
        name: name.trim(),
        surname: surname.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        limitCents: euroToCents(limit),
        openingBalanceCents: euroToCents(opening),
      });
      setName(''); setSurname(''); setPhone(''); setEmail(''); setLimit(''); setOpening(''); setErr(''); setOpen(false);
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!open) return <button onClick={() => setOpen(true)} style={btnPrimary}>+ Nuovo cliente a credito</button>;
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, background: '#fafafa', maxWidth: 460 }}>
      <h4 style={{ marginTop: 0 }}>Nuovo cliente creditore</h4>
      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Nome *" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <input placeholder="Cognome" value={surname} onChange={(e) => setSurname(e.target.value)} style={inputStyle} />
        <input placeholder="Telefono / WhatsApp (per notifiche)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        <input placeholder="Email (per notifiche)" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <label style={{ fontSize: 13 }}>Limite fido € (0 = nessun limite)
          <input placeholder="0,00" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: 13 }}>Debito pregresso € (opzionale)
          <input placeholder="0,00" value={opening} onChange={(e) => setOpening(e.target.value)} style={{ width: '100%' }} />
        </label>
      </div>
      {err && <p style={{ color: colors.danger }}>{err}</p>}
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={submit} style={btnPrimary}>Salva</button>
        <button onClick={() => setOpen(false)}>Annulla</button>
      </div>
    </div>
  );
}

// --- Pannello dettaglio con movimenti e reminder ---
function CustomerDetail({ id, onChange }: { id: string; onChange: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [txs, setTxs] = useState<CreditTx[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [remindMsg, setRemindMsg] = useState('');

  async function load() {
    const d = await api.customerDetail(id);
    setCustomer(d.customer);
    setTxs(d.transactions);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function move(type: 'CHARGE' | 'PAYMENT', method?: 'CASH' | 'POS') {
    const cents = euroToCents(amount);
    if (cents <= 0) { setErr('Importo non valido'); return; }
    try {
      await api.addTransaction(id, { type, amountCents: cents, method, note: note.trim() || undefined });
      setAmount(''); setNote(''); setErr('');
      await load();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remind(channel: 'auto' | 'whatsapp' | 'email') {
    setRemindMsg('');
    try {
      const r = await api.remind(id, channel);
      if (r.ok) setRemindMsg(`✓ Reminder inviato via ${r.channel}`);
      else setRemindMsg(`✗ Invio fallito: ${r.error ?? r.channel}`);
    } catch (e) {
      setRemindMsg(`✗ Errore: ${(e as Error).message}`);
    }
  }

  if (!customer) return <p>Caricamento…</p>;
  const fullName = `${customer.name} ${customer.surname ?? ''}`.trim();
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>{fullName}</h3>
        <strong style={{ fontSize: 22, color: customer.balanceCents > 0 ? colors.danger : colors.success }}>{fmtEuro(customer.balanceCents)}</strong>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        {customer.phone && `📱 ${customer.phone}`}
        {customer.phone && customer.email && ' · '}
        {customer.email && `✉ ${customer.email}`}
        {!customer.phone && !customer.email && '⚠ Nessun contatto (impossibile inviare notifiche)'}
        {' · '}limite {customer.limitCents ? fmtEuro(customer.limitCents) : 'nessuno'}
      </div>

      {/* Reminder buttons */}
      {customer.balanceCents > 0 && (
        <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
          <button onClick={() => remind('whatsapp')} style={btnWhatsApp}>💬 Reminder WhatsApp</button>
          <button onClick={() => remind('email')} style={btnEmail}>✉ Reminder Email</button>
          <button onClick={() => remind('auto')} style={btnAuto}>⚡ Reminder Auto</button>
        </div>
      )}
      {remindMsg && <div style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, background: remindMsg.startsWith('✓') ? '#e8f5e9' : '#ffebee', color: remindMsg.startsWith('✓') ? colors.success : colors.danger, marginBottom: 8 }}>{remindMsg}</div>}

      {/* Movimenti */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Importo €" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
        <input placeholder="Causale (opz.)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={() => move('CHARGE')} style={{ background: colors.danger, color: '#fff', border: 0, padding: '6px 10px', borderRadius: 6 }}>Addebita</button>
        <button onClick={() => move('PAYMENT', 'CASH')} style={{ background: colors.success, color: '#fff', border: 0, padding: '6px 10px', borderRadius: 6 }}>Incassa contanti</button>
        <button onClick={() => move('PAYMENT', 'POS')} style={{ background: colors.secondary, color: '#fff', border: 0, padding: '6px 10px', borderRadius: 6 }}>Incassa POS</button>
      </div>
      {err && <p style={{ color: colors.danger }}>{err}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
          <th style={{ padding: 6 }}>Data</th><th style={{ padding: 6 }}>Tipo</th>
          <th style={{ padding: 6, textAlign: 'right' }}>Importo</th><th style={{ padding: 6, textAlign: 'right' }}>Saldo</th>
        </tr></thead>
        <tbody>
          {txs.map((t) => (
            <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 6 }}>{new Date(t.createdAt).toLocaleString('it-IT')}</td>
              <td style={{ padding: 6 }}>{t.type === 'CHARGE' ? 'Addebito' : t.type === 'PAYMENT' ? `Pagamento${t.method ? ' ' + t.method : ''}` : 'Rettifica'}</td>
              <td style={{ padding: 6, textAlign: 'right', color: t.type === 'CHARGE' ? colors.danger : colors.success }}>
                {t.type === 'CHARGE' ? '+' : '−'}{fmtEuro(t.amountCents)}
              </td>
              <td style={{ padding: 6, textAlign: 'right' }}>{fmtEuro(t.balanceAfterCents)}</td>
            </tr>
          ))}
          {txs.length === 0 && <tr><td colSpan={4} style={{ padding: 10, color: '#999' }}>Nessun movimento.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function CreditManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyDebtors, setOnlyDebtors] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const d = await api.customers({ debtors: onlyDebtors, q: search || undefined });
      setCustomers(d.customers);
      setTotal(d.totalOutstandingCents);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyDebtors, search]);

  const debtorsCount = customers.filter((c) => c.balanceCents > 0).length;

  return (
    <section>
      <h2>Crediti clienti</h2>

      {/* KPI totali */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={kpiCard}>
          <div style={{ fontSize: 13, color: '#666' }}>Totale a credito</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: colors.danger }}>{fmtEuro(total)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ fontSize: 13, color: '#666' }}>Clienti debitori</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{debtorsCount}</div>
        </div>
      </div>

      {/* Filtri e ricerca */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label><input type="checkbox" checked={onlyDebtors} onChange={(e) => setOnlyDebtors(e.target.checked)} /> solo con debito</label>
        <input placeholder="Cerca cliente per nome…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
      </div>

      <AddDebtorForm onCreated={load} />
      {error && <p style={{ color: colors.danger }}>{error}</p>}

      <div style={{ display: 'flex', gap: 20, marginTop: 14, alignItems: 'flex-start' }}>
        {/* Lista debitori */}
        <div style={{ flex: '0 0 340px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 14 }}>
            <thead><tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Cliente</th>
              <th style={{ padding: 8 }}>Contatto</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Saldo</th>
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c.id)}
                  style={{ cursor: 'pointer', borderTop: '1px solid #eee', background: selected === c.id ? '#e3f2fd' : undefined }}>
                  <td style={{ padding: 8 }}>{c.name} {c.surname ?? ''}</td>
                  <td style={{ padding: 8, fontSize: 12, color: '#888' }}>{c.phone ?? c.email ?? '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: c.balanceCents > 0 ? colors.danger : colors.success, fontWeight: c.balanceCents > 0 ? 700 : 400 }}>{fmtEuro(c.balanceCents)}</td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={3} style={{ padding: 12, color: '#999' }}>Nessun cliente.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Dettaglio */}
        <div style={{ flex: 1 }}>
          {selected ? <CustomerDetail id={selected} onChange={load} /> : <p style={{ color: '#999' }}>Seleziona un cliente per vedere l'estratto conto, registrare movimenti e inviare reminder.</p>}
        </div>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 };
const btnPrimary: React.CSSProperties = { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 };
const btnWhatsApp: React.CSSProperties = { background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnEmail: React.CSSProperties = { background: '#1565c0', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnAuto: React.CSSProperties = { background: '#666', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const kpiCard: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e0e0e0' };
