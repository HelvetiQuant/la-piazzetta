# Dockerfile — La Piazzetta: API + web app (build multi-stage)
# Build: docker build -t la-piazzetta .
# Run:   docker compose up -d

# ─── Stage 1: build ──────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# OpenSSL 1.1 per Prisma engine (Debian bookworm ha OpenSSL 3, Prisma vuole 1.1)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copia package.json e lockfile per cache efficiente
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web-owner/package.json ./apps/web-owner/
COPY apps/web-waiter/package.json ./apps/web-waiter/
COPY apps/web-kds-bar/package.json ./apps/web-kds-bar/
COPY apps/web-kds-kitchen/package.json ./apps/web-kds-kitchen/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/shared-components/package.json ./packages/shared-components/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/ui/package.json ./packages/ui/

# Installa tutte le dipendenze (incluse devDependencies per il build)
RUN npm install --workspaces --include-workspace-root --include=dev || npm install

# Copia sorgenti
COPY . .

# Genera Prisma client
RUN cd apps/api && npx prisma generate

# Builda API (TypeScript → JavaScript)
RUN cd apps/api && npx tsc

# Builda web app (Vite)
RUN cd apps/web-owner && npm run build
RUN cd apps/web-waiter && npm run build
RUN cd apps/web-kds-bar && npm run build
RUN cd apps/web-kds-kitchen && npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

# wget per healthcheck + OpenSSL per Prisma
RUN apt-get update && apt-get install -y --no-install-recommends wget openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copia solo il necessario per il runtime
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web-owner/dist ./apps/web-owner/dist
COPY --from=build /app/apps/web-waiter/dist ./apps/web-waiter/dist
COPY --from=build /app/apps/web-kds-bar/dist ./apps/web-kds-bar/dist
COPY --from=build /app/apps/web-kds-kitchen/dist ./apps/web-kds-kitchen/dist
COPY --from=build /app/packages ./packages

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
