/**
 * Test di logica pura per la scansione fatture (Node >= 22, strip-types).
 * Copre: parseScannedInvoice, normalizeVat, normalizeSupplierName,
 * matchSupplier, isLikelyBuyer (guardrail destinatario).
 *
 *   node --experimental-strip-types tests/invoice-scan.test.mts
 */

import {
  parseScannedInvoice,
  normalizeVat,
  normalizeSupplierName,
  matchSupplier,
  isLikelyBuyer,
} from '../apps/api/src/accounting/invoice-scan.logic.ts';

let passed = 0;
let failed = 0;
function ok(actual: unknown, expected: unknown, msg: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}\n      atteso: ${JSON.stringify(expected)}\n      ottenuto: ${JSON.stringify(actual)}`); }
}

// --- normalizeVat ---
ok(normalizeVat('IT02671990105'), '02671990105', 'normalizeVat toglie IT');
ok(normalizeVat('02671990105'), '02671990105', 'normalizeVat 11 cifre ok');
ok(normalizeVat('1234'), null, 'normalizeVat scarta lunghezze errate');
ok(normalizeVat(null), null, 'normalizeVat null→null');
ok(normalizeVat('39 02671990105'), '02671990105', 'normalizeVat prefisso 39 + spazi');

// --- normalizeSupplierName ---
ok(normalizeSupplierName('TIMOSSI COMMERCIALE S.P.A.'), 'timossi commerciale', 'normalize toglie S.P.A.');
ok(normalizeSupplierName("Acquaviva S.r.l."), 'acquaviva', 'normalize toglie S.r.l.');
ok(normalizeSupplierName('  MILFA   S.R.L. '), 'milfa', 'normalize spazi multipli');

// --- isLikelyBuyer (guardrail destinatario) ---
ok(isLikelyBuyer("PIAZZETTA DI CHIARELLO ANTONINO E SOCIETA' S.S.", 'La Piazzetta'), true, 'ragione sociale estesa del venue rilevata');
ok(isLikelyBuyer('LA PIAZZETTA', 'La Piazzetta'), true, 'nome venue esatto');
ok(isLikelyBuyer('ACQUAVIVA S.R.L.', 'La Piazzetta'), false, 'fornitore vero non rilevato');
ok(isLikelyBuyer('TIMOSSI COMMERCIALE SPA', 'La Piazzetta'), false, 'timossi non rilevato');
ok(isLikelyBuyer('PIAZZETTA SRL', null), false, 'venue assente → mai bloccato');

// --- parseScannedInvoice ---
const valid = parseScannedInvoice({
  supplierName: 'ACQUAVIVA S.R.L.',
  supplierVat: 'IT02671990105',
  invoiceNumber: '2117',
  invoiceDate: '2023-11-30',
  dueDate: '30/12/2023',
  netAmountEuros: 103.55,
  vatRate: 10,
  vatAmountEuros: 10.34,
  totalEuros: 113.89,
  lineItems: [{ description: 'Acqua', qty: 24, unitPriceEuros: 0.5, vatRate: 10 }],
  confidence: 0.9,
});
ok(valid !== null, true, 'parse fattura valida');
ok(valid?.totalAmountCents, 11389, 'totale in centesimi');
ok(valid?.dueDate, '2023-12-30', 'data italiana convertita in ISO');
ok(valid?.lineItems?.length, 1, 'righe merce parseate');

ok(parseScannedInvoice({ supplierName: 'X' }), null, 'parse rifiuta payload incompleto');
ok(parseScannedInvoice(null), null, 'parse rifiuta null');
ok(parseScannedInvoice({ supplierName: 'X', invoiceNumber: '1', invoiceDate: '2024-01-01', totalEuros: 0 }), null, 'parse rifiuta totale zero');

// --- matchSupplier ---
const suppliers = [
  { id: 's1', name: 'Acquaviva S.r.l.', vatNumber: '02671990105' },
  { id: 's2', name: 'Timossi Commerciale S.p.A.', vatNumber: '00263520108' },
];
ok(matchSupplier(suppliers, { supplierName: 'X', supplierVat: 'IT02671990105' })?.supplier.id, 's1', 'match per P.IVA');
ok(matchSupplier(suppliers, { supplierName: 'TIMOSSI SPA', supplierVat: null })?.supplier.id, 's2', 'match per nome normalizzato');
ok(matchSupplier(suppliers, { supplierName: 'Sconosciuto Srl', supplierVat: null }), null, 'nessun match → null');

console.log(`\n${passed} asserzioni OK, ${failed} fallite`);
process.exit(failed ? 1 : 0);
