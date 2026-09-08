#!/usr/bin/env bash
#
# Avvia l'ambiente di PROVA di La Piazzetta con un comando solo.
#
#   ./scripts/prova.sh          avvia tutto (database, build, seed, server)
#   ./scripts/prova.sh reset    azzera il database e riparte da zero
#   ./scripts/prova.sh stop     ferma il database
#
# Il backend serve anche le quattro web app, quindi dal telefono o dal tablet
# basta un solo indirizzo. Le app sono raggiungibili da chiunque sia sulla
# stessa rete Wi-Fi del locale.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; N=$'\e[0m'; else B=''; G=''; Y=''; N=''; fi
step() { printf '\n%s──▶ %s%s\n' "$B" "$1" "$N"; }

PORT="${PORT:-3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql://piazzetta:piazzetta@localhost:5432/lapiazzetta?schema=public}"
export JWT_SECRET="${JWT_SECRET:-prova-locale-non-per-produzione}"
export CORS_ORIGIN="${CORS_ORIGIN:-*}"
export PORT

# Indirizzo LAN del portatile: è quello che il personale digiterà sul telefono.
ip_lan() {
  if command -v ipconfig >/dev/null 2>&1; then          # macOS
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
  elif command -v ip >/dev/null 2>&1; then              # Linux
    ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+'
  fi
}

case "${1:-start}" in
  stop)
    docker compose down
    echo "Database fermato."
    exit 0
    ;;
  reset)
    step "Azzeramento del database"
    docker compose down -v
    ;;
esac

step "Database"
docker compose up -d
printf 'Attendo che Postgres risponda'
for _ in $(seq 1 40); do
  if docker compose exec -T db pg_isready -U piazzetta >/dev/null 2>&1; then echo " ok"; break; fi
  printf '.'; sleep 1
done

step "Dipendenze e client Prisma"
(cd apps/api && npm install --no-audit --no-fund && npx prisma generate)

step "Schema del database"
(cd apps/api && npx prisma migrate deploy)

step "Dati di prova"
(cd apps/api && npm run db:seed:menu && npm run db:seed:demo)

step "Build delle web app"
for app in web-owner web-waiter web-kds-bar web-kds-kitchen; do
  printf '  · %s\n' "$app"
  (cd "apps/$app" && npm install --no-audit --no-fund >/dev/null && npm run build >/dev/null)
done

LAN="$(ip_lan || true)"
BASE="http://${LAN:-localhost}:${PORT}"

cat <<BANNER

${G}${B}Ambiente di prova pronto.${N}

  Titolare    ${BASE}/owner
  Cameriere   ${BASE}/waiter
  KDS bar     ${BASE}/kds-bar
  KDS cucina  ${BASE}/kds-kitchen

  Accesso     titolare@lapiazzetta.local   password: Prova2026!
              banco@lapiazzetta.local      password: Prova2026!
              sala@lapiazzetta.local       password: Prova2026!
              cucina@lapiazzetta.local     password: Prova2026!

BANNER

if [[ -z "$LAN" ]]; then
  printf '%sIndirizzo LAN non rilevato: dal telefono usa l'"'"'IP del portatile al posto di localhost.%s\n\n' "$Y" "$N"
else
  printf 'Dal telefono o dal tablet, sulla stessa Wi-Fi, apri %s%s%s\n\n' "$B" "$BASE/waiter" "$N"
fi

printf 'Ctrl+C per fermare il server (il database resta acceso: %s./scripts/prova.sh stop%s per spegnerlo).\n\n' "$B" "$N"

step "Server"
cd apps/api && npm run dev
