/**
 * Motore di regole dell'agente: logica pura, valutabile senza database.
 *
 * Ogni regola ha un trigger, una condizione, una severity, i canali
 * preferiti, un cooldown e un builder di messaggio.
 *
 * 7 regole iniziali (vedi PROMPT_IMPLEMENTAZIONE 3.2):
 * 1. Scorta critica: giacenza sotto soglia e lead-time fornitore > giorni di copertura.
 * 2. Fido superato: credito cliente oltre limitCents.
 * 3. Fattura in scadenza: fattura fornitore non pagata a 3 giorni dalla scadenza.
 * 4. Incasso anomalo: incasso giornaliero fuori ±2σ rispetto allo stesso giorno settimana (8 settimane).
 * 5. Cucina in ritardo: tempo medio preparazione > 15 min per 30 min consecutivi.
 * 6. Costo lavoro alto: costo lavoro > soglia % del ricavo previsto.
 * 7. Cassa non quadrata: differenza di cassa oltre soglia alla chiusura.
 */

import type { Message } from '../notifications/channel.port.js';

export type Severity = 'info' | 'warning' | 'urgent';
export type TriggerType = 'STOCK_CRITICAL' | 'CREDIT_EXCEEDED' | 'INVOICE_DUE' | 'REVENUE_ANOMALY' | 'KITCHEN_SLOW' | 'LABOR_COST_HIGH' | 'DRAWER_SHORT';

export interface RuleContext {
  venueId: string;
  // Scorta critica
  productName?: string;
  stockQuantity?: number;
  reorderLevel?: number;
  supplierLeadTimeDays?: number;
  dailyConsumption?: number;
  // Fido
  customerName?: string;
  customerBalanceCents?: number;
  customerLimitCents?: number;
  // Fattura
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDueDate?: string;
  invoiceTotalCents?: number;
  // Incasso anomalo
  todayRevenueCents?: number;
  meanRevenueCents?: number;
  stdDevRevenueCents?: number;
  // Cucina
  avgPrepMinutes?: number;
  slowWindowMinutes?: number;
  // Costo lavoro
  laborCostCents?: number;
  projectedRevenueCents?: number;
  laborCostPctThreshold?: number;
  // Cassa
  drawerDifferenceCents?: number;
  drawerThresholdCents?: number;
}

export interface Rule {
  id: string;
  trigger: TriggerType;
  condition: (ctx: RuleContext) => boolean;
  severity: Severity;
  channels: string[];
  cooldownMinutes: number;
  buildMessage: (ctx: RuleContext) => Message;
}

export const RULES: Rule[] = [
  {
    id: 'stock-critical',
    trigger: 'STOCK_CRITICAL',
    condition: (ctx) => {
      if (ctx.stockQuantity === undefined || ctx.reorderLevel === undefined) return false;
      if (ctx.supplierLeadTimeDays === undefined || ctx.dailyConsumption === undefined || ctx.dailyConsumption === 0) return false;
      const below = ctx.stockQuantity <= ctx.reorderLevel;
      const coverageDays = ctx.stockQuantity / ctx.dailyConsumption;
      const leadTimeExceedsCoverage = ctx.supplierLeadTimeDays > coverageDays;
      return below && leadTimeExceedsCoverage;
    },
    severity: 'urgent',
    channels: ['whatsapp', 'email', 'inapp'],
    cooldownMinutes: 360,
    buildMessage: (ctx) => ({
      title: 'Scorta critica',
      body: `${ctx.productName ?? 'Prodotto'}: ${ctx.stockQuantity} ${ctx.dailyConsumption !== undefined ? `unità, ${Math.floor(ctx.stockQuantity! / ctx.dailyConsumption)} giorni di copertura. Lead-time fornitore: ${ctx.supplierLeadTimeDays} giorni.` : ''} Riordinare subito.`,
      severity: 'urgent',
    }),
  },
  {
    id: 'credit-exceeded',
    trigger: 'CREDIT_EXCEEDED',
    condition: (ctx) => {
      if (ctx.customerBalanceCents === undefined || ctx.customerLimitCents === undefined) return false;
      return ctx.customerBalanceCents > ctx.customerLimitCents;
    },
    severity: 'warning',
    channels: ['whatsapp', 'email', 'inapp'],
    cooldownMinutes: 1440,
    buildMessage: (ctx) => ({
      title: 'Fido superato',
      body: `${ctx.customerName ?? 'Cliente'} ha superato il fido: saldo €${(ctx.customerBalanceCents! / 100).toFixed(2)} su limite €${(ctx.customerLimitCents! / 100).toFixed(2)}.`,
      severity: 'warning',
    }),
  },
  {
    id: 'invoice-due',
    trigger: 'INVOICE_DUE',
    condition: (ctx) => {
      if (!ctx.invoiceDueDate) return false;
      const due = new Date(ctx.invoiceDueDate);
      const now = new Date();
      const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 3 && diffDays >= -1; // a 3 giorni dalla scadenza o appena scaduta
    },
    severity: 'warning',
    channels: ['email', 'inapp'],
    cooldownMinutes: 720,
    buildMessage: (ctx) => ({
      title: 'Fattura in scadenza',
      body: `Fattura ${ctx.invoiceNumber ?? ''} di ${ctx.supplierName ?? ''} per €${((ctx.invoiceTotalCents ?? 0) / 100).toFixed(2)} scade il ${ctx.invoiceDueDate}.`,
      severity: 'warning',
    }),
  },
  {
    id: 'revenue-anomaly',
    trigger: 'REVENUE_ANOMALY',
    condition: (ctx) => {
      if (ctx.todayRevenueCents === undefined || ctx.meanRevenueCents === undefined || ctx.stdDevRevenueCents === undefined) return false;
      if (ctx.stdDevRevenueCents === 0) return false;
      const z = Math.abs(ctx.todayRevenueCents - ctx.meanRevenueCents) / ctx.stdDevRevenueCents;
      return z > 2; // fuori ±2σ
    },
    severity: 'info',
    channels: ['inapp'],
    cooldownMinutes: 720,
    buildMessage: (ctx) => ({
      title: 'Incasso anomalo',
      body: `Incasso oggi €${((ctx.todayRevenueCents ?? 0) / 100).toFixed(2)}, media storica €${((ctx.meanRevenueCents ?? 0) / 100).toFixed(2)} (±2σ). Verificare.`,
      severity: 'info',
    }),
  },
  {
    id: 'kitchen-slow',
    trigger: 'KITCHEN_SLOW',
    condition: (ctx) => {
      if (ctx.avgPrepMinutes === undefined || ctx.slowWindowMinutes === undefined) return false;
      return ctx.avgPrepMinutes > 15 && ctx.slowWindowMinutes >= 30;
    },
    severity: 'warning',
    channels: ['inapp'],
    cooldownMinutes: 120,
    buildMessage: (ctx) => ({
      title: 'Cucina in ritardo',
      body: `Tempo medio preparazione ${ctx.avgPrepMinutes} min negli ultimi ${ctx.slowWindowMinutes} min. Soglia 15 min.`,
      severity: 'warning',
    }),
  },
  {
    id: 'labor-cost-high',
    trigger: 'LABOR_COST_HIGH',
    condition: (ctx) => {
      if (ctx.laborCostCents === undefined || ctx.projectedRevenueCents === undefined || ctx.projectedRevenueCents === 0) return false;
      const pct = (ctx.laborCostCents / ctx.projectedRevenueCents) * 100;
      return pct > (ctx.laborCostPctThreshold ?? 30);
    },
    severity: 'warning',
    channels: ['inapp'],
    cooldownMinutes: 720,
    buildMessage: (ctx) => ({
      title: 'Costo lavoro alto',
      body: `Costo lavoro €${((ctx.laborCostCents ?? 0) / 100).toFixed(2)} = ${((ctx.laborCostCents ?? 0) / (ctx.projectedRevenueCents ?? 1) * 100).toFixed(1)}% del ricavo previsto €${((ctx.projectedRevenueCents ?? 0) / 100).toFixed(2)}. Soglia ${ctx.laborCostPctThreshold ?? 30}%.`,
      severity: 'warning',
    }),
  },
  {
    id: 'drawer-short',
    trigger: 'DRAWER_SHORT',
    condition: (ctx) => {
      if (ctx.drawerDifferenceCents === undefined || ctx.drawerThresholdCents === undefined) return false;
      return Math.abs(ctx.drawerDifferenceCents) > ctx.drawerThresholdCents;
    },
    severity: 'urgent',
    channels: ['whatsapp', 'email', 'inapp'],
    cooldownMinutes: 720,
    buildMessage: (ctx) => ({
      title: 'Cassa non quadrata',
      body: `Differenza cassa €${((ctx.drawerDifferenceCents ?? 0) / 100).toFixed(2)} (soglia €${((ctx.drawerThresholdCents ?? 0) / 100).toFixed(2)}). Verificare al chiusura.`,
      severity: 'urgent',
    }),
  },
];

/** Valuta tutte le regole contro un contesto e ritorna i messaggi da inviare. */
export function evaluateRules(ctx: RuleContext): Array<{ rule: Rule; message: Message }> {
  const results: Array<{ rule: Rule; message: Message }> = [];
  for (const rule of RULES) {
    if (rule.condition(ctx)) {
      results.push({ rule, message: rule.buildMessage(ctx) });
    }
  }
  return results;
}
