import { useEffect, useState, useCallback } from 'react';
import {
  acct,
  type ChartOfAccount,
  type SupplierInvoice,
  type JournalEntry,
  type IncomeStatement,
  type BalanceSheet,
  type TrialBalance,
  type VatReturn,
} from '../api';

type Tab = 'invoices' | 'journal' | 'reports' | 'chart' | 'vat';

const fmt = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const fmtDate = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: '#007aff',
  RECORDED: '#34c759',
  PAID: '#8e8e93',
};

export default function Accounting() {
  const [tab, setTab] = useState<Tab>('invoices');
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [vatReturns, setVatReturns] = useState<VatReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showNewJournal, setShowNewJournal] = useState(false);
  const [recordInvoiceId, setRecordInvoiceId] = useState<string | null>(null);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [reportFrom, setReportFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [bsDate, setBsDate] = useState(new Date().toISOString().slice(0, 10));

  const loadAccounts = useCallback(async () => {
    try {
      const a = await acct.accounts();
      setAccounts(a);
      if (a.length === 0) {
        await acct.seedAccounts();
        setAccounts(await acct.accounts());
      }
    } catch (e) { console.error(e); }
  }, []);

  const loadInvoices = useCallback(async () => {
    try { setInvoices(await acct.invoices(filterStatus || undefined)); } catch (e) { console.error(e); }
  }, [filterStatus]);

  const loadJournal = useCallback(async () => {
    try { setJournal(await acct.journal()); } catch (e) { console.error(e); }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const [inc, bal, tb] = await Promise.all([
        acct.incomeStatement(reportFrom, reportTo),
        acct.balanceSheet(bsDate),
        acct.trialBalance(bsDate),
      ]);
      setIncome(inc); setBalance(bal); setTrial(tb);
    } catch (e) { console.error(e); }
  }, [reportFrom, reportTo, bsDate]);

  const loadVat = useCallback(async () => {
    try { setVatReturns(await acct.vatReturns()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      await loadAccounts();
      if (tab === 'invoices') await loadInvoices();
      if (tab === 'journal') await loadJournal();
      if (tab === 'reports') await loadReports();
      if (tab === 'vat') await loadVat();
      setLoading(false);
    })();
  }, [tab, loadAccounts, loadInvoices, loadJournal, loadReports, loadVat]);

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'invoices', label: 'Fatture', icon: '🧾' },
    { id: 'journal', label: 'Registrazioni', icon: '📋' },
    { id: 'reports', label: 'Report', icon: '📊' },
    { id: 'chart', label: 'Piano Conti', icon: '📚' },
    { id: 'vat', label: 'IVA', icon: '⚖️' },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Contabilità</h1>
        <p style={{ color: '#86868b', fontSize: 15, margin: '4px 0 0' }}>
          Gestione contabile secondo regole italiane · Fatture fornitori · Conto economico · Bilancio · Export commercialista
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, padding: 4, background: 'rgba(118,118,128,0.12)',
        borderRadius: 12, marginBottom: 24, width: 'fit-content',
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            background: tab === t.id ? '#fff' : 'transparent',
            color: tab === t.id ? '#1d1d1f' : '#86868b',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: '#86868b', textAlign: 'center', padding: 40 }}>Caricamento…</div>}

      {/* ===== FATTURE ===== */}
      {tab === 'invoices' && !loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['', 'RECEIVED', 'RECORDED', 'PAID'].map(s => (
                <button key={s || 'all'} onClick={() => setFilterStatus(s)} style={{
                  padding: '6px 14px', borderRadius: 16, border: '1px solid #d2d2d7', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500,
                  background: filterStatus === s ? '#007aff' : '#fff',
                  color: filterStatus === s ? '#fff' : '#1d1d1f',
                }}>
                  {s === '' ? 'Tutte' : s === 'RECEIVED' ? 'Ricevute' : s === 'RECORDED' ? 'Contabilizzate' : 'Pagate'}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewInvoice(true)} style={btnPrimary}>+ Nuova fattura</button>
          </div>

          {invoices.length === 0 ? (
            <EmptyState icon="🧾" title="Nessuna fattura" subtitle="Registra la prima fattura fornitore" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {invoices.map(inv => (
                <div key={inv.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{inv.supplierName}</div>
                      <div style={{ fontSize: 13, color: '#86868b', marginTop: 2 }}>
                        N. {inv.invoiceNumber} · {fmtDate(inv.invoiceDate)} {inv.supplierVat ? `· P.IVA ${inv.supplierVat}` : ''}
                      </div>
                      {inv.description && <div style={{ fontSize: 13, color: '#86868b', marginTop: 4 }}>{inv.description}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(inv.totalAmountCents)}</div>
                      <div style={{ fontSize: 12, color: '#86868b' }}>Netto {fmt(inv.netAmountCents)} + IVA {inv.vatRate}%</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                      background: `${STATUS_COLORS[inv.status]}20`, color: STATUS_COLORS[inv.status],
                    }}>
                      {inv.status === 'RECEIVED' ? 'Ricevuta' : inv.status === 'RECORDED' ? 'Contabilizzata' : 'Pagata'}
                    </span>
                    {inv.filePath && <span style={{ fontSize: 12, color: '#007aff' }}>📎 File allegato</span>}
                    <div style={{ flex: 1 }} />
                    {inv.status === 'RECEIVED' && (
                      <>
                        <button style={btnSmall} onClick={() => setRecordInvoiceId(inv.id)}>Contabilizza</button>
                        <button style={btnSmallDanger} onClick={async () => { await acct.deleteInvoice(inv.id); loadInvoices(); }}>Elimina</button>
                      </>
                    )}
                    {inv.status === 'RECORDED' && (
                      <button style={btnSmall} onClick={() => setPayInvoiceId(inv.id)}>Segna pagata</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {showNewInvoice && <NewInvoiceModal accounts={accounts} onClose={() => setShowNewInvoice(false)} onSaved={() => { setShowNewInvoice(false); loadInvoices(); }} />}
          {recordInvoiceId && <RecordInvoiceModal invoice={invoices.find(i => i.id === recordInvoiceId)!} accounts={accounts} onClose={() => setRecordInvoiceId(null)} onDone={() => { setRecordInvoiceId(null); loadInvoices(); }} />}
          {payInvoiceId && <PayInvoiceModal invoice={invoices.find(i => i.id === payInvoiceId)!} accounts={accounts} onClose={() => setPayInvoiceId(null)} onDone={() => { setPayInvoiceId(null); loadInvoices(); }} />}
        </div>
      )}

      {/* ===== JOURNAL ===== */}
      {tab === 'journal' && !loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Giornale contabile</h2>
            <button onClick={() => setShowNewJournal(true)} style={btnPrimary}>+ Nuova registrazione</button>
          </div>
          {journal.length === 0 ? (
            <EmptyState icon="📋" title="Nessuna registrazione" subtitle="Le registrazioni contabili appariranno qui" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {journal.map(e => (
                <div key={e.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 13, color: '#86868b' }}>{fmtDate(e.date)}</span>
                      <span style={{ fontSize: 16, fontWeight: 600, marginLeft: 12 }}>{e.description}</span>
                    </div>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 8, background: '#34c75920', color: '#34c759', fontWeight: 600 }}>
                      {e.sourceType === 'SUPPLIER_INVOICE' ? 'Fattura' : e.sourceType === 'MANUAL' ? 'Manuale' : e.sourceType}
                    </span>
                  </div>
                  {e.lines?.map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid #f5f5f7' }}>
                      <span>{l.account?.code} {l.account?.name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {l.debitCents > 0 ? `Dare ${fmt(l.debitCents)}` : `Avere ${fmt(l.creditCents)}`}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {showNewJournal && <NewJournalModal accounts={accounts} onClose={() => setShowNewJournal(false)} onSaved={() => { setShowNewJournal(false); loadJournal(); }} />}
        </div>
      )}

      {/* ===== REPORT ===== */}
      {tab === 'reports' && !loading && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 14, color: '#86868b' }}>Dal</label>
            <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} style={inputStyle} />
            <label style={{ fontSize: 14, color: '#86868b' }}>al</label>
            <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} style={inputStyle} />
            <label style={{ fontSize: 14, color: '#86868b', marginLeft: 12 }}>Bilancio al</label>
            <input type="date" value={bsDate} onChange={e => setBsDate(e.target.value)} style={inputStyle} />
            <button onClick={loadReports} style={btnPrimary}>Aggiorna</button>
            <div style={{ flex: 1 }} />
            <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1${acct.exportUrl('csv', reportFrom, reportTo)}`} target="_blank" rel="noreferrer">
              <button style={btnSecondary}>📥 Export CSV</button>
            </a>
            <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1${acct.exportUrl('json', reportFrom, reportTo)}`} target="_blank" rel="noreferrer">
              <button style={btnSecondary}>📥 Export JSON</button>
            </a>
          </div>

          {/* Conto Economico */}
          {income && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Conto Economico</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#34c759' }}>Ricavi</h3>
                  {income.revenues.length === 0 ? <p style={emptyText}>Nessun ricavo registrato</p> :
                    income.revenues.map(r => (
                      <div key={r.subcategory} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>{r.subcategory}</div>
                        {r.items.map(i => <div key={i.code} style={{ fontSize: 12, color: '#86868b', display: 'flex', justifyContent: 'space-between' }}><span>{i.code} {i.name}</span><span>{fmt(i.amount)}</span></div>)}
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}><span>Totale</span><span>{fmt(r.total)}</span></div>
                      </div>
                    ))
                  }
                  <div style={{ borderTop: '2px solid #34c759', marginTop: 8, paddingTop: 8, fontSize: 16, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Totale Ricavi</span><span>{fmt(income.totalRevenue)}</span>
                  </div>
                </div>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#ff3b30' }}>Costi</h3>
                  {income.costs.length === 0 ? <p style={emptyText}>Nessun costo registrato</p> :
                    income.costs.map(c => (
                      <div key={c.subcategory} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>{c.subcategory}</div>
                        {c.items.map(i => <div key={i.code} style={{ fontSize: 12, color: '#86868b', display: 'flex', justifyContent: 'space-between' }}><span>{i.code} {i.name}</span><span>{fmt(i.amount)}</span></div>)}
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}><span>Totale</span><span>{fmt(c.total)}</span></div>
                      </div>
                    ))
                  }
                  <div style={{ borderTop: '2px solid #ff3b30', marginTop: 8, paddingTop: 8, fontSize: 16, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Totale Costi</span><span>{fmt(income.totalCost)}</span>
                  </div>
                </div>
              </div>
              <div style={{ ...cardStyle, marginTop: 12, background: income.netIncome >= 0 ? '#34c75910' : '#ff3b3010' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, textAlign: 'center' }}>
                  <Metric label="EBITDA" value={fmt(income.ebitda)} />
                  <Metric label="Oneri Fin." value={fmt(income.financialCosts)} negative />
                  <Metric label="Imposte" value={fmt(income.taxes)} negative />
                  <Metric label="Utile Netto" value={fmt(income.netIncome)} highlight={income.netIncome >= 0 ? '#34c759' : '#ff3b30'} />
                </div>
              </div>
            </div>
          )}

          {/* Bilancio Patrimoniale */}
          {balance && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Bilancio Patrimoniale</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#007aff' }}>Attivo</h3>
                  {balance.assets.length === 0 ? <p style={emptyText}>Nessun attività</p> :
                    balance.assets.map(a => (
                      <div key={a.subcategory} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{a.subcategory}</div>
                        {a.items.map(i => <div key={i.code} style={{ fontSize: 12, color: '#86868b', display: 'flex', justifyContent: 'space-between' }}><span>{i.code} {i.name}</span><span>{fmt(i.amount)}</span></div>)}
                      </div>
                    ))
                  }
                  <div style={{ borderTop: '2px solid #007aff', marginTop: 8, paddingTop: 8, fontSize: 16, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Totale Attivo</span><span>{fmt(balance.totalAssets)}</span>
                  </div>
                </div>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#ff9500' }}>Passivo</h3>
                  {balance.liabilities.length === 0 ? <p style={emptyText}>Nessun passività</p> :
                    balance.liabilities.map(l => (
                      <div key={l.subcategory} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.subcategory}</div>
                        {l.items.map(i => <div key={i.code} style={{ fontSize: 12, color: '#86868b', display: 'flex', justifyContent: 'space-between' }}><span>{i.code} {i.name}</span><span>{fmt(i.amount)}</span></div>)}
                      </div>
                    ))
                  }
                  <div style={{ borderTop: '2px solid #ff9500', marginTop: 8, paddingTop: 8, fontSize: 16, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Totale Passivo</span><span>{fmt(balance.totalLiabilities)}</span>
                  </div>
                </div>
              </div>
              <div style={{ ...cardStyle, marginTop: 12, background: '#f5f5f7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
                  <span>Patrimonio Netto</span><span style={{ color: balance.netEquity >= 0 ? '#34c759' : '#ff3b30' }}>{fmt(balance.netEquity)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Bilancio di Verifica */}
          {trial && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Bilancio di Verifica</h2>
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #d2d2d7' }}>
                      <th style={{ textAlign: 'left', padding: '8px 4px' }}>Conto</th>
                      <th style={{ textAlign: 'right', padding: '8px 4px' }}>Dare</th>
                      <th style={{ textAlign: 'right', padding: '8px 4px' }}>Avere</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trial.accounts.filter(a => a.debit !== 0 || a.credit !== 0).map(a => (
                      <tr key={a.code} style={{ borderBottom: '1px solid #f5f5f7' }}>
                        <td style={{ padding: '6px 4px' }}>{a.code} {a.name}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.debit > 0 ? fmt(a.debit) : '—'}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.credit > 0 ? fmt(a.credit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #1d1d1f', fontWeight: 700 }}>
                      <td style={{ padding: '10px 4px' }}>Totale</td>
                      <td style={{ textAlign: 'right' }}>{fmt(trial.totalDebit)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(trial.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: trial.balanced ? '#34c759' : '#ff3b30' }}>
                  {trial.balanced ? '✓ Bilanciato' : '✗ Non bilanciato'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== PIANO CONTI ===== */}
      {tab === 'chart' && !loading && (
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 16px' }}>Piano dei Conti Italiano</h2>
          {['ATTIVO', 'PASSIVO', 'COSTO', 'RICAVO'].map(cat => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: cat === 'ATTIVO' ? '#007aff' : cat === 'PASSIVO' ? '#ff9500' : cat === 'COSTO' ? '#ff3b30' : '#34c759' }}>
                {cat === 'ATTIVO' ? 'Attivo' : cat === 'PASSIVO' ? 'Passivo e Netto' : cat === 'COSTO' ? 'Costi' : 'Ricavi'}
              </h3>
              <div style={cardStyle}>
                {accounts.filter(a => a.category === cat).map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f7', fontSize: 13 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, marginRight: 8 }}>{a.code}</span>
                      {a.name}
                      {a.vatRate !== null && a.vatRate !== undefined && <span style={{ marginLeft: 8, fontSize: 11, color: '#86868b' }}>IVA {a.vatRate}%</span>}
                    </div>
                    <span style={{ fontSize: 11, color: '#86868b' }}>{a.subcategory}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== IVA ===== */}
      {tab === 'vat' && !loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Liquidazione IVA</h2>
            <CalcVatButton onCalc={loadVat} />
          </div>
          {vatReturns.length === 0 ? (
            <EmptyState icon="⚖️" title="Nessuna liquidazione" subtitle="Calcola la liquidazione IVA per un periodo" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {vatReturns.map(v => (
                <div key={v.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>Periodo {v.period}</div>
                      <div style={{ fontSize: 12, color: '#86868b' }}>{v.periodType === 'MONTHLY' ? 'Mensile' : 'Trimestrale'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, color: '#86868b' }}>IVA a debito: {fmt(v.vatCollectedCents)} · IVA a credito: {fmt(v.vatPaidCents)}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: v.vatDueCents >= 0 ? '#ff3b30' : '#34c759' }}>
                        {v.vatDueCents >= 0 ? 'Da versare' : 'A credito'}: {fmt(Math.abs(v.vatDueCents))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, fontWeight: 600, background: v.status === 'FILED' ? '#34c75920' : '#ff950020', color: v.status === 'FILED' ? '#34c759' : '#ff9500' }}>
                      {v.status === 'FILED' ? 'Presentata' : 'Bozza'}
                    </span>
                    {v.status !== 'FILED' && <button style={btnSmall} onClick={async () => { await acct.fileVat(v.id); loadVat(); }}>Segna presentata</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Sub-components =====
function Metric({ label, value, negative, highlight }: { label: string; value: string; negative?: boolean; highlight?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#86868b' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: highlight ?? (negative ? '#ff3b30' : '#1d1d1f') }}>{value}</div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: '#86868b' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#1d1d1f' }}>{title}</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

function NewInvoiceModal({ onClose, onSaved }: { accounts: ChartOfAccount[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    supplierName: '', supplierVat: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10),
    description: '', netAmountCents: '', vatRate: '22', note: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const net = Number(form.netAmountCents) * 100;
      const inv = await acct.createInvoice({
        supplierName: form.supplierName, supplierVat: form.supplierVat, invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate, description: form.description, netAmountCents: net,
        vatRate: Number(form.vatRate), note: form.note,
      });
      if (file) {
        const base64 = await fileToBase64(file);
        await acct.uploadInvoiceFile(inv.id, base64, file.type, file.name);
      }
      onSaved();
    } catch (e) { alert('Errore: ' + (e as Error).message); }
    setSaving(false);
  };

  return (
    <Modal title="Nuova fattura fornitore" onClose={onClose}>
      <Field label="Fornitore *"><input style={inputStyle} value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} placeholder="Es. Eurofood S.r.l." /></Field>
      <Field label="P.IVA"><input style={inputStyle} value={form.supplierVat} onChange={e => setForm({ ...form, supplierVat: e.target.value })} placeholder="IT01234567890" /></Field>
      <Field label="Numero fattura *"><input style={inputStyle} value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} /></Field>
      <Field label="Data fattura *"><input type="date" style={inputStyle} value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} /></Field>
      <Field label="Imponibile (€) *"><input type="number" style={inputStyle} value={form.netAmountCents} onChange={e => setForm({ ...form, netAmountCents: e.target.value })} placeholder="1000.00" /></Field>
      <Field label="Aliquota IVA %">
        <select style={inputStyle} value={form.vatRate} onChange={e => setForm({ ...form, vatRate: e.target.value })}>
          <option value="22">22% — Ordinaria</option>
          <option value="10">10% — Ridotta (somministrazione)</option>
          <option value="4">4% — Minima</option>
          <option value="0">0% — Esente</option>
        </select>
      </Field>
      <Field label="Descrizione"><input style={inputStyle} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="File fattura (PDF/immagine)"><input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={btnPrimary} onClick={save} disabled={saving || !form.supplierName || !form.invoiceNumber || !form.netAmountCents}>
          {saving ? 'Salvataggio…' : 'Salva fattura'}
        </button>
        <button style={btnSecondary} onClick={onClose}>Annulla</button>
      </div>
    </Modal>
  );
}

function RecordInvoiceModal({ invoice, accounts, onClose, onDone }: { invoice: SupplierInvoice; accounts: ChartOfAccount[]; onClose: () => void; onDone: () => void }) {
  const costAccounts = accounts.filter(a => a.category === 'COSTO');
  const vatAccounts = accounts.filter(a => a.code === '4.03');
  const supplierAccounts = accounts.filter(a => a.code === '7.01');
  const [expenseId, setExpenseId] = useState(costAccounts[0]?.id ?? '');
  const [vatId, setVatId] = useState(vatAccounts[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState(supplierAccounts[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const record = async () => {
    setSaving(true);
    try { await acct.recordInvoice(invoice.id, expenseId, vatId, supplierId); onDone(); }
    catch (e) { alert('Errore: ' + (e as Error).message); }
    setSaving(false);
  };

  return (
    <Modal title={`Contabilizza fattura ${invoice.invoiceNumber}`} onClose={onClose}>
      <p style={{ fontSize: 14, color: '#86868b', marginBottom: 16 }}>
        Verrà creata una registrazione in partita doppia: DARE costo + DARE IVA a credito / AVERE fornitore
      </p>
      <Field label="Conto costo (DARE)">
        <select style={inputStyle} value={expenseId} onChange={e => setExpenseId(e.target.value)}>
          {costAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <Field label="Conto IVA a credito (DARE)">
        <select style={inputStyle} value={vatId} onChange={e => setVatId(e.target.value)}>
          {vatAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <Field label="Conto fornitori (AVERE)">
        <select style={inputStyle} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
          {supplierAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <div style={{ marginTop: 12, padding: 12, background: '#f5f5f7', borderRadius: 8, fontSize: 13 }}>
        <div>DARE costo: {fmt(invoice.netAmountCents)}</div>
        <div>DARE IVA {invoice.vatRate}%: {fmt(invoice.vatAmountCents)}</div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>AVERE fornitore: {fmt(invoice.totalAmountCents)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={btnPrimary} onClick={record} disabled={saving || !expenseId || !vatId || !supplierId}>{saving ? 'Contabilizzazione…' : 'Contabilizza'}</button>
        <button style={btnSecondary} onClick={onClose}>Annulla</button>
      </div>
    </Modal>
  );
}

function PayInvoiceModal({ invoice, accounts, onClose, onDone }: { invoice: SupplierInvoice; accounts: ChartOfAccount[]; onClose: () => void; onDone: () => void }) {
  const bankAccounts = accounts.filter(a => a.code === '4.05' || a.code === '4.04');
  const [bankId, setBankId] = useState(bankAccounts[0]?.id ?? '');
  const [method, setMethod] = useState('BONIFICO');
  const [saving, setSaving] = useState(false);

  const pay = async () => {
    setSaving(true);
    try { await acct.payInvoice(invoice.id, method, bankId); onDone(); }
    catch (e) { alert('Errore: ' + (e as Error).message); }
    setSaving(false);
  };

  return (
    <Modal title={`Pagamento fattura ${invoice.invoiceNumber}`} onClose={onClose}>
      <p style={{ fontSize: 14, color: '#86868b', marginBottom: 16 }}>Importo: {fmt(invoice.totalAmountCents)}</p>
      <Field label="Metodo pagamento">
        <select style={inputStyle} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="BONIFICO">Bonifico</option>
          <option value="CONTANTI">Contanti</option>
          <option value="ASSEGNO">Assegno</option>
          <option value="CARTA">Carta di credito</option>
        </select>
      </Field>
      <Field label="Conto pagamento (AVERE)">
        <select style={inputStyle} value={bankId} onChange={e => setBankId(e.target.value)}>
          {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={btnPrimary} onClick={pay} disabled={saving}>{saving ? 'Pagamento…' : 'Segna pagata'}</button>
        <button style={btnSecondary} onClick={onClose}>Annulla</button>
      </div>
    </Modal>
  );
}

function NewJournalModal({ accounts, onClose, onSaved }: { accounts: ChartOfAccount[]; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Array<{ accountId: string; debitCents: number; creditCents: number }>>([
    { accountId: accounts[0]?.id ?? '', debitCents: 0, creditCents: 0 },
    { accountId: accounts[1]?.id ?? '', debitCents: 0, creditCents: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const totalD = lines.reduce((s, l) => s + l.debitCents, 0);
  const totalC = lines.reduce((s, l) => s + l.creditCents, 0);
  const balanced = totalD === totalC && totalD > 0;

  const save = async () => {
    if (!balanced) { alert('Totale dare e avere devono essere uguali'); return; }
    setSaving(true);
    try {
      await acct.createJournal({ date, description, reference, lines: lines.map(l => ({ ...l, debitCents: l.debitCents, creditCents: l.creditCents })) });
      onSaved();
    } catch (e) { alert('Errore: ' + (e as Error).message); }
    setSaving(false);
  };

  return (
    <Modal title="Nuova registrazione manuale" onClose={onClose}>
      <Field label="Data"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Descrizione *"><input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <Field label="Riferimento"><input style={inputStyle} value={reference} onChange={e => setReference(e.target.value)} /></Field>
      <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>Righe di registrazione (partita doppia)</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginTop: 8 }}>
          <select style={inputStyle} value={l.accountId} onChange={e => { const n = [...lines]; n[i] = { ...n[i], accountId: e.target.value }; setLines(n); }}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
          <input type="number" style={inputStyle} placeholder="Dare (€)" value={l.debitCents ? l.debitCents / 100 : ''} onChange={e => { const n = [...lines]; n[i] = { ...n[i], debitCents: Math.round(Number(e.target.value) * 100) }; setLines(n); }} />
          <input type="number" style={inputStyle} placeholder="Avere (€)" value={l.creditCents ? l.creditCents / 100 : ''} onChange={e => { const n = [...lines]; n[i] = { ...n[i], creditCents: Math.round(Number(e.target.value) * 100) }; setLines(n); }} />
          {lines.length > 2 && <button style={btnSmallDanger} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}
        </div>
      ))}
      <button style={{ ...btnSmall, marginTop: 8 }} onClick={() => setLines([...lines, { accountId: accounts[0]?.id ?? '', debitCents: 0, creditCents: 0 }])}>+ Aggiungi riga</button>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
        <span>Totale Dare: {fmt(totalD)}</span>
        <span>Totale Avere: {fmt(totalC)}</span>
        <span style={{ color: balanced ? '#34c759' : '#ff3b30' }}>{balanced ? '✓ Bilanciato' : '✗ Sbilanciato'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={btnPrimary} onClick={save} disabled={saving || !balanced || !description}>{saving ? 'Salvataggio…' : 'Salva registrazione'}</button>
        <button style={btnSecondary} onClick={onClose}>Annulla</button>
      </div>
    </Modal>
  );
}

function CalcVatButton({ onCalc }: { onCalc: () => void }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [saving, setSaving] = useState(false);
  const calc = async () => {
    setSaving(true);
    try { await acct.calcVat(period); onCalc(); }
    catch (e) { alert('Errore: ' + (e as Error).message); }
    setSaving(false);
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="month" style={inputStyle} value={period} onChange={e => setPeriod(e.target.value)} />
      <button style={btnPrimary} onClick={calc} disabled={saving}>{saving ? 'Calcolo…' : 'Calcola IVA'}</button>
    </div>
  );
}

// ===== Helpers =====
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 560, width: '90%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#86868b' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', display: 'block', marginBottom: 4 }}>{label}</label>{children}</div>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== Styles =====
const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 18,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f0f0f2',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 10, border: 'none', background: '#007aff', color: '#fff',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  ...btnPrimary, background: '#e5e5ea', color: '#1d1d1f',
};
const btnSmall: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 8, border: '1px solid #d2d2d7', background: '#fff',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#007aff',
};
const btnSmallDanger: React.CSSProperties = {
  ...btnSmall, color: '#ff3b30', borderColor: '#ff3b3050',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d2d2d7',
  fontSize: 14, boxSizing: 'border-box', outline: 'none',
};
const emptyText: React.CSSProperties = { fontSize: 13, color: '#86868b', margin: 0 };
