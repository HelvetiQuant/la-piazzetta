/**
 * AiService — orchestrazione unica su OpenAI + Anthropic.
 *
 * Responsabilità:
 *  - routing per task (config) e catena di fallback tra provider;
 *  - retry con backoff esponenziale + jitter sugli errori ritentabili;
 *  - budget mensile per task (enforcement prima della chiamata);
 *  - cache in-memory per i task deterministici (upsell/forecast/classify);
 *  - helper tipizzati per ciascun task di dominio.
 *
 * I provider sono chiamati con `fetch` reale (`ai.provider.ts`); qui non si
 * conosce il dettaglio HTTP, solo l'interfaccia `CompletionResult`.
 */

import { loadAiConfig, hasAnyProvider, type AiConfig } from './ai.config';
import {
  providerChain,
  backoffDelays,
  BudgetTracker,
  estimateCostCents,
  buildPrompt,
  parseJsonLoose,
  CACHEABLE_TASKS,
  type AiProvider,
  type AiTask,
} from './ai.logic';
import { callOpenAI, callAnthropic, ProviderError, type CompletionResult, type CallOptions } from './ai.provider';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RunResult<T = unknown> extends CompletionResult {
  task: AiTask;
  data: T | null; // parsing JSON (null se non parsabile)
  cached: boolean;
  costCents: number;
}

interface CacheEntry {
  at: number;
  result: RunResult;
}

export class AiDisabledError extends Error {
  constructor() {
    super('Nessun provider AI configurato (imposta OPENAI_API_KEY o ANTHROPIC_API_KEY).');
    this.name = 'AiDisabledError';
  }
}

export class AiBudgetExceededError extends Error {
  constructor() {
    super('Budget AI mensile esaurito.');
    this.name = 'AiBudgetExceededError';
  }
}

export class AiService {
  private readonly cfg: AiConfig;
  private readonly budget: BudgetTracker;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetchImpl?: typeof fetch;

  constructor(cfg?: Partial<AiConfig>, fetchImpl?: typeof fetch) {
    this.cfg = { ...loadAiConfig(), ...cfg } as AiConfig;
    this.budget = new BudgetTracker(this.cfg.monthlyBudgetCents);
    this.fetchImpl = fetchImpl;
  }

  isEnabled(): boolean {
    return hasAnyProvider(this.cfg);
  }

  budgetSpentCents(): number {
    return this.budget.spentCents();
  }

  private hasKey(p: AiProvider): boolean {
    return Boolean(p === 'openai' ? this.cfg.openai.apiKey : this.cfg.anthropic.apiKey);
  }

  private callProvider(p: AiProvider, prompt: { system: string; user: string }, opts: CallOptions): Promise<CompletionResult> {
    return p === 'openai'
      ? callOpenAI(this.cfg.openai, prompt, opts)
      : callAnthropic(this.cfg.anthropic, prompt, opts);
  }

  private cacheKey(task: AiTask, input: unknown): string {
    return `${task}:${JSON.stringify(input ?? {})}`;
  }

  /**
   * Esegue un task: routing → fallback tra provider → retry per-provider.
   * Applica cache (task deterministici) e budget. Lancia `AiDisabledError`
   * se nessun provider è configurato e `AiBudgetExceededError` se oltre cap.
   */
  async run<T = unknown>(task: AiTask, input: unknown): Promise<RunResult<T>> {
    if (!this.isEnabled()) throw new AiDisabledError();

    const cacheable = CACHEABLE_TASKS.has(task);
    const key = this.cacheKey(task, input);
    if (cacheable) {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < this.cfg.cacheTtlMs) {
        return { ...(hit.result as RunResult<T>), cached: true };
      }
    }

    // Preventivo di spesa: stima grezza su lunghezza prompt (4 char ≈ 1 token).
    const prompt = buildPrompt(task, input);
    const approxIn = Math.ceil((prompt.system.length + prompt.user.length) / 4);
    const primary = this.cfg.routing[task];
    const chainAll = providerChain(primary).filter((p) => this.hasKey(p));
    if (chainAll.length === 0) throw new AiDisabledError();

    const estModel = primary === 'anthropic' ? this.cfg.anthropic.model : this.cfg.openai.model;
    if (!this.budget.canSpend(estimateCostCents(estModel, approxIn, 400))) {
      throw new AiBudgetExceededError();
    }

    const opts: CallOptions = { timeoutMs: this.cfg.timeoutMs, fetchImpl: this.fetchImpl };
    let lastErr: unknown = null;

    for (const provider of chainAll) {
      const delays = [0, ...backoffDelays(this.cfg.maxRetries)];
      for (const delay of delays) {
        if (delay > 0) await sleep(delay);
        try {
          const completion = await this.callProvider(provider, prompt, opts);
          const costCents = estimateCostCents(completion.model, completion.inTokens, completion.outTokens);
          this.budget.record(costCents);
          const result: RunResult<T> = {
            ...completion,
            task,
            data: parseJsonLoose<T>(completion.text),
            cached: false,
            costCents,
          };
          if (cacheable) this.cache.set(key, { at: Date.now(), result: result as RunResult });
          return result;
        } catch (err) {
          lastErr = err;
          // Non ritentabile (401/400): passa subito al provider successivo.
          if (err instanceof ProviderError && !err.retryable) break;
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('AiService: tutte le chiamate fallite');
  }

  // ---- Helper di dominio (tipizzati) ----

  /** Upsell su un carrello (righe già scelte) dato un catalogo disponibile. */
  suggestUpsell(input: { cart: unknown; catalog: unknown }) {
    return this.run<{ suggestions: { productCode: string; reason: string }[] }>('upsell', input);
  }

  /** Previsione consumi da serie storiche per productId. */
  demandForecast(input: { history: Record<string, number[]>; horizonDays: number }) {
    return this.run<{ forecast: { productId: string; dailyUnits: number }[] }>('demand_forecast', input);
  }

  /** Testi social/email nel tono richiesto. */
  marketingCopy(input: { topic: string; tone: string; channels: string[] }) {
    return this.run<{ variants: { channel: string; text: string }[] }>('marketing_copy', input);
  }

  /** Proposta turni da vincoli e disponibilità (input anonimizzato). */
  shiftSuggestion(input: unknown) {
    return this.run<{ shifts: { employeeId: string; day: string; start: string; end: string }[] }>('shift_suggestion', input);
  }

  /** Classificazione evento arrivo da segnale edge (solo etichette/embedding). */
  classifyArrival(input: unknown) {
    return this.run<{ arrival: boolean; partySize: number; confidence: number }>('webcam_classify', input);
  }
}

/** Singleton lazy condiviso dai moduli route. */
let shared: AiService | null = null;
export function getAiService(): AiService {
  if (!shared) shared = new AiService();
  return shared;
}
