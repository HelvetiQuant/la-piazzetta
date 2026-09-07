# La Piazzetta — avvio locale (backend su portatile + frontend web)

Architettura di riferimento: `ARCHITETTURA_TECNICA.md`. Questa guida copre solo
**come far girare tutto**, con il backend su un portatile in sala/cucina e i
frontend usati da tablet/telefoni/altri PC sulla stessa rete (Wi-Fi).

## 1. Backend (`apps/api`) — sul portatile

Requisiti: Node.js 20+, Docker (per Postgres locale).

```bash
# Postgres locale in un container, dati persistenti nel volume `pgdata`
docker compose up -d

cd apps/api
cp .env.example .env
# genera un JWT_SECRET vero, es: openssl rand -hex 32   → incollalo in .env

npm install
npx prisma generate
npx prisma migrate deploy    # crea le tabelle
npm run db:seed:menu         # importa il menu (161 prodotti)

npm run dev                  # http://localhost:3000
```

Verifica: `curl http://localhost:3000/api/v1/health` → `{"ok":true,...}`.

**Trovare l'IP del portatile in LAN** (serve ai frontend per raggiungere l'API):
- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`
- Windows: `ipconfig` → "Indirizzo IPv4"

Es. `192.168.1.50`. L'API sarà raggiungibile da altri device sulla stessa rete
su `http://192.168.1.50:3000/api/v1`.

### Creare i primi utenti

Non c'è ancora una UI di provisioning: il primo utente (owner) va creato a mano
via Prisma Studio o una query diretta, impostando `passwordHash` (scrypt, vedi
`src/auth/password.util.ts`) o un `pin`. Da lì si può gestire il resto via API.

## 2. Frontend — web app moderne (Vite + React + TypeScript)

Ogni app ha il proprio `.env` con l'URL dell'API:

```bash
cd apps/web-owner   # o web-waiter, web-kds-bar, web-kds-kitchen
cp .env.example .env
# imposta VITE_API_URL=http://192.168.1.50:3000/api/v1 (l'IP del portatile)
npm install
npm run dev
```

| App              | Porta dev | Uso                                              |
|-------------------|-----------|---------------------------------------------------|
| `web-owner`       | 5173      | Dashboard proprietario (magazzino, fornitori, crediti, statistiche) |
| `web-waiter`      | 5174      | App cameriere: sala, comande, carrello            |
| `web-kds-bar`     | 5175      | Schermo cucina/bar — postazione BAR               |
| `web-kds-kitchen` | 5176      | Schermo cucina/bar — postazione TAVOLA_CALDA      |

Per l'uso reale in sala, ogni frontend va **buildato** e servito come sito
statico (su un tablet in kiosk mode, o su qualunque device con un browser che
punti all'IP del portatile):

```bash
npm run build      # genera dist/
npm run preview    # serve dist/ in locale per test (porta 4173+)
```

In produzione conviene servire ogni `dist/` con un web server statico leggero
(es. `npx serve dist`) sullo stesso portatile o su un secondo device, oppure
aprire direttamente `http://<ip-portatile>:<porta-preview>` dai tablet di sala.

### Login

- **Owner** (`web-owner`): email+password oppure PIN.
- **Cameriere** (`web-waiter`): PIN (pensato per device condiviso in sala).
- **KDS** (`web-kds-*`): PIN, login una volta per turno sullo schermo fisso.

## 3. Cosa NON è ancora collegato (debito tecnico)

Vedi `CHANGELOG.md` (voce di oggi) e `ARCHITETTURA_TECNICA.md` §18:
- Nessun endpoint per chiudere una sessione tavolo / liberare il tavolo dopo il
  pagamento (l'app cameriere non lo espone di conseguenza).
- Redis/BullMQ e cache entitlement in produzione (ora fallback in-memory, ok
  per singolo portatile, da rivedere se si scala a più istanze).
- Moduli ancora solo-UI/non costruiti: `cash-treasury`, `chat`, `staff-shifts`,
  `cashier-pos` (scontrino fiscale IT), `vision`.
- `employee-mobile` resta un'app mobile (React Native) separata, non convertita
  in web app in questo giro di lavoro.
