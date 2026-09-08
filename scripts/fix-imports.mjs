#!/usr/bin/env node
/**
 * Codemod: aggiunge l'estensione `.js` agli import/export relativi
 * estensionless in apps/api.
 *
 * Perché serve: `apps/api/tsconfig.json` usa `moduleResolution: NodeNext`, che
 * richiede l'estensione esplicita negli import ESM. Il codice la ometteva
 * ovunque, quindi `tsc` (e quindi `npm run build` / `npm start`) falliva con
 * TS2307 / TS2835. In dev non si notava perché `tsx` è tollerante.
 *
 * Convenzione TypeScript+ESM: nel sorgente si scrive `./ai.logic.js` anche se
 * il file su disco è `./ai.logic.ts`. È corretto: l'estensione si riferisce
 * all'output compilato.
 *
 * Uso:
 *   node scripts/fix-imports.mjs            # applica
 *   node scripts/fix-imports.mjs --dry-run  # mostra soltanto cosa cambierebbe
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TARGETS = ['apps/api/src', 'apps/api/prisma'];
const DRY = process.argv.includes('--dry-run');

/** `from '...'`, `import('...')`, `export ... from '...'` con path relativo. */
const SPECIFIER_RE = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (/\.(m?ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Un import va toccato solo se il file .ts corrispondente esiste davvero. */
function resolveTarget(fileDir, spec) {
  if (/\.(m?[jt]s|json|css)$/.test(spec)) return null; // già esplicito
  for (const cand of [`${spec}.ts`, `${spec}.mts`, `${spec}/index.ts`]) {
    if (existsSync(join(fileDir, cand))) {
      return cand.replace(/\.m?ts$/, (m) => (m === '.mts' ? '.mjs' : '.js'));
    }
  }
  return null;
}

let filesChanged = 0;
let importsChanged = 0;
const unresolved = [];

for (const target of TARGETS) {
  const abs = join(ROOT, target);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;

  for (const file of walk(abs)) {
    const src = readFileSync(file, 'utf8');
    let touched = 0;

    const next = src.replace(SPECIFIER_RE, (match, head, quote, spec) => {
      const rewritten = resolveTarget(dirname(file), spec);
      if (!rewritten) {
        if (!/\.(m?[jt]s|json|css)$/.test(spec)) {
          unresolved.push(`${file.slice(ROOT.length + 1)} -> ${spec}`);
        }
        return match;
      }
      touched++;
      return `${head}${quote}${rewritten}${quote}`;
    });

    if (touched > 0) {
      filesChanged++;
      importsChanged += touched;
      if (!DRY) writeFileSync(file, next);
      console.log(`${DRY ? '[dry] ' : ''}${file.slice(ROOT.length + 1)} — ${touched} import`);
    }
  }
}

console.log(`\n${DRY ? 'Da modificare' : 'Modificati'}: ${filesChanged} file, ${importsChanged} import.`);
if (unresolved.length > 0) {
  console.log(`\nNon risolti (${unresolved.length}) — da controllare a mano:`);
  for (const u of unresolved) console.log(`  ${u}`);
}
