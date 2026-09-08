#!/usr/bin/env bash
#
# Pipeline di CI di La Piazzetta.
#
# Pensata per girare dentro il container definito da docker/ci.Dockerfile, ma
# funziona anche direttamente sul portatile (serve Node 22+).
#
#   ./scripts/ci.sh all        pipeline completa (default)
#   ./scripts/ci.sh api        solo backend
#   ./scripts/ci.sh web        solo le 4 web app
#   ./scripts/ci.sh logic      solo i test di logica pura (velocissimo, no npm install)
#   ./scripts/ci.sh migrate    applica le migration al Postgres di CI
#
# Ogni step è isolato: la pipeline prosegue e alla fine stampa un riepilogo,
# così un giro solo mostra TUTTI i problemi invece del primo.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

WEB_APPS=(web-owner web-waiter web-kds-bar web-kds-kitchen)

# ─── output ────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'
else
  R=''; G=''; Y=''; B=''; N=''
fi

FAILED=()
PASSED=()
SKIPPED=()

step() { printf '\n%s──▶ %s%s\n' "$B" "$1" "$N"; }

run() {
  local name="$1"; shift
  step "$name"
  if "$@"; then
    PASSED+=("$name")
    printf '%s✓ %s%s\n' "$G" "$name" "$N"
  else
    FAILED+=("$name")
    printf '%s✗ %s%s\n' "$R" "$name" "$N"
  fi
}

skip() {
  SKIPPED+=("$1")
  printf '%s⊘ %s — %s%s\n' "$Y" "$1" "$2" "$N"
}

# ─── step ──────────────────────────────────────────────────────────────────

# npm ci quando c'è un lockfile coerente, altrimenti npm install.
install_deps() {
  local dir="$1"
  if [[ -f "$dir/package-lock.json" ]]; then
    (cd "$dir" && npm ci --ignore-scripts) || (cd "$dir" && npm install --ignore-scripts)
  else
    (cd "$dir" && npm install --ignore-scripts)
  fi
}

# Con npm workspaces, un solo npm ci in radice installa tutto:
# api, 4 web app e i 3 pacchetti condivisi (api-client, ui, shared-components).
ci_install_root() {
  if [[ -f package-lock.json ]]; then
    npm ci --ignore-scripts || npm install --ignore-scripts
  else
    npm install --ignore-scripts
  fi
}

ci_logic() {
  # Nessuna dipendenza: gira anche senza npm install. È il primo segnale utile.
  node tests/verify.mjs \
    && node tests/verify-inventory.mjs \
    && node tests/verify-purchase.mjs \
    && node tests/verify-bill.mjs \
    && node tests/verify-rules.mjs \
    && node tests/verify-approval.mjs
}

ci_api_prisma()    { (cd apps/api && npx prisma generate); }
ci_api_validate()  { (cd apps/api && npx prisma validate); }
ci_api_typecheck() { (cd apps/api && npx tsc --noEmit); }
ci_api_build()     { (cd apps/api && npm run build); }
ci_api_test()      { (cd apps/api && npm test); }

# Il codemod deve essere idempotente: se ha ancora qualcosa da correggere,
# significa che è stato committato codice con import senza estensione.
ci_imports() {
  local out
  out="$(node scripts/fix-imports.mjs --dry-run)" || return 1
  echo "$out"
  if ! grep -qE '^(Da modificare|Modificati): 0 file' <<< "$out"; then
    echo "Ci sono import relativi senza estensione: esegui 'node scripts/fix-imports.mjs'."
    return 1
  fi
}

ci_web() {
  local rc=0
  for app in "${WEB_APPS[@]}"; do
    printf '\n  · %s\n' "$app"
    (cd "apps/$app" && npx tsc --noEmit) || rc=1
    (cd "apps/$app" && npm run build) || rc=1
  done
  return $rc
}

ci_migrate() {
  [[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL non impostata"; return 1; }
  (cd apps/api && npx prisma migrate deploy)
}

# Il working tree deve restare pulito: se prisma generate o una build hanno
# modificato file tracciati, va committato e non lasciato alla deriva.
ci_clean_tree() {
  local dirty
  dirty="$(git status --porcelain -- ':!node_modules' 2>/dev/null)"
  if [[ -n "$dirty" ]]; then
    echo "File modificati dalla pipeline:"
    echo "$dirty"
    return 1
  fi
}

# Ratchet sugli `as any`: il numero non può crescere.
# Il budget è in .any-budget in radice e si aggiorna solo verso il basso.
ci_any_ratchet() {
  local budget_file=".any-budget"
  if [[ ! -f "$budget_file" ]]; then
    echo "File $budget_file mancante: crealo con il conteggio attuale di 'as any' in apps/api/src."
    return 1
  fi
  local budget
  budget="$(cat "$budget_file" | tr -d '[:space:]')"
  local actual
  actual="$(grep -r 'as any' apps/api/src --include='*.ts' | wc -l | tr -d '[:space:]')"
  echo "Budget: $budget · Attuale: $actual"
  if (( actual > budget )); then
    echo "Troppi 'as any' ($actual > $budget). Riducili o, se è proprio necessario alzarlo, discuti il design."
    return 1
  fi
  if (( actual < budget )); then
    echo "Ottimo: hai ridotto gli 'as any' ($actual < $budget). Aggiorna .any-budget a $actual."
  fi
}

# ─── orchestrazione ────────────────────────────────────────────────────────
TARGET="${1:-all}"

printf '%sLa Piazzetta — CI (%s)%s\n' "$B" "$TARGET" "$N"
printf 'node %s · npm %s\n' "$(node --version)" "$(npm --version)"

case "$TARGET" in
  logic)
    run "test logica pura" ci_logic
    ;;

  migrate)
    run "prisma migrate deploy" ci_migrate
    ;;

  api)
    run "test logica pura"      ci_logic
    run "import con estensione" ci_imports
    run "install (root)"        ci_install_root
    run "prisma generate"       ci_api_prisma
    run "prisma validate"       ci_api_validate
    run "typecheck (api)"       ci_api_typecheck
    run "build (api)"           ci_api_build
    run "test (api)"            ci_api_test
    run "ratchet as any"        ci_any_ratchet
    ;;

  web)
    run "typecheck + build (web)" ci_web
    ;;

  all)
    run "test logica pura"      ci_logic
    run "import con estensione" ci_imports
    run "install (root)"        ci_install_root
    run "prisma generate"       ci_api_prisma
    run "prisma validate"       ci_api_validate
    run "typecheck (api)"       ci_api_typecheck
    run "build (api)"           ci_api_build
    run "test (api)"            ci_api_test
    run "ratchet as any"        ci_any_ratchet
    run "typecheck + build (web)" ci_web
    if [[ -n "${DATABASE_URL:-}" ]]; then
      run "prisma migrate deploy" ci_migrate
    else
      skip "prisma migrate deploy" "DATABASE_URL non impostata"
    fi
    run "working tree pulito"   ci_clean_tree
    ;;

  *)
    echo "Target sconosciuto: $TARGET (usa: all | api | web | logic | migrate)"
    exit 2
    ;;
esac

# ─── riepilogo ─────────────────────────────────────────────────────────────
printf '\n%s─────────── riepilogo ───────────%s\n' "$B" "$N"
for s in "${PASSED[@]:-}";  do [[ -n "$s" ]] && printf '%s  ✓ %s%s\n' "$G" "$s" "$N"; done
for s in "${SKIPPED[@]:-}"; do [[ -n "$s" ]] && printf '%s  ⊘ %s%s\n' "$Y" "$s" "$N"; done
for s in "${FAILED[@]:-}";  do [[ -n "$s" ]] && printf '%s  ✗ %s%s\n' "$R" "$s" "$N"; done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  printf '\n%sCI FALLITA — %d step su %d%s\n' "$R" "${#FAILED[@]}" "$(( ${#FAILED[@]} + ${#PASSED[@]} ))" "$N"
  exit 1
fi
printf '\n%sCI OK — %d step superati%s\n' "$G" "${#PASSED[@]}" "$N"
