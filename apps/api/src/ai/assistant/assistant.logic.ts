/**
 * Assistente AI dell'owner — logica pura (nessun DB, nessuna rete).
 *
 * Protocollo: il modello risponde SEMPRE con JSON:
 *   {"reply": "..."}                         → risposta finale all'utente
 *   {"tool_calls": [{"name","args"}]}        → richiesta di eseguire strumenti
 * Dopo i tool results si richiama il modello con il transcript aggiornato.
 * Guardia: MAX_STEPS per evitare loop infiniti.
 */

export interface ToolDef {
  name: string;
  description: string;
  /** parametri descritti in linguaggio naturale (JSON nel prompt) */
  args: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type AssistantResponse =
  | { type: 'reply'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] };

export const MAX_STEPS = 6;

/** Strumenti a disposizione dell'assistente (nomi stabili = contratto). */
export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'sales_report',
    description: 'Incassi: totale, per giorno e per metodo di pagamento in un intervallo di date.',
    args: '{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} — es. ultimi 3 giorni: from=today-2, to=today',
  },
  {
    name: 'staff_availability',
    description: 'Disponibilità e turni del personale per una data (chi è disponibile, chi è già in turno).',
    args: '{"date":"YYYY-MM-DD","role?":"BARMAN|WAITER|KITCHEN","fromHour?":number,"toHour?":number}',
  },
  {
    name: 'inventory_status',
    description: 'Giacenze di magazzino; con lowOnly=true solo articoli sotto scorta minima.',
    args: '{"lowOnly?":boolean}',
  },
  {
    name: 'orders_summary',
    description: 'Stato ordini/tavoli in tempo reale (aperti, in preparazione, pronti).',
    args: '{}',
  },
  {
    name: 'credit_report',
    description: 'Crediti clienti: saldi aperti e movimenti recenti.',
    args: '{}',
  },
  {
    name: 'draft_marketing_post',
    description: 'Crea una BOZZA di post social (caption+hashtag AI). Non pubblica: resta in bozze per revisione owner.',
    args: '{"topic":string,"tone":string,"channels":["instagram"|"facebook"],"mediaAssetId?":string,"scheduledFor?":"YYYY-MM-DD"}',
  },
  {
    name: 'schedule_instruction',
    description:
      'Registra un comando differito da eseguire quando accade un evento. ' +
      'Es. "quando carico la foto, prepara il post": trigger=media_upload.',
    args: '{"triggerType":"media_upload"|"scheduled","description":string,"payload":{...}} — payload es. {topic,tone,channels,date}',
  },
  {
    name: 'list_pending_instructions',
    description: 'Elenca i comandi differiti ancora in attesa.',
    args: '{}',
  },
];

export function buildSystemPrompt(venueName: string, now: Date): string {
  const dateStr = now.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const tools = TOOL_DEFS.map((t) => `- ${t.name}: ${t.description} Argomenti JSON: ${t.args}`).join('\n');
  return `Sei l'assistente gestionale di "${venueName}", un bar/tavola calda italiano. Parli con il titolare.
Oggi è ${dateStr} (${now.toISOString().slice(0, 10)}). Rispondi SEMPRE in italiano, tono professionale ma diretto.

Hai accesso a strumenti per leggere i dati reali del locale e compiere azioni:
${tools}

REGOLE:
1. Per rispondere con testo all'utente: {"reply": "testo"}
2. Per usare strumenti: {"tool_calls": [{"name": "nome", "args": {...}}]}  (puoi chiederne più di uno)
3. Dopo i risultati degli strumenti riceverai il transcript aggiornato: rispondi con {"reply": ...} finale.
4. NON inventare mai numeri/dati: se ti serve un dato, usa lo strumento. Se uno strumento fallisce, dillo onestamente.
5. Date relative ("venerdì", "ultimi 3 giorni") → converti in YYYY-MM-DD rispetto a oggi.
6. "Le ragazze del bar" / "il banco" → ruolo BARMAN. "Le ragazze di sala" → WAITER. Cucina → KITCHEN.
7. Comandi differiti ("quando ti mando/carico X, fai Y") → usa schedule_instruction e conferma cosa hai registrato.
8. Mai pubblicare sui social: draft_marketing_post crea solo BOZZE che l'owner revisiona.
9. Risposte concise: elenchi puntati brevi, cifre in euro con 2 decimali.`;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
}

/** Serializza la conversazione in un unico messaggio user (provider single-turn). */
export function serializeTranscript(history: TranscriptEntry[], limit = 24): string {
  const slice = history.slice(-limit);
  return slice
    .map((m) => {
      if (m.role === 'user') return `TITOLARE: ${m.content}`;
      if (m.role === 'tool') return `RISULTATO ${m.toolName ?? 'tool'}: ${m.content}`;
      return `ASSISTENTE: ${m.content}`;
    })
    .join('\n\n');
}

interface LooseJson {
  reply?: unknown;
  tool_calls?: unknown;
}

/** Interpreta la risposta JSON del modello: reply finale o richiesta strumenti. */
export function parseAssistantResponse(raw: string, parseJson: (s: string) => LooseJson | null): AssistantResponse {
  const parsed = parseJson(raw);
  if (!parsed) {
    // Il modello ha risposto in testo libero: lo trattiamo come reply.
    return { type: 'reply', text: raw.trim() };
  }
  if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
    const calls: ToolCall[] = [];
    for (const c of parsed.tool_calls) {
      const name = (c as { name?: unknown })?.name;
      if (typeof name === 'string' && TOOL_DEFS.some((t) => t.name === name)) {
        const args = (c as { args?: unknown })?.args;
        calls.push({ name, args: typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {} });
      }
    }
    if (calls.length > 0) return { type: 'tool_calls', calls };
  }
  if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
    return { type: 'reply', text: parsed.reply.trim() };
  }
  return { type: 'reply', text: 'Non ho capito bene — puoi riformulare?' };
}
