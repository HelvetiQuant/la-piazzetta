import { PrismaClient } from '@prisma/client';
import { hashSecret } from '../src/auth/password.util';
import { randomBytes, scryptSync } from 'node:crypto';

const p = new PrismaClient();

const users = [
  { id: 'owner1', email: 'owner@piazzetta.it', name: 'Nino', roles: ['OWNER'], password: 'owner123', pin: '1234', hourlyRateCents: 0 },
  { id: 'beatrice', email: 'beatrice@piazzetta.it', name: 'Beatrice', roles: ['WAITER', 'BARMAN'], password: 'beatrice123', pin: '1111', hourlyRateCents: 1200 },
  { id: 'alessia', email: 'alessia@piazzetta.it', name: 'Alessia', roles: ['WAITER', 'BARMAN'], password: 'alessia123', pin: '2222', hourlyRateCents: 1200 },
  { id: 'edoardo', email: 'edoardo@piazzetta.it', name: 'Edoardo', roles: ['WAITER', 'BARMAN'], password: 'edoardo123', pin: '3333', hourlyRateCents: 1200 },
  { id: 'davide', email: 'davide@piazzetta.it', name: 'Davide', roles: ['COOK'], password: 'davide123', pin: '4444', hourlyRateCents: 1500 },
  { id: 'karim', email: 'karim@piazzetta.it', name: 'Karim', roles: ['COOK'], password: 'karim123', pin: '5555', hourlyRateCents: 1500 },
];

async function main() {
  for (const u of users) {
    const pwHash = hashSecret(u.password);
    const pinHash = hashSecret(u.pin);
    const data = {
      email: u.email,
      name: u.name,
      roles: u.roles,
      passwordHash: pwHash,
      pin: pinHash,
      hourlyRateCents: u.hourlyRateCents,
    };
    const user = await p.user.upsert({
      where: { id: u.id },
      create: { id: u.id, venueId: 'venue_piazzetta', ...data },
      update: data,
    });
    console.log(`OK: ${user.id} — ${user.name} [${user.roles.join(',')}] tariffa=${user.hourlyRateCents/100}€/h`);
  }
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
