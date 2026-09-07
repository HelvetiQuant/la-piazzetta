/**
 * Logica PURA dell'AiService — nessuna I/O, nessuna dipendenza, testabile in
 * isolamento (routing tra provider, catena di fallback, backoff, budget,
 * costruzione prompt, parsing risposte e fusione forecast → riordino).
 *
 * Tenuta separata dai provider reali (`ai.provider.ts`) e dall'orchestrazione
 * (`ai.service.ts`) esattamente come `reorder.logic.ts`/`prep-time.ts` fanno per
 * i loro moduli: così questa parte si verifica a runtime senza rete né chiavi.
 */

export type AiProvider = 'openai' | 'anthropic';

/** Task supportati. Ogni task ha un provider "preferito" instradabile da env. */
export type AiTask =
  | 'upsell'
  | 'demand_forecast'
  | 'marketing_copy'
  | 'shift_suggestion'
  | 'webcam_classify';

export const ALL_TASKS: AiTask[] = [
  'upsell',
  'demand_forecast',
  'marketing_copy',
  'shift_suggestion',
  'webcam_classify',
];

/** Task le cui risposte sono deterministiche a parità di input → cacheabili. */
export const CACHEABLE_TASKS: ReadonlySet<AiTask> = new Set<AiTask>([
  'upsell',
  'demand_forecast',
  'webcam_classify',
]);

export const PROVIDERS: AiProvider[] = ['openai', 'anthropic'];

/** Riconosce un provider valido, altrimenti `null`. */
export function parseProvider(value: string | undefined | null): AiProvider | null {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'openai' || v === 'anthropic' ? v : null;
}

/**
 * Catena di fallback a partire dal provider primario: prima il primario, poi
 * gli altri nell'ordine dichiarato. Se il primario non è valido si parte da
 * OpenAI. Nessun duplicato.
 */
export function providerChain(primary: AiProvider | null | undefined): AiProvider[] {
  const head: AiProvider = primary && PROVIDERS.includes(primary) ? primary : 'openai';
  return [head, ...PROVIDERS.filter((p) => p !== head)];
}

/**
 * Ritardi (ms) del retry con backoff esponenziale + full jitter.
 * `rng` è iniettabile per rendere il test deterministico (default Math.random).
 * Restituisce un array di lunghezza `retries` (0 → nessun retry).
 */
export function backoffDelays(retries: number, baseMs = 200, capMs = 8000, rng: () => number = Math.random): number[] {
  const n = Math.max(0, Math.trunc(retries));
  const out: number[] = [];
  for (let attempt = 0; attempt < n; attempt++) {
    const exp = Math.min(capMs, baseMs * 2 ** attempt);
    out.push(Math.round(exp * rng())); // full jitter: [0, exp]
  }
  return out;
}

/** Chiave di periodo mensile (UTC) per la contabilità del budget. */
export function monthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Prezzi indicativi in centesimi (EUR) per 1000 token, per stima budget.
 * Mappa per sottostringa del modello; fallback prudente se ignoto.
 */
const PRICE_PER_1K: { match: string; inCents: number; outCents: number }[] = [
  { match: 'gpt-4o-mini', inCents: 0.015, outCents: 0.06 },
  { match: 'gpt-4o', inCents: 0.25, outCents: 1.0 },
  { match: 'gpt-4.1-mini', inCents: 0.04, outCents: 0.16 },
  { match: 'haiku', inCents: 0.08, outCents: 0.4 },
  { match: 'sonnet', inCents: 0.3, outCents: 1.5 },
  { match: 'opus', inCents: 1.5, outCents: 7.5 },
];
const PRICE_FALLBACK = { inCents: 0.3, outCents: 1.5 };

/** Stima (in centesimi, arrotondata per eccesso) il costo di una chiamata. */
export function estimateCostCents(model: string, inTokens: number, outTokens: number): number {
  const m = (model || '').toLowerCase();
  const p = PRICE_PER_1K.find((x) => m.includes(x.match)) ?? PRICE_FALLBACK;
  const cents = (inTokens / 1000) * p.inCents + (outTokens / 1000) * p.outCents;
  return Math.ceil(cents);
}

/**
 * Contabilità del budget mensile AI. In-memory (per-processo); in produzione
 * andrà persistita su Redis/DB, ma l'algoritmo di enforcement è questo.
 */
export class BudgetTracker {
  private spent = new Map<string, number>();
  private readonly monthlyCapCents: number;
  constructor(monthlyCapCents: number) {
    this.monthlyCapCents = monthlyCapCents;
  }

  /** Centesimi spesi nel periodo. */
  spentCents(now: Date = new Date()): number {
    return this.spent.get(monthKey(now)) ?? 0;
  }

  /** `true` se una spesa stimata rientra nel cap (cap 0/negativo = illimitato). */
  canSpend(estimateCents: number, now: Date = new Date()): boolean {
    if (this.monthlyCapCents <= 0) return true;
    return this.spentCents(now) + Math.max(0, estimateCents) <= this.monthlyCapCents;
  }

  /** Registra una spesa effettiva. Ritorna il nuovo totale del periodo. */
  record(costCents: number, now: Date = new Date()): number {
    const k = monthKey(now);
    const next = (this.spent.get(k) ?? 0) + Math.max(0, costCents);
    this.spent.set(k, next);
    return next;
  }
}

// ===================================================================
//  Costruzione prompt per task (input SEMPRE anonimizzato: nessun nome
//  cliente/dipendente, solo ID/etichette — coerente con la nota GDPR).
// ===================================================================

export interface ChatMessages {
  system: string;
  user: string;
}

export function buildPrompt(task: AiTask, input: unknown): ChatMessages {
  const payload = JSON.stringify(input ?? {});
  switch (task) {
    case 'upsell':
      return {
        system:
          'Sei il maître digitale di un bar e tavola calda italiano. Suggerisci upsell pertinenti ' +
          'e non invadenti (max 3), coerenti con gli articoli ordinati. Rispondi SOLO con JSON ' +
          '{"suggestions":[{"productCode":string,"reason":string}]}.',
        user: `Carrello e catalogo disponibile: ${payload}`,
      };
    case 'demand_forecast':
      return {
        system:
          'Sei un analista di previsione della domanda per la ristorazione. Dato lo storico consumi ' +
          'per prodotto, stima le unità di consumo giornaliere attese per i prossimi giorni. Rispondi ' +
          'SOLO con JSON {"forecast":[{"productId":string,"dailyUnits":number}]}.',
        user: `Serie storiche (per productId): ${payload}`,
      };
    case 'marketing_copy':
      return {
        system:
          'Sei un copywriter per un locale italiano. Genera testi social/email nel tono richiesto, ' +
          'in italiano, pronti alla pubblicazione. Rispondi SOLO con JSON ' +
          '{"variants":[{"channel":string,"text":string}]}.',
        user: `Brief: ${payload}`,
      };
    case 'shift_suggestion':
      return {
        system:
          'Sei un pianificatore di turni. Rispetta copertura per fascia, monte ore, riposi e ' +
          'preferenze. Input anonimizzato (solo employeeId). Rispondi SOLO con JSON ' +
          '{"shifts":[{"employeeId":string,"day":string,"start":string,"end":string}]}.',
        user: `Vincoli e disponibilità: ${payload}`,
      };
    case 'webcam_classify':
      return {
        system:
          'Classifichi eventi di arrivo clienti dall\'esterno del locale a partire SOLO da ' +
          'etichette/embedding (nessuna immagine). Rispondi SOLO con JSON ' +
          '{"arrival":boolean,"partySize":number,"confidence":number}.',
        user: `Segnale edge: ${payload}`,
      };
  }
}

/** Parsing tollerante di JSON eventualmente avvolto in testo/markdown. */
export function parseJsonLoose<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  // prova dall'ultima parentesi di chiusura compatibile all'indietro
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end);
    const last = slice.trim().slice(-1);
    if (last !== '}' && last !== ']') continue;
    try {
      return JSON.parse(slice) as T;
    } catch {
      /* continua a restringere */
    }
  }
  return null;
}

/** Normalizza la risposta di `demand_forecast` in mappa productId → unità/giorno. */
export function parseForecastResponse(raw: string): Record<string, number> {
  const parsed = parseJsonLoose<{ forecast?: { productId: string; dailyUnits: number }[] }>(raw);
  const out: Record<string, number> = {};
  for (const f of parsed?.forecast ?? []) {
    if (f && typeof f.productId === 'string' && Number.isFinite(f.dailyUnits) && f.dailyUnits >= 0) {
      out[f.productId] = f.dailyUnits;
    }
  }
  return out;
}

/**
 * Fonde una previsione di domanda nella soglia/target di riordino: il livello
 * target diventa almeno il consumo previsto sull'orizzonte (giorni di lead time
 * + copertura di sicurezza). NON sostituisce `computeReorder`: ne alza il target
 * quando il forecast indica consumi superiori alla configurazione statica.
 */
export function forecastTargetLevel(
  dailyUnits: number,
  leadTimeDays: number,
  safetyDays: number,
  staticTarget: number,
): number {
  const horizon = Math.max(0, leadTimeDays) + Math.max(0, safetyDays);
  const demandTarget = Math.ceil(Math.max(0, dailyUnits) * horizon);
  return Math.max(staticTarget, demandTarget);
}
