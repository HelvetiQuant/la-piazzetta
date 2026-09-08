/**
 * Chiusura giornaliera: la schermata che l'owner guarda ogni sera.
 * Incassato per metodo di pagamento, per postazione, storni con motivo,
 * differenza di cassa.
 */
import { useEffect, useState } from 'react';
import { cashierApi, fmtEuro, type DailyReport } from '../api';
import { Card, SectionTitle, KpiCard, Badge, Spinner, EmptyState, colors } from '@la-piazzetta/ui';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Contanti',
  CARD: 'Carta',
  CREDIT: 'Conto sospeso',
};

export default function DailyClose() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    cashierApi.dailyReport(date)
      .then(setReport)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: colors.danger, padding: 16 }}>{error}</div>;
  if (!report) return <EmptyState title="Nessun dato" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SectionTitle title="Chiusura giornaliera" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <KpiCard label="Totale incassato" value={fmtEuro(report.totalCents)} />
        <KpiCard label="Transazioni" value={String(report.payments)} />
        <KpiCard label="Scontrino medio" value={report.payments > 0 ? fmtEuro(Math.round(report.totalCents / report.payments)) : '—'} />
      </div>

      <Card>
        <SectionTitle title="Incasso per metodo di pagamento" />
        {Object.keys(report.byMethod).length === 0 ? (
          <EmptyState title="Nessun incasso nella giornata" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={th}>Metodo</th>
                <th style={th}>Transazioni</th>
                <th style={th}>Importo</th>
                <th style={th}>Quota</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.byMethod).map(([method, data]) => {
                const pct = report.totalCents > 0 ? (data.amountCents / report.totalCents * 100).toFixed(1) : '0';
                return (
                  <tr key={method} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>{METHOD_LABEL[method] ?? method}</td>
                    <td style={td}>{data.count}</td>
                    <td style={td}>{fmtEuro(data.amountCents)}</td>
                    <td style={td}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <SectionTitle title="Cassetto portasoldi" />
        {report.drawers.length === 0 ? (
          <EmptyState title="Nessun cassetto aperto nella giornata" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={th}>Apertura</th>
                <th style={th}>Stato</th>
                <th style={th}>Fondo</th>
                <th style={th}>Atteso</th>
                <th style={th}>Contato</th>
                <th style={th}>Differenza</th>
              </tr>
            </thead>
            <tbody>
              {report.drawers.map((d) => {
                const diff = d.differenceCents ?? 0;
                const verdict = diff === 0 ? 'OK' : diff < 0 ? 'SHORT' : 'OVER';
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>{new Date(d.openedAt).toLocaleString('it-IT')}</td>
                    <td style={td}>
                      <Badge color={d.status === 'OPEN' ? colors.warning : colors.success}>
                        {d.status === 'OPEN' ? 'Aperto' : 'Chiuso'}
                      </Badge>
                    </td>
                    <td style={td}>{fmtEuro(d.openingCents)}</td>
                    <td style={td}>{d.expectedCents !== null ? fmtEuro(d.expectedCents) : '—'}</td>
                    <td style={td}>{d.countedCents !== null ? fmtEuro(d.countedCents) : '—'}</td>
                    <td style={td}>
                      {d.differenceCents !== null ? (
                        <Badge color={verdict === 'OK' ? colors.success : verdict === 'SHORT' ? colors.danger : colors.warning}>
                          {verdict === 'OK' ? 'Quadrato' : `${verdict === 'SHORT' ? '−' : '+'}${fmtEuro(Math.abs(diff))}`}
                        </Badge>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#666' };
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 14 };
