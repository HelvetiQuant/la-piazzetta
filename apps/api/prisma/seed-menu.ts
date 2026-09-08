/**
 * Seed del menu nel DB via Prisma (idempotente: upsert su (venueId, code)).
 * Esecuzione:  npx prisma db seed   oppure   node --experimental-strip-types (con tsx/ts-node)
 * Richiede DATABASE_URL e `@prisma/client` generato.
 */

import { PrismaClient } from '@prisma/client';
import { CATALOG, VENUE_ID, VENUE_NAME } from './menu.data.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { name: VENUE_NAME },
    create: { id: VENUE_ID, name: VENUE_NAME, plan: 'PRO' },
  });

  let done = 0;
  for (const it of CATALOG) {
    await prisma.product.upsert({
      where: { venueId_code: { venueId: VENUE_ID, code: it.code } },
      update: { name: it.name, category: it.category, priceCents: it.priceCents, unit: it.unit },
      create: { venueId: VENUE_ID, code: it.code, name: it.name, category: it.category, priceCents: it.priceCents, unit: it.unit },
    });
    done++;
  }
  console.log(`Menu importato: ${done} prodotti nel venue ${VENUE_ID}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
