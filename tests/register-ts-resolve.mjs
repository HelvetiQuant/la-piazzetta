// Registra il resolver hook (API stabile, sostituisce --experimental-loader).
// Uso: node --experimental-strip-types --import ./tests/register-ts-resolve.mjs <test>
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-resolve.mjs', pathToFileURL(import.meta.filename));
