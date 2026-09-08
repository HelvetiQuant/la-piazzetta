/**
 * Configurazione dell'AiService letta dall'ambiente (`process.env`).
 * Le chiavi NON stanno mai nel repository: qui si leggono da env/vault e si
 * espone `.env.example` come riferimento.
 */

import { parseProvider, ALL_TASKS, type AiProvider, type AiTask } from './ai.logic.js';

export interface ProviderConfig {
  apiKey: string | null;
  model: string;
  baseUrl: string;
}

export interface AiConfig {
  openai: ProviderConfig;
  anthropic: ProviderConfig;
  /** provider preferito per ciascun task */
  routing: Record<AiTask, AiProvider>;
  maxRetries: number;
  timeoutMs: number;
  monthlyBudgetCents: number;
  cacheTtlMs: number;
  /** copertura di sicurezza (giorni) sommata al lead time nel forecast riordino */
  forecastSafetyDays: number;
}

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Routing di default per task: **OpenAI è il provider nativo** (scelta del
 * titolare). Anthropic resta disponibile come fallback automatico e come
 * override per singolo task via env (`AI_ROUTE_<TASK>=anthropic`).
 */
const DEFAULT_ROUTING: Record<AiTask, AiProvider> = {
  upsell: 'openai',
  demand_forecast: 'openai',
  marketing_copy: 'openai',
  shift_suggestion: 'openai',
  webcam_classify: 'openai',
};

/** Nome della variabile di routing per un task, es. AI_ROUTE_DEMAND_FORECAST. */
function routeEnvKey(task: AiTask): string {
  return `AI_ROUTE_${task.toUpperCase()}`;
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const routing = {} as Record<AiTask, AiProvider>;
  for (const task of ALL_TASKS) {
    routing[task] = parseProvider(env[routeEnvKey(task)]) ?? DEFAULT_ROUTING[task];
  }

  return {
    openai: {
      apiKey: env.OPENAI_API_KEY ?? null,
      model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY ?? null,
      model: env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest',
      baseUrl: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
    },
    routing,
    maxRetries: num(env.AI_MAX_RETRIES, 2),
    timeoutMs: num(env.AI_TIMEOUT_MS, 20000),
    monthlyBudgetCents: num(env.AI_MONTHLY_BUDGET_CENTS, 0), // 0 = illimitato
    cacheTtlMs: num(env.AI_CACHE_TTL_MS, 10 * 60 * 1000),
    forecastSafetyDays: num(env.AI_FORECAST_SAFETY_DAYS, 3),
  };
}

/** True se almeno un provider ha la chiave configurata. */
export function hasAnyProvider(cfg: AiConfig): boolean {
  return Boolean(cfg.openai.apiKey || cfg.anthropic.apiKey);
}
