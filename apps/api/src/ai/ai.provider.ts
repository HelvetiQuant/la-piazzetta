/**
 * Integrazione REALE con OpenAI e Anthropic.
 *
 * Usa `fetch` nativo (Node >= 18) verso gli endpoint HTTP ufficiali — nessuna
 * dipendenza SDK aggiuntiva, stessa filosofia "crypto/HTTP nativi" del resto del
 * progetto. Timeout via AbortController. Gli errori distinguono i casi
 * ritentabili (429/5x/network) da quelli permanenti (401/400) per far decidere
 * il retry/fallback all'orchestratore.
 */

import type { ProviderConfig } from './ai.config';
import type { ChatMessages } from './ai.logic';

export interface CompletionResult {
  text: string;
  provider: 'openai' | 'anthropic';
  model: string;
  inTokens: number;
  outTokens: number;
}

/** Errore di provider con flag di ritentabilità per l'orchestratore. */
export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = retryable;
    this.status = status;
  }
}

export interface CallOptions {
  timeoutMs: number;
  maxOutputTokens?: number;
  temperature?: number;
  /** iniettabile nei test per non toccare la rete */
  fetchImpl?: typeof fetch;
}

function statusIsRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await run(ctrl.signal);
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    // abort o errore di rete → ritentabile
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`Errore di rete/timeout: ${msg}`, true);
  } finally {
    clearTimeout(t);
  }
}

/** OpenAI Chat Completions. */
export async function callOpenAI(cfg: ProviderConfig, messages: ChatMessages, opts: CallOptions): Promise<CompletionResult> {
  if (!cfg.apiKey) throw new ProviderError('OPENAI_API_KEY mancante', false, 401);
  const doFetch = opts.fetchImpl ?? fetch;

  return withTimeout(opts.timeoutMs, async (signal) => {
    const resp = await doFetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxOutputTokens ?? 800,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new ProviderError(`OpenAI ${resp.status}: ${body.slice(0, 300)}`, statusIsRetryable(resp.status), resp.status);
    }

    const data: any = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    return {
      text,
      provider: 'openai',
      model: cfg.model,
      inTokens: data?.usage?.prompt_tokens ?? 0,
      outTokens: data?.usage?.completion_tokens ?? 0,
    };
  });
}

/** Anthropic Messages. */
export async function callAnthropic(cfg: ProviderConfig, messages: ChatMessages, opts: CallOptions): Promise<CompletionResult> {
  if (!cfg.apiKey) throw new ProviderError('ANTHROPIC_API_KEY mancante', false, 401);
  const doFetch = opts.fetchImpl ?? fetch;

  return withTimeout(opts.timeoutMs, async (signal) => {
    const resp = await doFetch(`${cfg.baseUrl}/messages`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        system: messages.system,
        max_tokens: opts.maxOutputTokens ?? 800,
        temperature: opts.temperature ?? 0.4,
        messages: [{ role: 'user', content: messages.user }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new ProviderError(`Anthropic ${resp.status}: ${body.slice(0, 300)}`, statusIsRetryable(resp.status), resp.status);
    }

    const data: any = await resp.json();
    const text: string = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
      : '';
    return {
      text,
      provider: 'anthropic',
      model: cfg.model,
      inTokens: data?.usage?.input_tokens ?? 0,
      outTokens: data?.usage?.output_tokens ?? 0,
    };
  });
}
