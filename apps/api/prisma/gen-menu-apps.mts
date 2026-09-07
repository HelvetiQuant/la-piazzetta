/**
 * Genera apps/shared/menu.js dal catalogo unico (menu.data.ts), così le webapp
 * usano gli STESSI prodotti/prezzi importati nel DB.
 *   node --experimental-strip-types apps/api/prisma/gen-menu-apps.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { CATALOG } from './menu.data.ts';

// Postazione derivata dalla categoria (allineata a stations.ts).
const KITCHEN = new Set(['tavola_calda']);
const dep = (cat: string) => (KITCHEN.has(cat) ? 'kit' : 'bar');

// Raggruppa per sezione di menu preservando l'ordine di apparizione.
const groups: { c: string; dep: string; items: [string, number][] }[] = [];
const idx = new Map<string, number>();
for (const it of CATALOG) {
  if (!idx.has(it.group)) {
    idx.set(it.group, groups.length);
    groups.push({ c: it.group, dep: dep(it.category), items: [] });
  }
  groups[idx.get(it.group)!].items.push([it.name, it.priceCents]);
}

// Pool nomi per i KDS (comande demo realistiche).
const barPool = CATALOG.filter((i) => dep(i.category) === 'bar' && i.priceCents <= 1000).map((i) => i.name);
const kitchenPool = CATALOG.filter((i) => dep(i.category) === 'kit').map((i) => i.name);

const out =
  '/* GENERATO da apps/api/prisma/menu.data.ts — non modificare a mano. */\n' +
  'window.PIAZZETTA_MENU = ' + JSON.stringify(groups) + ';\n' +
  'window.PIAZZETTA_KDS_BAR = ' + JSON.stringify(barPool) + ';\n' +
  'window.PIAZZETTA_KDS_KITCHEN = ' + JSON.stringify(kitchenPool) + ';\n';

mkdirSync(new URL('../../shared/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../shared/menu.js', import.meta.url), out);
console.log(`Scritto apps/shared/menu.js — ${groups.length} sezioni, ${CATALOG.length} prodotti; pool bar ${barPool.length}, cucina ${kitchenPool.length}.`);
