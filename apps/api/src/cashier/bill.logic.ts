/**
 * Logica pura della cassa: calcolo conto, split, sconti, resto, riconciliazione.
 *
 * Nessun I/O: niente Prisma, niente fetch, niente Date.now() implicito.
 * Tutto in centesimi di euro. La conversione in euro avviene solo al bordo
 * della UI.
 */

/** Canale di vendita: determina se il coperto si applica o no. */
export type SalesChannel = 'TABLE' | 'COUNTER' | 'TAKEAWAY';

/** Metodo di pagamento accettato (i buoni pasto NON sono accettati). */
export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT';

/** Riga di un ordine già pronta per il calcolo del conto. */
export interface BillItem {
  productId: string;
  name: string;
  /** Aliquota IVA in centesimi di punto: 1000 = 10%, 2200 = 22%. */
  vatRateCents: number;
  quantity: number;
  unitCents: number;
}

/** Sconto applicabile al conto. */
export interface Discount {
  /** 'PERCENT' = percentuale (0..100), 'AMOUNT' = importo fisso in centesimi. */
  type: 'PERCENT' | 'AMOUNT';
  /** Per PERCENT: punti percentuali * 100 (es. 1500 = 15%); per AMOUNT: centesimi. */
  valueCents: number;
}

/** Righe aggregate per aliquota IVA, per lo scontrino fiscale (Lotto 4). */
export interface VatBreakdownRow {
  vatRateCents: number;
  taxableCents: number;
  vatCents: number;
  totalCents: number;
}

/** Risultato del calcolo del conto. */
export interface Bill {
  items: BillItem[];
  guests: number;
  channel: SalesChannel;
  coverChargeCentsPerGuest: number;
  discount: Discount | null;
  /** Totale righe merce (prima del coperto e dello sconto). */
  itemsGrossCents: number;
  /** Coperto totale (guests × tariffa), 0 se canale non TABLE. */
  coverChargeTotalCents: number;
  /** Imponibile netto sconto (merce + coperto − sconto). */
  taxableCents: number;
  /** IVA totale. */
  vatTotalCents: number;
  /** Totale finale (imponibile + IVA). */
  totalCents: number;
  /** Dettaglio per aliquota IVA. */
  vatBreakdown: VatBreakdownRow[];
}

/** Tipo di split del conto. */
export type SplitMode =
  | { type: 'equal'; parts: number }
  | { type: 'byItems'; groups: BillItem[][] };

/** Porzione del conto dopo lo split. */
export interface BillPortion {
  totalCents: number;
  taxableCents: number;
  vatCents: number;
  coverShareCents: number;
  discountShareCents: number;
}

/** Risultato del calcolo del resto. */
export interface ChangeResult {
  ok: boolean;
  changeCents: number;
  error?: string;
}

/** Risultato della riconciliazione del cassetto. */
export interface DrawerReconciliation {
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  /** 'OK' se la differenza è zero, altrimenti 'SHORT' o 'OVER'. */
  verdict: 'OK' | 'SHORT' | 'OVER';
}

/**
 * Calcola il conto aggregato: righe merce, coperto (solo TABLE), sconto,
 * IVA per aliquota, totale.
 *
 * Lo sconto si applica sull'imponibile (merce + coperto), prima dell'IVA.
 */
export function computeBill(
  items: BillItem[],
  guests: number,
  coverChargeCentsPerGuest: number,
  discount: Discount | null,
  channel: SalesChannel,
): Bill {
  // Riga merce: imponibile = prezzo × quantità; IVA = imponibile × aliquota.
  const itemsGrossCents = items.reduce((s, it) => s + it.unitCents * it.quantity, 0);

  // Coperto: solo per servizio al tavolo, congelato all'apertura sessione.
  const coverChargeTotalCents = channel === 'TABLE'
    ? guests * coverChargeCentsPerGuest
    : 0;

  // Imponibile prima dello sconto.
  const baseCents = itemsGrossCents + coverChargeTotalCents;

  // Sconto: percentuale o importo fisso, mai negativo, mai superiore al totale.
  const discountCents = discount ? applyDiscount(discount, baseCents) : 0;
  const taxableCents = Math.max(0, baseCents - discountCents);

  // Ripartizione dello sconto sulle righe per aliquota IVA (proporzionale).
  // Per ogni aliquota: imponibile × (1 − sconto/base), arrotondato.
  const byVat = new Map<number, { taxable: number; vat: number }>();
  for (const it of items) {
    const lineTaxable = it.unitCents * it.quantity;
    const lineVat = Math.round(lineTaxable * it.vatRateCents / 10000);
    const key = it.vatRateCents;
    const prev = byVat.get(key) ?? { taxable: 0, vat: 0 };
    byVat.set(key, { taxable: prev.taxable + lineTaxable, vat: prev.vat + lineVat });
  }

  // Aggiungi il coperto all'aliquota del 10% (somministrazione).
  if (coverChargeTotalCents > 0) {
    const coverVat = Math.round(coverChargeTotalCents * 1000 / 10000);
    const prev = byVat.get(1000) ?? { taxable: 0, vat: 0 };
    byVat.set(1000, { taxable: prev.taxable + coverChargeTotalCents, vat: prev.vat + coverVat });
  }

  // Applica lo sconto proporzionalmente a ogni aliquota e ricalcola IVA.
  const vatBreakdown: VatBreakdownRow[] = [];
  let vatTotalCents = 0;
  let taxableAfterDiscount = 0;

  for (const [rate, { taxable }] of byVat) {
    const ratio = baseCents > 0 ? taxable / baseCents : 0;
    const discountedTaxable = Math.round(taxable * (1 - discountCents / baseCents));
    const discountedVat = Math.round(discountedTaxable * rate / 10000);
    vatBreakdown.push({
      vatRateCents: rate,
      taxableCents: discountedTaxable,
      vatCents: discountedVat,
      totalCents: discountedTaxable + discountedVat,
    });
    vatTotalCents += discountedVat;
    taxableAfterDiscount += discountedTaxable;
  }

  // Ricalcola il totale usando la somma delle righe scontate per evitare
  // discrepanze di arrotondamento.
  const totalCents = taxableAfterDiscount + vatTotalCents;

  return {
    items,
    guests,
    channel,
    coverChargeCentsPerGuest,
    discount,
    itemsGrossCents,
    coverChargeTotalCents,
    taxableCents: taxableAfterDiscount,
    vatTotalCents,
    totalCents,
    vatBreakdown,
  };
}

/**
 * Calcola l'importo dello sconto in centesimi. Mai negativo, mai superiore
 * al totale. `maxDiscountCents` (opzionale) limita gli sconti importo fisso.
 */
export function applyDiscount(discount: Discount, baseCents: number, maxDiscountCents?: number): number {
  let raw: number;
  if (discount.type === 'PERCENT') {
    // valueCents = punti percentuali × 100 (es. 1500 = 15%).
    raw = Math.round(baseCents * discount.valueCents / 10000);
  } else {
    raw = discount.valueCents;
  }
  if (maxDiscountCents !== undefined) raw = Math.min(raw, maxDiscountCents);
  raw = Math.max(0, Math.min(raw, baseCents));
  return raw;
}

/**
 * Divide il conto in N parti uguali. I resti di arrotondamento vengono
 * distribuiti sulle prime parti (mai persi).
 *
 * Invariante: la somma delle parti è sempre uguale al totale.
 */
export function splitBill(bill: Bill, mode: SplitMode): BillPortion[] {
  if (mode.type === 'equal') {
    const parts = Math.max(1, mode.parts);
    const total = bill.totalCents;
    const base = Math.floor(total / parts);
    const remainder = total - base * parts;
    const portions: BillPortion[] = [];
    for (let i = 0; i < parts; i++) {
      const totalCents = base + (i < remainder ? 1 : 0);
      // Ripartizione proporzionale di imponibile, IVA, coperto e sconto.
      const ratio = total > 0 ? totalCents / total : 0;
      portions.push({
        totalCents,
        taxableCents: Math.round(bill.taxableCents * ratio),
        vatCents: totalCents - Math.round(bill.taxableCents * ratio),
        coverShareCents: Math.round(bill.coverChargeTotalCents * ratio),
        discountShareCents: Math.round((bill.discount ? applyDiscount(bill.discount, bill.itemsGrossCents + bill.coverChargeTotalCents) : 0) * ratio),
      });
    }
    // Correggi l'ultima parte per garantire la somma esatta.
    if (portions.length > 0) {
      const sumTax = portions.reduce((s, p) => s + p.taxableCents, 0);
      const diff = bill.taxableCents - sumTax;
      portions[portions.length - 1].taxableCents += diff;
      portions[portions.length - 1].vatCents = portions[portions.length - 1].totalCents - portions[portions.length - 1].taxableCents;
    }
    return portions;
  }

  // Split per gruppi di righe: ogni gruppo è una porzione.
  // Il coperto e lo sconto si ripartiscono proporzionalmente al totale del gruppo.
  const groups = mode.groups;
  const groupTotals = groups.map(g => g.reduce((s, it) => s + it.unitCents * it.quantity, 0));
  const grandTotal = groupTotals.reduce((s, t) => s + t, 0) || 1;
  const portions: BillPortion[] = groups.map((_, i) => {
    const ratio = groupTotals[i] / grandTotal;
    const totalCents = Math.round(bill.totalCents * ratio);
    const taxableCents = Math.round(bill.taxableCents * ratio);
    return {
      totalCents,
      taxableCents,
      vatCents: totalCents - taxableCents,
      coverShareCents: Math.round(bill.coverChargeTotalCents * ratio),
      discountShareCents: Math.round((bill.discount ? applyDiscount(bill.discount, bill.itemsGrossCents + bill.coverChargeTotalCents) : 0) * ratio),
    };
  });
  // Correggi l'ultima parte per la somma esatta.
  if (portions.length > 0) {
    const sumTotal = portions.reduce((s, p) => s + p.totalCents, 0);
    const diff = bill.totalCents - sumTotal;
    portions[portions.length - 1].totalCents += diff;
  }
  return portions;
}

/**
 * Calcola il resto. Su pagamento con carta il resto è sempre 0 (non si dà
 * resto con la carta). Se l'importo versato è insufficiente, restituisce
 * errore.
 */
export function computeChange(totalCents: number, tenderedCents: number, method: PaymentMethod): ChangeResult {
  if (method === 'CARD' || method === 'CREDIT') {
    return { ok: true, changeCents: 0 };
  }
  if (tenderedCents < totalCents) {
    return { ok: false, changeCents: 0, error: `Importo insufficiente (richiesto ${totalCents}, versato ${tenderedCents})` };
  }
  return { ok: true, changeCents: tenderedCents - totalCents };
}

/**
 * Riconcilia il cassetto: confronta il totale contato a mano con quello
 * atteso (apertura + incassi contanti − resti).
 */
export function reconcileDrawer(openingCents: number, cashPaymentsCents: number, changeGivenCents: number, countedCents: number): DrawerReconciliation {
  const expectedCents = openingCents + cashPaymentsCents - changeGivenCents;
  const differenceCents = countedCents - expectedCents;
  const verdict: 'OK' | 'SHORT' | 'OVER' = differenceCents === 0 ? 'OK' : differenceCents < 0 ? 'SHORT' : 'OVER';
  return { expectedCents, countedCents, differenceCents, verdict };
}

/**
 * Determina la tariffa del coperto per un giorno della settimana.
 * `weekday` è ISO: 1 = lunedì, 7 = domenica.
 */
export function coverChargeForDay(weekdayCents: number, weekendCents: number, weekendDays: number[], weekday: number): number {
  return weekendDays.includes(weekday) ? weekendCents : weekdayCents;
}
