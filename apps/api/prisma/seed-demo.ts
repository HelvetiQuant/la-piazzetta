/**
 * Seed dell'ambiente di PROVA.
 *
 * Crea tutto ciò che serve per far provare le app al personale: utenti con
 * password note, tavoli, fornitori, clienti a credito e giacenze di magazzino.
 * Il menu prodotti resta a carico di `seed-menu.ts`, che va eseguito prima.
 *
 *   npm run db:seed:menu && npm run db:seed:demo
 *
 * Idempotente: si può rilanciare quante volte si vuole.
 *
 * ATTENZIONE: le password qui sotto sono deliberatamente semplici perché
 * l'ambiente è di prova su rete locale. Non usare questo seed in produzione.
 */
import { PrismaClient } from '@prisma/client';
import { VENUE_ID, VENUE_NAME } from './menu.data.js';
import { hashSecret } from '../src/auth/password.util.js';

const prisma = new PrismaClient();

/** Utenti di prova: un profilo per ruolo, così ognuno prova la sua app. */
const UTENTI = [
  { email: 'titolare@lapiazzetta.local', name: 'Titolare',  roles: ['OWNER', 'MANAGER'], password: 'Prova2026!', pin: '1111', hourlyRateCents: 0 },
  { email: 'banco@lapiazzetta.local',    name: 'Banco',     roles: ['BARMAN', 'CASHIER'], password: 'Prova2026!', pin: '2222', hourlyRateCents: 1100 },
  { email: 'sala@lapiazzetta.local',     name: 'Sala',      roles: ['WAITER'],            password: 'Prova2026!', pin: '3333', hourlyRateCents: 1050 },
  { email: 'cucina@lapiazzetta.local',   name: 'Cucina',    roles: ['COOK'],              password: 'Prova2026!', pin: '4444', hourlyRateCents: 1200 },
];

/**
 * Sala reale del locale: tre aree distinte.
 *   interni  5  — sala principale
 *   dehors   5  — dehors interno (coperto)
 *   esterni  N  — tavoli all'aperto: TAVOLI_ESTERNI da confermare
 */
const TAVOLI_ESTERNI = 6; // <-- da allineare al numero reale

const TAVOLI = [
  ...Array.from({ length: 5 }, (_, i) => ({ code: `${i + 1}`,  name: `Tavolo ${i + 1}`,  area: 'indoor',  seats: i < 2 ? 2 : 4 })),
  ...Array.from({ length: 5 }, (_, i) => ({ code: `D${i + 1}`, name: `Dehors ${i + 1}`,  area: 'dehors',  seats: 4 })),
  ...Array.from({ length: TAVOLI_ESTERNI }, (_, i) => ({ code: `E${i + 1}`, name: `Esterno ${i + 1}`, area: 'outdoor', seats: 4 })),
];

const FORNITORI = [
  { name: 'Caffè Liguria',        email: 'ordini@caffeliguria.local',   phone: '010 1234567', notes: 'Consegna martedì e venerdì' },
  { name: 'Panificio del Porto',  email: 'ordini@panificioporto.local', phone: '010 2345678', notes: 'Consegna giornaliera 06:30' },
  { name: 'Bevande Genova',       email: 'ordini@bevandegenova.local',  phone: '010 3456789', notes: 'Ordine minimo 200 €' },
];

const CLIENTI = [
  { name: 'Studio Rossi',        phone: '010 4567890', limitCents: 30000, balanceCents:  8500, notes: 'Pranzo di lavoro, saldo a fine mese' },
  { name: 'Officina Bianchi',    phone: '010 5678901', limitCents: 20000, balanceCents: 14200, notes: 'Colazioni squadra' },
  { name: 'Sig. Verdi',          phone: '010 6789012', limitCents:  5000, balanceCents:     0, notes: 'Cliente storico' },
];

async function main() {
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: { name: VENUE_NAME },
    create: { id: VENUE_ID, name: VENUE_NAME, plan: 'PRO' },
  });

  for (const u of UTENTI) {
    await prisma.user.upsert({
      where: { venueId_email: { venueId: VENUE_ID, email: u.email } },
      update: { name: u.name, roles: u.roles, hourlyRateCents: u.hourlyRateCents },
      create: {
        venueId: VENUE_ID,
        email: u.email,
        name: u.name,
        roles: u.roles,
        passwordHash: hashSecret(u.password),
        pin: hashSecret(u.pin),
        hourlyRateCents: u.hourlyRateCents,
      },
    });
  }

  for (const t of TAVOLI) {
    await prisma.table.upsert({
      where: { venueId_code: { venueId: VENUE_ID, code: t.code } },
      update: { name: t.name, area: t.area, seats: t.seats },
      create: { venueId: VENUE_ID, ...t },
    });
  }

  for (const f of FORNITORI) {
    const esistente = await prisma.supplier.findFirst({ where: { venueId: VENUE_ID, name: f.name } });
    if (esistente) {
      await prisma.supplier.update({ where: { id: esistente.id }, data: f });
    } else {
      await prisma.supplier.create({ data: { venueId: VENUE_ID, ...f } });
    }
  }

  for (const c of CLIENTI) {
    const esistente = await prisma.customer.findFirst({ where: { venueId: VENUE_ID, name: c.name } });
    if (esistente) {
      await prisma.customer.update({ where: { id: esistente.id }, data: c });
    } else {
      await prisma.customer.create({ data: { venueId: VENUE_ID, ...c } });
    }
  }

  // Giacenze: qualcuna volutamente sotto soglia, così il riordino AI ha
  // qualcosa da proporre e l'alert scorte non è vuoto.
  const prodotti = await prisma.product.findMany({ where: { venueId: VENUE_ID }, orderBy: { code: 'asc' } });
  let sottoSoglia = 0;
  for (const [i, p] of prodotti.entries()) {
    const scarso = i % 7 === 0 && sottoSoglia < 5;
    if (scarso) sottoSoglia++;
    await prisma.stockItem.upsert({
      where: { productId: p.id },
      update: {},
      create: {
        productId: p.id,
        quantity: scarso ? 2 : 40 + (i % 30),
        reorderLevel: 10,
        parLevel: 50,
      },
    });
  }

  console.log(`Ambiente di prova pronto per il venue ${VENUE_ID}:`);
  console.log(`  utenti    ${UTENTI.length}  (password comune: Prova2026!)`);
  console.log(`  tavoli    ${TAVOLI.length}  (5 interni, 5 dehors, ${TAVOLI_ESTERNI} esterni)`);
  console.log(`  fornitori ${FORNITORI.length}`);
  console.log(`  clienti   ${CLIENTI.length}`);
  console.log(`  giacenze  ${prodotti.length}  (${sottoSoglia} sotto soglia, per provare il riordino)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
