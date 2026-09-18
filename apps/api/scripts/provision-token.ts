/**
 * Genera un token monouso per il provisioning iniziale del locale (primo OWNER)
 * tramite il wizard web di /owner.
 *
 * Uso:
 *   npm run provision:token            # scadenza 24h
 *   npm run provision:token -- 72 "Apertura sede via Roma"
 *
 * Nel DB viene salvato SOLO l'hash SHA-256: il token in chiaro è stampato una
 * sola volta, qui. Consegnalo a chi configura il locale.
 */

import { PrismaClient } from '@prisma/client';
import { randomToken, sha256Hex } from '../src/auth/password.util';

const prisma = new PrismaClient();

async function main() {
  const hours = Number(process.argv[2]) || 24;
  const note = process.argv[3] || null;

  const ownerCount = await prisma.user.count({ where: { roles: { has: 'OWNER' } } });
  if (ownerCount > 0) {
    console.error('⚠️  Esiste già un utente OWNER: il provisioning via wizard è disabilitato.');
    console.error('   Per aggiungere altri utenti usa la gestione staff della dashboard.');
    process.exit(1);
  }

  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  await prisma.setupToken.create({ data: { tokenHash: sha256Hex(token), note, expiresAt } });

  console.log('\n  Token di provisioning (valido ' + hours + 'h, uso singolo):\n');
  console.log('    ' + token + '\n');
  console.log('  Apri  http://<host>:3000/owner  e incolla il token nel wizard di primo avvio.');
  console.log('  Scade il ' + expiresAt.toLocaleString('it-IT') + '\n');

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
