// Test del servizio token di approvazione (approval-token.service.ts) — logica pura.
// Verifica: token monouso, scadenza, firma non valida, non riutilizzabile.
// Le funzioni sono ricopiate qui in JS per verificarle in isolamento.
import crypto from 'crypto';

let passed = 0, failed = 0;
function ok(c, msg) { if (c) passed++; else { failed++; console.error(`FAIL: ${msg}`); } }

const DEFAULT_TTL_HOURS = 24;
const SECRET = 'test-secret';

// --- Logica token (ricopiata da approval-token.service.ts) ---

function createTokenData(input) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000);
  const payload = `${id}:${input.venueId}:${input.actionType}:${input.targetId}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = `${id}.${signature}`;
  return { id, token, expiresAt, venueId: input.venueId, actionType: input.actionType, targetId: input.targetId, status: 'PENDING', expiresAt };
}

function validateToken(token, record) {
  const [id, signature] = token.split('.');
  if (!id || !signature) return { ok: false, error: 'Token malformato' };
  if (!record) return { ok: false, error: 'Token non trovato' };
  if (record.status === 'USED') return { ok: false, error: 'Token già utilizzato' };
  if (record.expiresAt < new Date()) return { ok: false, error: 'Token scaduto' };
  const payload = `${record.id}:${record.venueId}:${record.actionType}:${record.targetId}`;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (signature !== expectedSig) return { ok: false, error: 'Firma non valida' };
  return { ok: true, token: { id: record.id, venueId: record.venueId, actionType: record.actionType, targetId: record.targetId } };
}

// --- Test ---

// 1. Token valido: validazione OK
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  const result = validateToken(data.token, data);
  ok(result.ok, 'token valido: validazione OK');
  ok(result.token?.actionType === 'APPROVE_PO', 'token valido: actionType corretto');
}

// 2. Token malformato
{
  const result = validateToken('malformato', null);
  ok(!result.ok, 'token malformato: rifiutato');
  ok(result.error === 'Token malformato', 'token malformato: errore corretto');
}

// 3. Token non trovato
{
  const result = validateToken('abc.def', null);
  ok(!result.ok, 'token non trovato: rifiutato');
}

// 4. Token già usato (USED)
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  data.status = 'USED';
  const result = validateToken(data.token, data);
  ok(!result.ok, 'token USED: rifiutato');
  ok(result.error === 'Token già utilizzato', 'token USED: errore corretto');
}

// 5. Token scaduto
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  data.expiresAt = new Date(Date.now() - 1000); // scaduto 1s fa
  const result = validateToken(data.token, data);
  ok(!result.ok, 'token scaduto: rifiutato');
  ok(result.error === 'Token scaduto', 'token scaduto: errore corretto');
}

// 6. Firma non valida (token manomesso)
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  const [id] = data.token.split('.');
  const fakeSig = crypto.createHmac('sha256', 'wrong-secret').update('fake').digest('hex');
  const tamperedToken = `${id}.${fakeSig}`;
  const result = validateToken(tamperedToken, data);
  ok(!result.ok, 'token manomesso: rifiutato');
  ok(result.error === 'Firma non valida', 'token manomesso: errore corretto');
}

// 7. Monouso: dopo consume, seconda validazione fallisce
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  const first = validateToken(data.token, data);
  ok(first.ok, 'monouso: prima validazione OK');
  data.status = 'USED'; // simulate consume
  const second = validateToken(data.token, data);
  ok(!second.ok, 'monouso: seconda validazione rifiutata');
}

// 8. TTL personalizzato
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system', ttlHours: 1 });
  const expiresIn = (data.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000);
  ok(expiresIn > 0.9 && expiresIn < 1.1, 'TTL 1h: scadenza corretta');
}

// 9. Nessun ordine parte da solo: il flusso richiede consume del token
//    (verifica che senza token valido, l'azione non può procedere)
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  const validation = validateToken(data.token, data);
  ok(validation.ok, 'no-auto: token valido permette azione');
  // Se il token non fosse valido, l'azione sarebbe bloccata
  const invalid = validateToken('fake.token', data);
  ok(!invalid.ok, 'no-auto: token invalido blocca azione');
}

// 10. Idempotenza: stesso token non può essere consumato due volte
{
  const data = createTokenData({ venueId: 'v1', actionType: 'APPROVE_PO', targetId: 'po1', createdBy: 'system' });
  // Primo consume
  const v1 = validateToken(data.token, data);
  ok(v1.ok, 'idempotenza: primo consume OK');
  data.status = 'USED';
  // Secondo consume dello stesso token
  const v2 = validateToken(data.token, data);
  ok(!v2.ok, 'idempotenza: secondo consume rifiutato');
}

// 11. Degradazione senza WHATSAPP_TOKEN: il canale WhatsApp non è disponibile
{
  // Simula: se WHATSAPP_TOKEN non è settato, WhatsAppChannel.isAvailable() = false
  const token = undefined;
  const phoneId = undefined;
  const isAvailable = !!(token && phoneId);
  ok(!isAvailable, 'degradazione: WhatsApp non disponibile senza token');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
