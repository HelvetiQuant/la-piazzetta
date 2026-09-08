// Test runtime della logica cassa (bill.logic.ts) — logica pura, senza DB.
// Le funzioni sono ricopiate qui in JS per verificarle in isolamento, come
// negli altri test (verify.mjs, verify-inventory.mjs, verify-purchase.mjs).
let passed = 0, failed = 0;
function eq(a, e, msg) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) passed++;
  else { failed++; console.error(`FAIL: ${msg}\n  atteso ${E}\n  ottenuto ${A}`); }
}
function ok(c, msg) { if (c) passed++; else { failed++; console.error(`FAIL: ${msg}`); } }
function close(a, e, msg, tol = 2) {
  if (Math.abs(a - e) <= tol) passed++;
  else { failed++; console.error(`FAIL: ${msg}\n  atteso ${e}\n  ottenuto ${a}`); }
}

// ---- copia delle funzioni da bill.logic.ts (verifica in isolamento) ----

function applyDiscount(discount, baseCents, maxDiscountCents) {
  let raw;
  if (discount.type === 'PERCENT') {
    raw = Math.round(baseCents * discount.valueCents / 10000);
  } else {
    raw = discount.valueCents;
  }
  if (maxDiscountCents !== undefined) raw = Math.min(raw, maxDiscountCents);
  raw = Math.max(0, Math.min(raw, baseCents));
  return raw;
}

function computeBill(items, guests, coverChargeCentsPerGuest, discount, channel) {
  const itemsGrossCents = items.reduce((s, it) => s + it.unitCents * it.quantity, 0);
  const coverChargeTotalCents = channel === 'TABLE' ? guests * coverChargeCentsPerGuest : 0;
  const baseCents = itemsGrossCents + coverChargeTotalCents;
  const discountCents = discount ? applyDiscount(discount, baseCents) : 0;

  const byVat = new Map();
  for (const it of items) {
    const lineTaxable = it.unitCents * it.quantity;
    const lineVat = Math.round(lineTaxable * it.vatRateCents / 10000);
    const key = it.vatRateCents;
    const prev = byVat.get(key) ?? { taxable: 0, vat: 0 };
    byVat.set(key, { taxable: prev.taxable + lineTaxable, vat: prev.vat + lineVat });
  }
  if (coverChargeTotalCents > 0) {
    const coverVat = Math.round(coverChargeTotalCents * 1000 / 10000);
    const prev = byVat.get(1000) ?? { taxable: 0, vat: 0 };
    byVat.set(1000, { taxable: prev.taxable + coverChargeTotalCents, vat: prev.vat + coverVat });
  }

  const vatBreakdown = [];
  let vatTotalCents = 0;
  let taxableAfterDiscount = 0;
  for (const [rate, { taxable }] of byVat) {
    const ratio = baseCents > 0 ? taxable / baseCents : 0;
    const discountedTaxable = Math.round(taxable * (1 - discountCents / baseCents));
    const discountedVat = Math.round(discountedTaxable * rate / 10000);
    vatBreakdown.push({ vatRateCents: rate, taxableCents: discountedTaxable, vatCents: discountedVat, totalCents: discountedTaxable + discountedVat });
    vatTotalCents += discountedVat;
    taxableAfterDiscount += discountedTaxable;
  }
  const totalCents = taxableAfterDiscount + vatTotalCents;
  return { items, guests, channel, coverChargeCentsPerGuest, discount, itemsGrossCents, coverChargeTotalCents, taxableCents: taxableAfterDiscount, vatTotalCents, totalCents, vatBreakdown };
}

function splitBill(bill, mode) {
  if (mode.type === 'equal') {
    const parts = Math.max(1, mode.parts);
    const total = bill.totalCents;
    const base = Math.floor(total / parts);
    const remainder = total - base * parts;
    const portions = [];
    for (let i = 0; i < parts; i++) {
      const totalCents = base + (i < remainder ? 1 : 0);
      const ratio = total > 0 ? totalCents / total : 0;
      portions.push({ totalCents, taxableCents: Math.round(bill.taxableCents * ratio), vatCents: totalCents - Math.round(bill.taxableCents * ratio), coverShareCents: Math.round(bill.coverChargeTotalCents * ratio), discountShareCents: 0 });
    }
    if (portions.length > 0) {
      const sumTax = portions.reduce((s, p) => s + p.taxableCents, 0);
      const diff = bill.taxableCents - sumTax;
      portions[portions.length - 1].taxableCents += diff;
      portions[portions.length - 1].vatCents = portions[portions.length - 1].totalCents - portions[portions.length - 1].taxableCents;
    }
    return portions;
  }
  const groups = mode.groups;
  const groupTotals = groups.map(g => g.reduce((s, it) => s + it.unitCents * it.quantity, 0));
  const grandTotal = groupTotals.reduce((s, t) => s + t, 0) || 1;
  const portions = groups.map((_, i) => {
    const ratio = groupTotals[i] / grandTotal;
    const totalCents = Math.round(bill.totalCents * ratio);
    const taxableCents = Math.round(bill.taxableCents * ratio);
    return { totalCents, taxableCents, vatCents: totalCents - taxableCents, coverShareCents: Math.round(bill.coverChargeTotalCents * ratio), discountShareCents: 0 };
  });
  if (portions.length > 0) {
    const sumTotal = portions.reduce((s, p) => s + p.totalCents, 0);
    const diff = bill.totalCents - sumTotal;
    portions[portions.length - 1].totalCents += diff;
  }
  return portions;
}

function computeChange(totalCents, tenderedCents, method) {
  if (method === 'CARD' || method === 'CREDIT') return { ok: true, changeCents: 0 };
  if (tenderedCents < totalCents) return { ok: false, changeCents: 0, error: `Importo insufficiente` };
  return { ok: true, changeCents: tenderedCents - totalCents };
}

function reconcileDrawer(openingCents, cashPaymentsCents, changeGivenCents, countedCents) {
  const expectedCents = openingCents + cashPaymentsCents - changeGivenCents;
  const differenceCents = countedCents - expectedCents;
  const verdict = differenceCents === 0 ? 'OK' : differenceCents < 0 ? 'SHORT' : 'OVER';
  return { expectedCents, countedCents, differenceCents, verdict };
}

function coverChargeForDay(weekdayCents, weekendCents, weekendDays, weekday) {
  return weekendDays.includes(weekday) ? weekendCents : weekdayCents;
}

// ---- test ----

const items = [
  { productId: 'p1', name: 'Caffè', vatRateCents: 1000, quantity: 2, unitCents: 100 },
  { productId: 'p2', name: 'Brioche', vatRateCents: 1000, quantity: 1, unitCents: 150 },
];
const bill = computeBill(items, 0, 0, null, 'COUNTER');
eq(bill.itemsGrossCents, 350, 'mercia 2 caffè + 1 brioche = 350');
eq(bill.coverChargeTotalCents, 0, 'coperto zero su COUNTER');
eq(bill.totalCents, 385, 'totale con IVA 10% = 385');
eq(bill.vatTotalCents, 35, 'IVA 10% su 350 = 35');
eq(bill.vatBreakdown.length, 1, 'una sola aliquota');
eq(bill.vatBreakdown[0].vatRateCents, 1000, 'aliquota 10%');

const billTable = computeBill(items, 4, 150, null, 'TABLE');
eq(billTable.coverChargeTotalCents, 600, 'coperto 4 ospiti × 150 = 600');
eq(billTable.itemsGrossCents, 350, 'mercia sempre 350');
close(billTable.totalCents, 1045, 'totale con coperto = ~1045');

const billTakeaway = computeBill(items, 4, 150, null, 'TAKEAWAY');
eq(billTakeaway.coverChargeTotalCents, 0, 'coperto zero su TAKEAWAY');
eq(billTakeaway.totalCents, 385, 'totale TAKEAWAY = 385');

const billZero = computeBill([], 0, 0, null, 'COUNTER');
eq(billZero.totalCents, 0, 'conto vuoto = 0');
eq(billZero.vatBreakdown.length, 0, 'nessuna aliquota su conto vuoto');

const mixedItems = [
  { productId: 'p1', name: 'Caffè', vatRateCents: 1000, quantity: 1, unitCents: 100 },
  { productId: 'p2', name: 'Birra', vatRateCents: 2200, quantity: 1, unitCents: 500 },
];
const billMixed = computeBill(mixedItems, 0, 0, null, 'COUNTER');
eq(billMixed.vatBreakdown.length, 2, 'due aliquote');
eq(billMixed.itemsGrossCents, 600, 'mercia mista = 600');
close(billMixed.totalCents, 720, 'totale misto 10% + 22% = ~720');

const discPct = applyDiscount({ type: 'PERCENT', valueCents: 1000 }, 1000);
eq(discPct, 100, 'sconto 10% su 1000 = 100');

const discAmt = applyDiscount({ type: 'AMOUNT', valueCents: 200 }, 1000);
eq(discAmt, 200, 'sconto importo 200 su 1000 = 200');

const discOver = applyDiscount({ type: 'AMOUNT', valueCents: 5000 }, 1000);
eq(discOver, 1000, 'sconto superiore al totale clampato a 1000');

const discNeg = applyDiscount({ type: 'AMOUNT', valueCents: -500 }, 1000);
eq(discNeg, 0, 'sconto negativo clampato a 0');

const billDisc = computeBill(items, 0, 0, { type: 'PERCENT', valueCents: 1000 }, 'COUNTER');
ok(billDisc.totalCents < bill.totalCents, 'conto scontato < conto pieno');
close(billDisc.totalCents, 347, 'totale scontato 10% = ~347');

const split3 = splitBill(billTable, { type: 'equal', parts: 3 });
eq(split3.length, 3, 'split in 3 parti');
const sumSplit = split3.reduce((s, p) => s + p.totalCents, 0);
eq(sumSplit, billTable.totalCents, 'somma split = totale');

const billOdd = computeBill([{ productId: 'p', name: 'X', vatRateCents: 0, quantity: 1, unitCents: 1001 }], 0, 0, null, 'COUNTER');
const splitOdd = splitBill(billOdd, { type: 'equal', parts: 3 });
const sumOdd = splitOdd.reduce((s, p) => s + p.totalCents, 0);
eq(sumOdd, 1001, 'somma split 1001 in 3 parti = 1001 (nessun centesimo perso)');
eq(splitOdd[0].totalCents, 334, 'prima parte 334');
eq(splitOdd[1].totalCents, 334, 'seconda parte 334');
eq(splitOdd[2].totalCents, 333, 'terza parte 333');

const splitTable = splitBill(billTable, { type: 'equal', parts: 2 });
const sumCover = splitTable.reduce((s, p) => s + p.coverShareCents, 0);
close(sumCover, 600, 'coperto distribuito tra 2 parti = ~600');

const ch = computeChange(500, 1000, 'CASH');
ok(ch.ok, 'pagamento contanti ok');
eq(ch.changeCents, 500, 'resto 500 su 1000 versato per 500');

const chFail = computeChange(1000, 500, 'CASH');
ok(!chFail.ok, 'pagamento insufficiente fallisce');
ok(chFail.error !== undefined, 'errore presente');

const chCard = computeChange(500, 1000, 'CARD');
ok(chCard.ok, 'pagamento carta ok');
eq(chCard.changeCents, 0, 'resto carta sempre 0');

const chCredit = computeChange(500, 1000, 'CREDIT');
ok(chCredit.ok, 'pagamento credito ok');
eq(chCredit.changeCents, 0, 'resto credito sempre 0');

const rec = reconcileDrawer(10000, 5000, 1000, 14000);
eq(rec.expectedCents, 14000, 'atteso = apertura + incassi − resti');
eq(rec.differenceCents, 0, 'differenza zero');
eq(rec.verdict, 'OK', 'verdetto OK');

const recShort = reconcileDrawer(10000, 5000, 1000, 13500);
eq(recShort.differenceCents, -500, 'mancante -500');
eq(recShort.verdict, 'SHORT', 'verdetto SHORT');

const recOver = reconcileDrawer(10000, 5000, 1000, 14500);
eq(recOver.differenceCents, 500, 'eccedente +500');
eq(recOver.verdict, 'OVER', 'verdetto OVER');

eq(coverChargeForDay(150, 180, [6, 7], 3), 150, 'mercoledì = feriale 150');
eq(coverChargeForDay(150, 180, [6, 7], 6), 180, 'sabato = weekend 180');
eq(coverChargeForDay(150, 180, [6, 7], 7), 180, 'domenica = weekend 180');

// Coperto congelato: tavolo aperto venerdì, chiuso sabato
const tariffaApertura = coverChargeForDay(150, 180, [6, 7], 5);
eq(tariffaApertura, 150, 'tariffa congelata venerdì = 150');
const billFrozen = computeBill(items, 4, tariffaApertura, null, 'TABLE');
eq(billFrozen.coverChargeTotalCents, 600, 'coperto congelato a 150 × 4 = 600');

// Pagamento misto che eccede il totale
const chMixed = computeChange(1045, 2000, 'CASH');
eq(chMixed.changeCents, 955, 'resto su pagamento misto = 955');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
