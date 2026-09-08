# La Piazzetta — comandi di uso quotidiano.
# `make` senza argomenti mostra questo elenco.

COMPOSE_CI := docker compose -f docker-compose.ci.yml

.DEFAULT_GOAL := help
.PHONY: help ci ci-api ci-web ci-logic ci-build ci-shell ci-clean dev db db-stop fix-imports prova prova-reset prova-stop

help: ## Mostra questo elenco
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	 | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## ─── CI ────────────────────────────────────────────────────────────────────

ci: ## Pipeline completa in Docker (backend + web + migration)
	$(COMPOSE_CI) run --rm ci all

ci-api: ## Solo backend: prisma, typecheck, build, test
	$(COMPOSE_CI) run --rm ci api

ci-web: ## Solo le 4 web app: typecheck + build
	$(COMPOSE_CI) run --rm ci web

ci-logic: ## Test di logica pura, senza Docker (~2 secondi)
	@bash scripts/ci.sh logic

ci-build: ## Ricostruisce l'immagine del runner (serve solo se cambia il Dockerfile)
	$(COMPOSE_CI) build ci

ci-shell: ## Shell dentro il container di CI, per indagare un fallimento
	$(COMPOSE_CI) run --rm --entrypoint bash ci

ci-clean: ## Rimuove container, volumi e node_modules della CI
	$(COMPOSE_CI) down -v

## ─── sviluppo ──────────────────────────────────────────────────────────────

prova: ## Avvia l'ambiente di prova completo (database, seed, web app, server)
	@bash scripts/prova.sh

prova-reset: ## Azzera il database di prova e riparte da zero
	@bash scripts/prova.sh reset

prova-stop: ## Ferma il database di prova
	@bash scripts/prova.sh stop

db: ## Avvia il Postgres di sviluppo
	docker compose up -d

db-stop: ## Ferma il Postgres di sviluppo
	docker compose down

dev: ## Avvia il backend in watch mode
	cd apps/api && npm run dev

fix-imports: ## Aggiunge .js agli import relativi che ne sono privi
	@node scripts/fix-imports.mjs
