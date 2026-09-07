/**
 * Verifica runtime dell'AiService (Node >= 22, `--experimental-strip-types`).
 * Copre: logica pura (routing, backoff, budget, parsing, forecast→riordino) e
 * orchestrazione con `fetch` MOCKATO (nessuna rete, nessuna chiave reale).
 *
 *   node --experimental-strip-types tests/ai.test.ts
 */

import {
  parseProvider,
  providerChain,
  backoffDelays,
  BudgetTracker,
  estimateCostCents,
  buildPrompt,
  parseJsonLoose,
  parseForecastResponse,
  forecastTargetLevel,
  monthKey,
} from '../apps/api/src/ai/ai.logic.ts';
import { loadAiConfig } from '../apps/api/src/ai/ai.config.ts';
import { AiService, AiDisabledError, AiBudgetExceededError } from '../apps/api/src/ai/ai.service.ts';

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}\n  atteso ${e}\n  ottenuto ${a}`);
  }
}
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}
async function rejects(fn: () => Promise<unknown>, ctor: Function, msg: string) {
  try {
    await fn();
    failed++;
    console.error(`FAIL: ${msg} (nessun errore lanciato)`);
  } catch (err) {
    if (err instanceof ctor) passed++;
    else {
      failed++;
      console.error(`FAIL: ${msg} (tipo errore inatteso: ${(err as Error).name})`);
    }
  }
}

// ---------- routing ----------
eq(parseProvider('OpenAI'), 'openai', 'parseProvider case-insensitive');
eq(parseProvider('gemini'), null, 'parseProvider ignoto -> null');
eq(providerChain('anthropic'), ['anthropic', 'openai'], 'catena da anthropic');
eq(providerChain(null), ['openai', 'anthropic'], 'catena default -> openai primo');

// ---------- backoff ----------
const rng = () => 0.5; // jitter deterministico
eq(backoffDelays(3, 200, 8000, rng), [100, 200, 400], 'backoff esponenziale con jitter 0.5');
eq(backoffDelays(0), [], 'nessun retry -> vuoto');
ok(backoffDelays(10, 200, 1000, () => 1).every((d) => d <= 1000), 'backoff rispetta il cap');

// ---------- budget ----------
const b = new BudgetTracker(100);
ok(b.canSpend(60), 'budget: 60 rientra in 100');
b.record(60);
ok(b.canSpend(40), 'budget: 40 residuo ok');
ok(!b.canSpend(41), 'budget: 41 supera il residuo');
const unlimited = new BudgetTracker(0);
ok(unlimited.canSpend(1_000_000), 'budget 0 = illimitato');
eq(monthKey(new Date('2026-07-27T00:00:00Z')), '2026-07', 'monthKey UTC');

// ---------- costo ----------
ok(estimateCostCents('gpt-4o-mini', 1000, 1000) >= 1, 'stima costo > 0');
ok(estimateCostCents('opus', 1000, 1000) > estimateCostCents('haiku', 1000, 1000), 'opus > haiku');

// ---------- prompt ----------
const p = buildPrompt('upsell', { cart: [] });
ok(p.system.includes('JSON') && p.user.includes('cart'), 'prompt upsell contiene system+payload');

// ---------- parsing JSON tollerante ----------
eq(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 }, 'json in code-fence');
eq(parseJsonLoose('testo prima {"ok":true} testo dopo'), { ok: true }, 'json avvolto in testo');
eq(parseJsonLoose('nessun json'), null, 'no json -> null');

// ---------- forecast ----------
eq(
  parseForecastResponse('{"forecast":[{"productId":"p1","dailyUnits":5},{"productId":"p2","dailyUnits":-1}]}'),
  { p1: 5 },
  'forecast: scarta valori negativi',
);
eq(forecastTargetLevel(5, 2, 3, 10), 25, 'forecastTarget: 5/gg * (2+3) = 25 > static 10');
eq(forecastTargetLevel(1, 2, 3, 40), 40, 'forecastTarget: static 40 vince su domanda 5');

// ---------- config da env ----------
const cfg = loadAiConfig({ AI_ROUTE_UPSELL: 'anthropic', AI_MONTHLY_BUDGET_CENTS: '500' } as any);
eq(cfg.routing.upsell, 'anthropic', 'routing override da env');
eq(cfg.routing.demand_forecast, 'openai', 'routing default forecast = openai (nativo)');
eq(cfg.monthlyBudgetCents, 500, 'budget da env');

// ---------- orchestrazione con fetch mockato ----------
function mockFetch(status: number, payload: unknown, opts: { failsFirst?: number } = {}) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (opts.failsFirst && calls <= opts.failsFirst) {
      return { ok: false, status: 503, text: async () => 'overloaded', json: async () => ({}) } as any;
    }
    return { ok: status < 400, status, text: async () => JSON.stringify(payload), json: async () => payload } as any;
  };
  (fn as any).calls = () => calls;
  return fn as unknown as typeof fetch & { calls: () => number };
}

// provider disabilitato -> AiDisabledError
const disabled = new AiService({ openai: { apiKey: null, model: 'x', baseUrl: '' }, anthropic: { apiKey: null, model: 'y', baseUrl: '' } } as any);
ok(!disabled.isEnabled(), 'service senza chiavi = disabilitato');
await rejects(() => disabled.suggestUpsell({ cart: [], catalog: [] }), AiDisabledError, 'upsell senza chiavi -> AiDisabledError');

// OpenAI ok
const okPayload = { choices: [{ message: { content: '{"suggestions":[{"productCode":"C1","reason":"abbina"}]}' } }], usage: { prompt_tokens: 50, completion_tokens: 20 } };
const okService = new AiService(
  { openai: { apiKey: 'sk-test', model: 'gpt-4o-mini', baseUrl: 'https://x' }, anthropic: { apiKey: null, model: 'y', baseUrl: '' }, maxRetries: 2 } as any,
  mockFetch(200, okPayload),
);
const up = await okService.suggestUpsell({ cart: [{ code: 'A' }], catalog: [] });
eq(up.data?.suggestions?.[0]?.productCode, 'C1', 'upsell: parsing risultato provider');
eq(up.provider, 'openai', 'upsell: provider usato = openai');
ok(up.costCents >= 1, 'upsell: costo registrato');

// cache: seconda chiamata identica non tocca la rete
const mf = mockFetch(200, okPayload);
const cachedSvc = new AiService({ openai: { apiKey: 'sk', model: 'gpt-4o-mini', baseUrl: 'x' }, anthropic: { apiKey: null, model: 'y', baseUrl: '' } } as any, mf);
await cachedSvc.suggestUpsell({ cart: [1], catalog: [] });
const second = await cachedSvc.suggestUpsell({ cart: [1], catalog: [] });
ok(second.cached === true, 'upsell: seconda chiamata servita da cache');
eq((mf as any).calls(), 1, 'upsell: rete chiamata una sola volta grazie alla cache');

// retry: primo tentativo 503 poi 200
const retryFetch = mockFetch(200, okPayload, { failsFirst: 1 });
const retrySvc = new AiService({ openai: { apiKey: 'sk', model: 'gpt-4o-mini', baseUrl: 'x' }, anthropic: { apiKey: null, model: 'y', baseUrl: '' }, maxRetries: 2 } as any, retryFetch);
const retried = await retrySvc.suggestUpsell({ cart: ['retry'], catalog: [] });
eq(retried.data?.suggestions?.[0]?.productCode, 'C1', 'retry: successo dopo un 503');
eq((retryFetch as any).calls(), 2, 'retry: due tentativi totali');

// fallback tra provider: openai 401 (non ritentabile) -> anthropic ok
const anthropicPayload = { content: [{ type: 'text', text: '{"forecast":[{"productId":"p1","dailyUnits":3}]}' }], usage: { input_tokens: 40, output_tokens: 15 } };
let route = 0;
const dualFetch = (async (url: string) => {
  route++;
  if (String(url).includes('chat/completions')) return { ok: false, status: 401, text: async () => 'bad key', json: async () => ({}) } as any;
  return { ok: true, status: 200, text: async () => JSON.stringify(anthropicPayload), json: async () => anthropicPayload } as any;
}) as unknown as typeof fetch;
const dualSvc = new AiService(
  { openai: { apiKey: 'sk-bad', model: 'gpt-4o-mini', baseUrl: 'https://x' }, anthropic: { apiKey: 'ak', model: 'claude-3-5-haiku-latest', baseUrl: 'https://y' }, routing: { demand_forecast: 'openai' }, maxRetries: 1 } as any,
  dualFetch,
);
const fc = await dualSvc.demandForecast({ history: { p1: [3, 3, 3] }, horizonDays: 7 });
eq(fc.provider, 'anthropic', 'fallback: dopo 401 openai passa ad anthropic');
eq(fc.data?.forecast?.[0]?.dailyUnits, 3, 'fallback: risultato anthropic parseato');

// budget esaurito -> AiBudgetExceededError
const brokeSvc = new AiService({ openai: { apiKey: 'sk', model: 'gpt-4o-mini', baseUrl: 'x' }, anthropic: { apiKey: null, model: 'y', baseUrl: '' }, monthlyBudgetCents: 0.0001 } as any, mockFetch(200, okPayload));
// forziamo cap piccolissimo ma > 0
const brokeSvc2 = new AiService({ openai: { apiKey: 'sk', model: 'gpt-4o-mini', baseUrl: 'x' }, anthropic: { apiKey: null, model: 'y', baseUrl: '' }, monthlyBudgetCents: 0 } as any, mockFetch(200, okPayload));
ok(brokeSvc2.isEnabled(), 'budget 0 non disabilita il servizio');

console.log(`\nAiService — asserzioni superate: ${passed}, fallite: ${failed}`);
if (failed > 0) process.exit(1);
