// Resolver hook: mappa gli import relativi estensionless (convenzione TS del
// progetto) sui file .ts corrispondenti, così Node può caricarli con
// --experimental-strip-types senza bundler. Solo per i test in questo ambiente.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[mc]?[jt]s$/.test(specifier)) {
    try {
      const base = context.parentURL ?? import.meta.url;
      const asTs = new URL(specifier + '.ts', base);
      if (existsSync(fileURLToPath(asTs))) {
        return nextResolve(specifier + '.ts', context);
      }
    } catch {
      /* fallthrough al resolver di default */
    }
  }
  return nextResolve(specifier, context);
}
