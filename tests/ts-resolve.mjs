// Resolver hook per i test: mappa gli import relativi sui sorgenti TypeScript,
// così Node può caricarli con --experimental-strip-types senza bundler.
//
// Copre due casi:
//  1. `./ai.logic.js`  -> `./ai.logic.ts`   (convenzione TS+ESM con NodeNext,
//     dove nel sorgente si scrive l'estensione dell'output compilato)
//  2. `./ai.logic`     -> `./ai.logic.ts`   (import estensionless residui)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Prova un candidato relativo: se il file esiste, delega al resolver di default. */
function tryCandidate(candidate, context, nextResolve) {
  try {
    const base = context.parentURL ?? import.meta.url;
    if (existsSync(fileURLToPath(new URL(candidate, base)))) {
      return nextResolve(candidate, context);
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    // Caso 1: .js/.mjs dichiarato nel sorgente -> file .ts/.mts su disco.
    const asSource = specifier.replace(/\.m?js$/, (m) => (m === '.mjs' ? '.mts' : '.ts'));
    if (asSource !== specifier) {
      const hit = tryCandidate(asSource, context, nextResolve);
      if (hit) return hit;
    }

    // Caso 2: import estensionless.
    if (!/\.[mc]?[jt]s$/.test(specifier)) {
      for (const ext of ['.ts', '.mts', '/index.ts']) {
        const hit = tryCandidate(specifier + ext, context, nextResolve);
        if (hit) return hit;
      }
    }
  }

  return nextResolve(specifier, context);
}
