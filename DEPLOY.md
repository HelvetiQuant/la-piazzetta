# Deploy — La Piazzetta

## Modello di deployment

Il backend è un processo Node.js nudo su un portatile in LAN. Postgres gira in Docker solo per sviluppo/CI locale. Non è un deploy cloud-native.

## Requisiti hardware

| Componente | Specifica minima |
|---|---|
| Server | Mac/PC con Node.js 22+, 8GB RAM, 20GB disco libero |
| Rete | LAN Wi-Fi/Ethernet con IP statico o DHCP reservation |
| Database | PostgreSQL 16 (Docker locale o esterno) |
| Staff devices | Tablet/PC con browser moderno (Chrome/Edge/Safari) |

## Setup produzione

```bash
# 1. Clone e installazione
git clone https://github.com/HelvetiQuant/la-piazzetta.git
cd la-piazzetta
npm ci

# 2. Configurazione
cp apps/api/.env.example apps/api/.env
# Modifica .env con valori reali:
#   DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, ecc.

# 3. Database (Docker locale)
docker compose up -d db
cd apps/api && npx prisma migrate deploy && cd ../..

# 4. Build
npm run build

# 5. Avvio (PM2 o systemd consigliati per produzione)
cd apps/api && npm run start
# Oppure con PM2:
# npm install -g pm2
# pm2 start dist/index.js --name la-piazzetta-api
# pm2 save
```

## URL dei servizi

Dopo l'avvio, il server espone:

| Servizio | URL | Porta |
|---|---|---|
| API | http://IP-LOCALE:3000 | 3000 |
| Owner web | http://IP-LOCALE:3000/owner | 3000 |
| Cameriere | http://IP-LOCALE:3000/waiter | 3000 |
| KDS Bar | http://IP-LOCALE:3000/kds-bar | 3000 |
| KDS Cucina | http://IP-LOCALE:3000/kds-kitchen | 3000 |
| WebSocket KDS | ws://IP-LOCALE:3000/ws | 3000 |
| Health | http://IP-LOCALE:3000/api/v1/health | 3000 |

## Configurazione rete LAN

Per garantire che gli staff devices trovino il server:

```bash
# Trova l'IP locale
ifconfig | grep "inet " | grep -v 127.0.0.1
# Oppure su Mac:
ipconfig getifaddr en0

# Esempio: 192.168.1.203
# Configura questo IP come VITE_API_URL nei frontend se diverso da localhost
```

**Suggerimento**: configura un IP statico o DHCP reservation sul router per il server.

## Aggiornamenti

```bash
git pull origin main
npm ci
npm run build
# Riavvia il processo
pm2 restart la-piazzetta-api
# Oppure:
docker compose restart api
```

## Backup

Il database Postgres è la fonte di verità. Backup regolari:

```bash
# Backup
docker compose exec db pg_dump -U piazzetta lapiazzetta > backup-$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U piazzetta lapiazzetta < backup-20260910.sql
```

## Limiti del modello

- **Non cloud-native**: il backend non scala orizzontalmente. Per multi-venue, serve un deploy diverso.
- **Single point of failure**: se il portatile si spegne, il servizio si ferma.
- **IP statico richiesto**: gli staff devices devono conoscere l'IP del server.

## Troubleshooting

| Problema | Soluzione |
|---|---|
| Frontend non carica | Verifica IP server e CORS_ORIGIN in .env |
| Login fallisce | Verifica JWT_SECRET e database popolato |
| KDS non aggiorna | Verifica WebSocket /ws raggiungibile |
| Job agente non parte | Verifica Venue e User OWNER nel DB |
