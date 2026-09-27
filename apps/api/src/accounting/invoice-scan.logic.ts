/**
 * Logica PURA dello scan fatture fornitori — parsing della risposta AI (vision),
 * normalizzazione partita IVA/ragione sociale e matching deterministico
 * fornitore. Nessuna I/O: testabile in isolamento.
 */

export interface ScannedLineItem {
  description: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number | null;
}

export interface ScannedInvoice {
  supplierName: string;
  supplierVat: string | null;
  supplierAddress: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null;
  netAmountCents: number;
  vatRate: number;
  vatAmountCents: number;
  totalAmountCents: number;
  lineItems: ScannedLineItem[];
  confidence: number;
}

/** Normalizza P.IVA: solo cifre, toglie prefisso IT e non-cifre. */
export function normalizeVat(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  const trimmed = digits.length === 13 && digits.startsWith('39') ? digits.slice(2) : digits;
  return trimmed.length === 11 ? trimmed : null;
}

/** Normalizza ragione sociale per confronto: lowercase, no punteggiatura/legali. */
export function normalizeSupplierName(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|srl|spa|sas|snc|di|e|c)\b\.?/g, ' ')
    .replace(/[^a-z0-9àèéìòù]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True se la ragione sociale letta dall'AI è probabilmente il nostro locale
 * (l'AI può confondere il riquadro DESTINATARIO con l'emittente).
 * Confronto per token "forti" (≥4 char) del nome venue: es. venue
 * "La Piazzetta" → token {piazzetta}; OCR "PIAZZETTA DI CHIARELLO ANTONINO
 * E SOCIETA' S.S." → match → da marcare per revisione, non creare fornitore.
 */
export function isLikelyBuyer(supplierName: string, venueName: string | null | undefined): boolean {
  const venueTokens = normalizeSupplierName(venueName).split(' ').filter((t) => t.length >= 4);
  if (venueTokens.length === 0) return false;
  const supplierTokens = new Set(normalizeSupplierName(supplierName).split(' '));
  return venueTokens.every((t) => supplierTokens.has(t));
}

function eurosToCents(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // tollera formato italiano gg/mm/aaaa
  const it = v.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (it) {
    const [, d, mo, y] = it;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/**
 * Valida e normalizza il JSON estratto dall'AI vision. Ritorna null se i campi
 * minimi (nome fornitore + numero + data + totale) mancano o non sono validi.
 */
export function parseScannedInvoice(data: unknown): ScannedInvoice | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const supplierName = typeof d.supplierName === 'string' ? d.supplierName.trim() : '';
  const invoiceNumber = typeof d.invoiceNumber === 'string' ? d.invoiceNumber.trim() : '';
  const invoiceDate = isoDate(d.invoiceDate);
  const totalAmountCents = eurosToCents(d.totalEuros);
  if (!supplierName || !invoiceNumber || !invoiceDate || totalAmountCents <= 0) return null;

  const netAmountCents = eurosToCents(d.netAmountEuros);
  const vatAmountCents = eurosToCents(d.vatAmountEuros);
  const vatRate = Number.isFinite(Number(d.vatRate)) ? Number(d.vatRate) : 22;

  const lineItems: ScannedLineItem[] = Array.isArray(d.lineItems)
    ? d.lineItems
        .map((li): ScannedLineItem | null => {
          if (!li || typeof li !== 'object') return null;
          const l = li as Record<string, unknown>;
          const description = typeof l.description === 'string' ? l.description.trim() : '';
          const qty = Number(l.qty);
          if (!description || !Number.isFinite(qty) || qty <= 0) return null;
          return {
            description,
            qty,
            unitPriceCents: eurosToCents(l.unitPriceEuros),
            vatRate: Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : null,
          };
        })
        .filter((x): x is ScannedLineItem => x !== null)
    : [];

  const confidence = Number.isFinite(Number(d.confidence)) ? Math.min(1, Math.max(0, Number(d.confidence))) : 0.5;

  return {
    supplierName,
    supplierVat: normalizeVat(d.supplierVat as string),
    supplierAddress: typeof d.supplierAddress === 'string' ? d.supplierAddress.trim() || null : null,
    supplierEmail: typeof d.supplierEmail === 'string' ? d.supplierEmail.trim() || null : null,
    supplierPhone: typeof d.supplierPhone === 'string' ? d.supplierPhone.trim() || null : null,
    invoiceNumber,
    invoiceDate,
    dueDate: isoDate(d.dueDate),
    // Se l'AI non distingue netto/IVA li ricaviamo dal totale con l'aliquota
    netAmountCents: netAmountCents > 0 ? netAmountCents : Math.round(totalAmountCents / (1 + vatRate / 100)),
    vatRate,
    vatAmountCents: vatAmountCents > 0 ? vatAmountCents : totalAmountCents - Math.round(totalAmountCents / (1 + vatRate / 100)),
    totalAmountCents,
    lineItems,
    confidence,
  };
}

export type SupplierMatchKind = 'vat' | 'name' | 'none';

interface SupplierLike {
  id: string;
  name: string;
  vatNumber?: string | null;
}

/**
 * Match deterministico del fornitore: prima P.IVA esatta, poi ragione sociale
 * normalizzata (uguaglianza o prefisso). Ritorna il candidato o null.
 */
export function matchSupplier(
  suppliers: SupplierLike[],
  scanned: Pick<ScannedInvoice, 'supplierName' | 'supplierVat'>,
): { supplier: SupplierLike; kind: SupplierMatchKind } | null {
  const vat = normalizeVat(scanned.supplierVat);
  if (vat) {
    const byVat = suppliers.find((s) => normalizeVat(s.vatNumber) === vat);
    if (byVat) return { supplier: byVat, kind: 'vat' };
  }
  const want = normalizeSupplierName(scanned.supplierName);
  if (!want) return null;
  const exact = suppliers.find((s) => normalizeSupplierName(s.name) === want);
  if (exact) return { supplier: exact, kind: 'name' };
  const pref = suppliers.find((s) => {
    const n = normalizeSupplierName(s.name);
    return n.length >= 4 && (n.startsWith(want) || want.startsWith(n));
  });
  return pref ? { supplier: pref, kind: 'name' } : null;
}
