/**
 * Genera lo script SQL idempotente per importare il menu nel DB (PostgreSQL).
 *   node --experimental-strip-types --loader ../../tests/ts-resolve.mjs apps/api/prisma/gen-menu-sql.mts
 * Emette apps/api/prisma/seed/menu_prices.sql e stampa un riepilogo/verifica.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { CATALOG, VENUE_ID, VENUE_NAME } from './menu.data.ts';

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const idFor = (code: string) => 'prod_' + code.toLowerCase().replace(/[^a-z0-9]+/g, '_');

// --- Verifiche ---
const codes = new Set<string>();
for (const it of CATALOG) {
  if (codes.has(it.code)) throw new Error('Codice duplicato: ' + it.code);
  codes.add(it.code);
  if (!(it.priceCents > 0)) throw new Error('Prezzo non valido per ' + it.name);
}

const lines: string[] = [];
lines.push('-- Import menu La Piazzetta — generato da menu.data.ts. Idempotente (ON CONFLICT).');
lines.push('BEGIN;');
lines.push('');
lines.push('-- Venue');
lines.push(
  `INSERT INTO "Venue" ("id","name","plan","createdAt","updatedAt") VALUES (${q(VENUE_ID)}, ${q(VENUE_NAME)}, 'PRO', now(), now())\n` +
  `ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = now();`,
);
lines.push('');
lines.push('-- Prodotti');
for (const it of CATALOG) {
  lines.push(
    `INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES (` +
    `${q(idFor(it.code))}, ${q(VENUE_ID)}, ${q(it.code)}, ${q(it.name)}, ${q(it.category)}, ${it.priceCents}, ${q(it.unit)}, now(), now())` +
    ` ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();` +
    (it.note ? ` -- ${it.note}` : ''),
  );
}
lines.push('');
lines.push('COMMIT;');

mkdirSync(new URL('./seed/', import.meta.url), { recursive: true });
writeFileSync(new URL('./seed/menu_prices.sql', import.meta.url), lines.join('\n') + '\n');

// File "tutto in uno" (schema completo + menu) per un solo paste nell'SQL Editor.
import { readFileSync } from 'node:fs';
try {
  const schema = readFileSync(new URL('./seed/schema_supabase.sql', import.meta.url), 'utf8');
  const combined =
    '-- ============================================================\n' +
    '--  La Piazzetta — TUTTO IN UNO (schema + menu) per Supabase SQL Editor.\n' +
    '--  Incolla ed esegui. Idempotente/rieseguibile.\n' +
    '-- ============================================================\n\n' +
    schema + '\n' + lines.join('\n') + '\n';
  writeFileSync(new URL('./seed/menu_import_supabase.sql', import.meta.url), combined);
  console.log('Scritto anche seed/menu_import_supabase.sql (schema + menu).');
} catch {
  console.log('schema_supabase.sql non trovato: salto il file tutto-in-uno.');
}

// Riepilogo
const byGroup = new Map<string, number>();
let min = Infinity, max = -Infinity;
for (const it of CATALOG) {
  byGroup.set(it.group, (byGroup.get(it.group) ?? 0) + 1);
  min = Math.min(min, it.priceCents); max = Math.max(max, it.priceCents);
}
console.log(`Prodotti totali: ${CATALOG.length} — codici univoci: ${codes.size}`);
console.log(`Prezzo min ${(min/100).toFixed(2)}€ · max ${(max/100).toFixed(2)}€`);
for (const [g, n] of byGroup) console.log(`  ${n.toString().padStart(3)}  ${g}`);
const ranged = CATALOG.filter(i => i.note);
console.log(`Voci a range (prezzo = limite inferiore, da confermare): ${ranged.map(i=>i.name).join(', ')}`);
