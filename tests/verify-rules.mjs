// Test del motore di regole (rules.logic.ts) — logica pura, senza DB.
// Le funzioni sono ricopiate qui in JS per verificarle in isolamento,
// come negli altri test (verify-bill.mjs, verify-inventory.mjs).
let passed = 0, failed = 0;
function ok(c, msg) { if (c) passed++; else { failed++; console.error(`FAIL: ${msg}`); } }

// --- Condizioni delle 7 regole (ricopiate da rules.logic.ts) ---

function stockCritical(ctx) {
  if (ctx.stockQuantity === undefined || ctx.reorderLevel === undefined) return false;
  if (ctx.supplierLeadTimeDays === undefined || ctx.dailyConsumption === undefined || ctx.dailyConsumption === 0) return false;
  const below = ctx.stockQuantity <= ctx.reorderLevel;
  const coverageDays = ctx.stockQuantity / ctx.dailyConsumption;
  return below && ctx.supplierLeadTimeDays > coverageDays;
}

function creditExceeded(ctx) {
  if (ctx.customerBalanceCents === undefined || ctx.customerLimitCents === undefined) return false;
  return ctx.customerBalanceCents > ctx.customerLimitCents;
}

function invoiceDue(ctx) {
  if (!ctx.invoiceDueDate) return false;
  const due = new Date(ctx.invoiceDueDate);
  const now = new Date();
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 3 && diffDays >= -1;
}

function revenueAnomaly(ctx) {
  if (ctx.todayRevenueCents === undefined || ctx.meanRevenueCents === undefined || ctx.stdDevRevenueCents === undefined) return false;
  if (ctx.stdDevRevenueCents === 0) return false;
  const z = Math.abs(ctx.todayRevenueCents - ctx.meanRevenueCents) / ctx.stdDevRevenueCents;
  return z > 2;
}

function kitchenSlow(ctx) {
  if (ctx.avgPrepMinutes === undefined || ctx.slowWindowMinutes === undefined) return false;
  return ctx.avgPrepMinutes > 15 && ctx.slowWindowMinutes >= 30;
}

function laborCostHigh(ctx) {
  if (ctx.laborCostCents === undefined || ctx.projectedRevenueCents === undefined || ctx.projectedRevenueCents === 0) return false;
  const pct = (ctx.laborCostCents / ctx.projectedRevenueCents) * 100;
  return pct > (ctx.laborCostPctThreshold ?? 30);
}

function drawerShort(ctx) {
  if (ctx.drawerDifferenceCents === undefined || ctx.drawerThresholdCents === undefined) return false;
  return Math.abs(ctx.drawerDifferenceCents) > ctx.drawerThresholdCents;
}

// --- Test ---

// Regola 1: Scorta critica
ok(stockCritical({ stockQuantity: 5, reorderLevel: 10, supplierLeadTimeDays: 7, dailyConsumption: 2 }), 'scorta critica: trigger');
ok(!stockCritical({ stockQuantity: 50, reorderLevel: 10, supplierLeadTimeDays: 7, dailyConsumption: 2 }), 'scorta critica: copertura sufficiente');
ok(!stockCritical({ stockQuantity: 5, reorderLevel: 10, supplierLeadTimeDays: 7, dailyConsumption: 0 }), 'scorta critica: no divisione per zero');

// Regola 2: Fido superato
ok(creditExceeded({ customerBalanceCents: 15000, customerLimitCents: 10000 }), 'fido superato: trigger');
ok(!creditExceeded({ customerBalanceCents: 5000, customerLimitCents: 10000 }), 'fido superato: sotto limite');

// Regola 3: Fattura in scadenza
ok(invoiceDue({ invoiceDueDate: new Date(Date.now() + 2 * 86400000).toISOString() }), 'fattura: 2 giorni');
ok(!invoiceDue({ invoiceDueDate: new Date(Date.now() + 10 * 86400000).toISOString() }), 'fattura: 10 giorni non trigger');
ok(invoiceDue({ invoiceDueDate: new Date(Date.now() - 0.5 * 86400000).toISOString() }), 'fattura: appena scaduta');
ok(!invoiceDue({ invoiceDueDate: new Date(Date.now() - 2 * 86400000).toISOString() }), 'fattura: scaduta da troppo non trigger');

// Regola 4: Incasso anomalo
ok(revenueAnomaly({ todayRevenueCents: 200000, meanRevenueCents: 100000, stdDevRevenueCents: 30000 }), 'incasso anomalo: z>2');
ok(!revenueAnomaly({ todayRevenueCents: 110000, meanRevenueCents: 100000, stdDevRevenueCents: 30000 }), 'incasso anomalo: z<2');
ok(!revenueAnomaly({ todayRevenueCents: 100000, meanRevenueCents: 100000, stdDevRevenueCents: 0 }), 'incasso anomalo: σ=0 non trigger');

// Regola 5: Cucina in ritardo
ok(kitchenSlow({ avgPrepMinutes: 20, slowWindowMinutes: 35 }), 'cucina lenta: trigger');
ok(!kitchenSlow({ avgPrepMinutes: 12, slowWindowMinutes: 35 }), 'cucina lenta: < 15 min');
ok(!kitchenSlow({ avgPrepMinutes: 20, slowWindowMinutes: 20 }), 'cucina lenta: finestra < 30 min');

// Regola 6: Costo lavoro alto
ok(laborCostHigh({ laborCostCents: 40000, projectedRevenueCents: 100000, laborCostPctThreshold: 30 }), 'costo lavoro: trigger');
ok(!laborCostHigh({ laborCostCents: 20000, projectedRevenueCents: 100000, laborCostPctThreshold: 30 }), 'costo lavoro: sotto soglia');
ok(!laborCostHigh({ laborCostCents: 40000, projectedRevenueCents: 0 }), 'costo lavoro: ricavo zero non trigger');

// Regola 7: Cassa non quadrata
ok(drawerShort({ drawerDifferenceCents: 500, drawerThresholdCents: 200 }), 'cassa: trigger');
ok(!drawerShort({ drawerDifferenceCents: 100, drawerThresholdCents: 200 }), 'cassa: sotto soglia');
ok(drawerShort({ drawerDifferenceCents: -500, drawerThresholdCents: 200 }), 'cassa: differenza negativa trigger');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
