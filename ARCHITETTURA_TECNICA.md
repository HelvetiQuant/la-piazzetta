# La Piazzetta — Architettura tecnica (dettaglio)

Documento di riferimento tecnico completo del sistema al **2026-09-01 (v0.13.0)**.
Copre stack, struttura, backend, modello dati, flussi, sicurezza, API, frontend,
deployment e debito tecnico. Fonte di verità del codice: `apps/` + `macos/`.

---

## 1. Panoramica

Piattaforma gestionale per bar & tavola calda ("La Piazzetta") con:
gestione ordini/tavoli, KDS bar e cucina, magazzino con scarico automatico,
fornitori e riordino predittivo, crediti clienti, cassa, statistiche,
**dashboard KPI proprietario**, **stipendi e turni staff**, **marketing
avanzato con AI**, **scheduling staff con chat condivisa e ottimizzazione AI**,
**contabilità italiana con piano dei conti, fatture fornitori, conto economico,
bilancio patrimoniale ed export per commercialista**,** assistente AI integrato (Claude Haiku) con pipeline adattiva che impara dall owner**,** menu add-on promossi dallo staff ai clienti**, e uno strato **AI**
(OpenAI + Anthropic) per upsell, previsione consumi, marketing, suggerimenti
turni e classificazione arrivi.

Principi architetturali:

- **Moduli di dominio disaccoppiati** dietro un entrypoint Express unico; ogni
  modulo espone un `registerXxxRoutes(app, prisma, deps)` e non importa gli altri.
- **Logica pura separata dall'I/O** (file `*.logic.ts`) per testabilità senza DB/rete.
- **Prezzi/denaro sempre in centesimi (Int)** per evitare errori floating point.
- **AI-first ma degradabile**: se manca la chiave o il budget, gli endpoint AI
  rispondono in modo controllato (503/429) senza rompere il resto.
- **GDPR/on-prem friendly**: input AI anonimizzati (solo ID/etichette), immagini
  webcam mai inviate al cloud (modulo vision, da costruire).

---

## 2. Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Runtime | Node.js ≥ 22 (usa `fetch` nativo, `crypto`, type-stripping nei test) |
| API | Express 4 + Zod (validazione) |
| ORM / DB | Prisma 5 + PostgreSQL (Supabase in produzione) |
| Auth | JWT HS256 (crypto nativo), scrypt per password/PIN |
| Coda | astrazione propria; driver in-memory, adapter BullMQ/Redis lazy |
| Cache | astrazione propria; in-memory, seam Redis |
| AI | OpenAI (Chat Completions) + Anthropic (Messages) via HTTP nativo |
| Frontend (nuovo) | 4 webapp HTML self-contained (owner, KDS bar, KDS cucina, cameriere) |
| Frontend (preesistente) | dashboard React+Vite; employee-mobile React Native/Expo |
| Test | asserzioni runtime con `node --experimental-strip-types` (no framework) |

Nessuna dipendenza aggiunta per AI/Auth/Coda: usano API native della piattaforma.

---

## 3. Struttura del monorepo

```
apps/
  api/                         # backend Express + Prisma
    prisma/
      schema.prisma            # modello dati (35+ tabelle)
      migrations/              # 8 migrazioni SQL (idempotenti, scritte a mano)
      menu.data.ts             # catalogo unico (161 prodotti) — fonte per DB e app
      seed-menu.ts             # seed Prisma del menu
      gen-menu-sql.mts         # genera SQL import (+ tutto-in-uno)
      gen-menu-apps.mts        # genera apps/shared/menu.js per le webapp
      seed/                    # SQL per Supabase (schema, menu, combinati)
    src/
      index.ts                 # entrypoint: middleware, wiring moduli
      http.ts                  # tipi condivisi (DevUser, RouteDeps, currentUser)
      ai/                      # AiService (config, logic, provider, service, routes)
      auth/                    # jwt.util, password.util, service, middleware, routes
      entitlement/             # plans.config, logic, cache, service, routes
      queue/                   # queue (in-memory) + bullmq.adapter
      orders/                  # ordini + macchina a stati + board KDS
      inventory/               # giacenze + movimenti + scarico automatico
      suppliers/               # fornitori, listini, riordino, ordini d'acquisto
      credit/                  # crediti clienti
      stats/                   # tempi di preparazione + dashboard KPI
      stations/                # mappatura category → postazione (BAR/TAVOLA_CALDA)
      staff/                   # turni, stipendi, scheduling, availability, chat
      marketing/               # media, AI post, Canva/Gamma, social, analytics, campagne
      accounting/              # contabilità IT: piano conti, fatture, registrazioni, CE, BP, IVA, export
      realtime/                # WebSocket KDS
      security/                # logger, rate-limit
  web-owner/ web-kds-bar/ web-kds-kitchen/ web-waiter/   # webapp Vite/React
  employee-mobile/                                       # app dipendenti React Native/Expo
CHANGELOG.md  TODO.md  ARCHITETTURA_TECNICA.md  PRESENTAZIONE_COMMERCIALE.md
```

---

## 4. Backend — architettura runtime

### 4.1 Entrypoint e catena middleware (`index.ts`)

Ordine di elaborazione di una richiesta:

1. `cors()` → `express.json()`
2. **Rotte pubbliche**: `/api/v1/health`, `/api/v1/auth/*` (login/refresh/logout).
3. **`devAuth`** = `makeAuthMiddleware(authService)`: verifica `Authorization: Bearer <JWT>`;
   in assenza e fuori produzione accetta gli header dev (`x-venue-id`, `x-user-id`,
   `x-user-roles`). Popola `req.devUser = { venueId, userId, roles }`.
4. **Gating entitlement** su percorsi protetti: `app.use('/api/v1/ai', devAuth, requireModule('ai'))`
   e `app.use('/api/v1/suppliers/reorder-proposals/ai', …)` → 403 con `upgradeRequired`.
5. Moduli di dominio registrati via `registerXxxRoutes(app, prisma, deps)`.
6. **Error handler** finale: `ZodError` → 400 con issues; `PrismaClientKnownRequestError`
   → 400 con code; altrimenti 500.

`deps: RouteDeps = { devAuth, requireRoles }`. `requireRoles(...roles)` autorizza se
`req.devUser.roles` interseca i ruoli o contiene `OWNER` (super-ruolo).

### 4.2 Pattern di modulo

Ogni modulo fornisce:
- un `*.routes.ts` con `registerXxxRoutes(app, prisma, deps)` (REST sotto `/api/v1/...`);
- opzionale `*.logic.ts` **puro** (nessun Prisma/rete) e `*.service.ts` (I/O);
- nessun import cross-dominio: la condivisione avviene via `http.ts` e Prisma.

### 4.3 Postazioni (`stations/stations.ts`)

La postazione **non** è un campo prodotto: è **derivata** dalla `category` e
**denormalizzata** su `OrderItem.station` alla creazione (così le statistiche
storiche restano stabili). Set `BAR_CATEGORIES` (aperitivo, cocktail,
cocktail_analcolico, birra, vino, bollicine, caffe, caffetteria, colazione,
bibite, liquore, distillato, gin, whisky, rum) e `TAVOLA_CALDA_CATEGORIES`
(pizza, primo, secondo, panino, toast, insalata, dolce, tavola_calda, griglia,
frittura, …). Fallback → `BAR`.

---

## 5. Autenticazione e autorizzazione

### 5.1 JWT (`auth/jwt.util.ts`)

- Algoritmo **HS256** con `crypto.createHmac` — nessuna libreria.
- Claims: `{ sub (userId), venueId, roles[], iat, exp, typ }`.
- `signJwt(claims, secret, ttlSec)` / `verifyJwt(token, secret)` → esiti
  `format | signature | expired | malformed`. Confronto firma in **tempo costante**
  (`timingSafeEqual`). Base64url senza padding.

### 5.2 Password e PIN (`auth/password.util.ts`)

- `scrypt` (N=16384, keylen 32, salt per record). Formato `scrypt$N$salt$hash`.
- Refresh token: valore opaco casuale, in DB salvato **solo come SHA-256** (`sha256Hex`).

### 5.3 AuthService (`auth/auth.service.ts`)

- `issueTokens(user)` → access JWT (TTL 15m default) + refresh opaco (TTL 30g),
  hash persistito in `RefreshToken`.
- `loginWithPassword(venueId, email, pw)` e `loginWithPin(venueId, userId, pin)`.
- `refresh(token)` → **rotazione**: revoca il vecchio (`revokedAt`) ed emette nuova coppia.
- `revoke(token)` → logout idempotente. `verifyAccess(token)` → claims o `AuthError`.
- Config da env: `JWT_SECRET`, `JWT_ACCESS_TTL_SEC`, `JWT_REFRESH_TTL_SEC`.

---

## 6. Entitlement & packaging (`entitlement/`)

- **`plans.config.ts`**: piani `START` / `PRO` / `ENTERPRISE` (moduli, feature,
  limiti; `-1` = illimitato) e add-on (`ai-suite`, `marketing`) con `requiresModules`.
- **`entitlement.logic.ts`** (puro): `resolveEntitlements(plan, addons)` →
  `{ plan, modules[], features[], limits, addons[], rejectedAddons[] }`. Un add-on con
  dipendenze mancanti è **rifiutato** con motivazione; `hasModule/hasFeature/limitOf`.
- **`cache.ts`**: `Cache<V>` con TTL/invalidazione; `InMemoryCache` (seam Redis).
- **`entitlement.service.ts`**: `forVenue(venueId)` cache-aside da `Venue.plan` +
  `VenueAddon`; `invalidate(venueId)` al cambio piano.
- **`entitlement.routes.ts`**: `GET /me/entitlements` (paywall UI) e factory
  `requireModule(moduleId)` per il gating a livello di route (**403** `upgradeRequired`).

Mappa piani → moduli (sintesi): START {orders-tables, inventory}; PRO {+suppliers,
credit, stats}; ENTERPRISE {+ai, marketing}. AI attivabile su PRO via add-on `ai-suite`
(dipende da `suppliers`); `marketing` dipende da `ai`.

---

## 7. AiService (`ai/`)

### 7.1 Componenti
- **`ai.logic.ts`** (puro): routing (`providerChain`), backoff esponenziale + full
  jitter (`backoffDelays`), `BudgetTracker` (cap mensile per periodo `YYYY-MM`),
  stima costi per modello (`estimateCostCents`), prompt per task (`buildPrompt`),
  parsing JSON tollerante, `forecastTargetLevel` (fusione previsione → riordino).
- **`ai.config.ts`**: chiavi/modelli/routing/budget/timeout/cache da env.
  **Provider nativo = OpenAI** per tutti i task (override via `AI_ROUTE_<TASK>`).
- **`ai.provider.ts`**: `callOpenAI` (`/chat/completions`) e `callAnthropic`
  (`/messages`) via `fetch` nativo, timeout con `AbortController`, `ProviderError`
  con flag `retryable` (429/5xx/rete = ritentabile; 401/400 = permanente).
- **`ai.service.ts`**: orchestrazione `run(task, input)`:
  routing → **catena di fallback** tra provider → **retry** con backoff sugli errori
  ritentabili → **budget** (stima preventiva + consuntivo dai token) → **cache**
  in-memory per i task deterministici. Helper tipizzati: `suggestUpsell`,
  `demandForecast`, `marketingCopy`, `shiftSuggestion`, `classifyArrival`.

### 7.2 Task e integrazioni
`upsell`, `demand_forecast`, `marketing_copy`, `shift_suggestion`, `webcam_classify`.
Il **riordino predittivo** (`POST /suppliers/reorder-proposals/ai`) costruisce lo
storico consumi dai movimenti `SALE`, chiede la previsione giornaliera, e **alza il
livello target** del riordino quando la domanda prevista sull'orizzonte (lead time +
copertura di sicurezza) supera la configurazione statica; riusa `computeReorder`.

---

## 8. Coda job (`queue/`)

- **`queue.ts`**: interfaccia `Queue` (`process`, `add`, `drain`) + `InMemoryQueue`
  con retry/backoff (stesso backoff dell'AiService) e dead-letter su log. Singleton
  `getQueue()/setQueue()`.
- **`bullmq.adapter.ts`**: adapter **BullMQ/Redis** drop-in, importato in modo *lazy*
  solo se `REDIS_URL` è presente e il pacchetto è installato (`tryEnableBullmq()`).
  Senza Redis l'app resta sulla coda in-memory.

---

## 9. Modello dati (Prisma / PostgreSQL)

18 tabelle core + 17 tabelle dei nuovi moduli (staff, marketing, accounting) = **35+ tabelle**. Denaro in centesimi (Int). ID `cuid` lato applicazione.

### 9.1 Elenco tabelle
**Core (v0.7–0.9):** `Venue`, `User`, `RefreshToken`, `VenueAddon`, `Product`,
`StockItem`, `StockMovement`, `RecipeItem`, `Table`, `TableSession`, `Order`,
`OrderItem`, `Supplier`, `PurchaseOrder`, `PurchaseOrderItem`, `SupplierProduct`,
`Customer`, `CreditTransaction`.

**Staff (v0.12):** `StaffShift` (clock-in/out, ore, paga calcolata),
`PayrollEntry` (bozza→approvato→pagato), `AvailabilitySlot` (disponibilità
settimanale), `ScheduledShift` (turni pianificati con AI), `ChatRoom`,
`ChatMessage` (chat condivisa con messaggi AI).

**Marketing (v0.12):** `MediaAsset` (upload foto/video), `SocialPost`,
`SocialAccount` (connessioni social), `SocialComment` (commenti + risposte AI),
`Campaign` (campagne marketing).

**Accounting (v0.12):** `ChartOfAccount` (piano dei conti italiano, 60 conti
predefiniti), `SupplierInvoice` (fatture fornitori con IVA, ritenuta, file
allegato), `JournalEntry` (registrazioni in partita doppia), `JournalLine`
(righe dare/avere), `VatReturn` (liquidazione IVA periodica), `CostCenter`
(centri di costo).

### 9.2 Relazioni chiave
- `Venue` 1—N `User`, `Table`, `Product`, `Customer`, `Supplier`, `VenueAddon`.
- `Table` 1—N `TableSession` 1—N `Order` 1—N `OrderItem` N—1 `Product`.
- `Product` 1—1 `StockItem`; 1—N `StockMovement`; `RecipeItem` collega prodotto↔ingrediente
  (self-relation `Recipe`/`UsedIn`) per la distinta base.
- `Supplier` 1—N `SupplierProduct` (listino) e `PurchaseOrder` 1—N `PurchaseOrderItem`.
- `Customer` 1—N `CreditTransaction`. `User` 1—N `RefreshToken`.

### 9.3 Campi/invarianti notevoli
- `Order.clientOrderId` **unique** → idempotenza ordini offline.
- Timestamp ciclo su `Order` (placedAt/sentAt/servedAt/paidAt) e `OrderItem`
  (sentAt/startedAt/readyAt/servedAt) per le statistiche tempi.
- `OrderItem.station` denormalizzata (BAR/TAVOLA_CALDA).
- `StockItem`: quantity, reorderLevel, parLevel (unità base).
- `StockMovement.type`: LOAD/WASTE/RETURN/PHYSICAL/SALE/RECEIPT (audit trail).
- `SupplierProduct`: packSize (unità base/confezione), packPriceCents, leadTimeDays, preferred.
- `Customer.balanceCents` > 0 = il cliente deve al locale; `limitCents` (0 = nessun limite).

### 9.4 Migrazioni
`20260722_inventory_suppliers`, `20260722_purchase_orders`,
`20260722_stations_timing_credit`, `20260727_auth_entitlements`
(passwordHash + RefreshToken + VenueAddon),
`20260827_staff_shifts_salary` (turni + stipendi),
`20260827_marketing_advanced` (media, social, campagne),
`20260827_staff_scheduling_chat` (scheduling, availability, chat),
`20260827_accounting` (piano conti, fatture, journal, IVA, centri costo).
Scritte a mano, idempotenti (`IF NOT EXISTS`, FK guardate).
Per Supabase: `prisma/seed/schema_supabase.sql`.

---

## 10. Flussi di dominio

### 10.1 Macchina a stati ordine (`orders/orders.routes.ts`)
`DRAFT → SENT → IN_PREPARATION → READY → SERVED → PAID`, con `CANCELLED` da quasi
ovunque prima del completamento. `canTransition(from,to)` valida; ogni transizione
scrive i timestamp coerenti su ordine e righe. La creazione parte già in `SENT`
(comanda inviata) con instradamento per postazione.

### 10.2 Scarico magazzino automatico
Alla creazione ordine, per ogni riga: se il prodotto ha **distinta base** scala gli
ingredienti (`RecipeItem`), altrimenti scala sé stesso — tramite `recordMovement`
(tipo `SALE`, con `orderId`). La vendita non si blocca su giacenza insufficiente:
registra il delta reale.

### 10.3 Riordino (`suppliers/reorder.logic.ts`)
`computeReorder`: se `quantity ≤ reorderLevel`, propone di riportare al livello target
(`parLevel` o `reorderLevel`); acquisto in confezioni (`packs = ceil(deficit/packSize)`).
La versione AI alza dinamicamente il target con la previsione consumi.

### 10.4 Board KDS (`GET /orders-tables/board`)
Raggruppa le righe attive per postazione con tempi trascorsi; `?station=BAR|TAVOLA_CALDA`
filtra. Le webapp KDS consumano questo endpoint (oggi con dati demo).

### 10.5 Dashboard KPI proprietario (`stats/dashboard.routes.ts`)
Endpoint `GET /stats/dashboard?from=&to=` che aggrega in un'unica risposta:
ricavi totali e incassati, numero ordini, scontrino medio, coperti, tempo medio
consegna, delta rispetto al periodo precedente, ricavi per giorno, ordini per
ora, top prodotti (con `product: { select: { name: true } }`), breakdown per
postazione (bar/cucina) e stato pagamenti. Usato dal frontend `web-owner`.

### 10.6 Stipendi e turni (`staff/staff.routes.ts`)
- `StaffShift`: clock-in/out con calcolo ore e paga (hourlyRateCents × ore).
- `PayrollEntry`: workflow bozza → approvato → pagato, con periodo e totale.
- Endpoint: `POST /staff/shifts/clock-in`, `POST /staff/shifts/:id/clock-out`,
  `GET /staff/shifts`, `GET /staff/payroll`, `PATCH /staff/payroll/:id/approve|pay`.

### 10.7 Scheduling staff con AI (`staff/scheduling.routes.ts`)
- `AvailabilitySlot`: disponibilità settimanale per dipendente
  (giorno, fascia oraria, preferenza AVAILABLE/PREFERRED/UNAVAILABLE).
- `ScheduledShift`: turni pianificati con stato (DRAFT/CONFIRMED/CANCELLED),
  flag `aiSuggested` + `aiConfidence`.
- `POST /staff/schedule/ai-optimize`: invia copertura richiesta (minimo
  personale per fascia) e vincoli (max ore/settimana, min riposo tra turni);
  l'AI (via `AiService.shiftSuggestion`) propone turni ottimizzati sulla base
  delle disponibilità, con punteggio di confidenza.
- `POST /staff/schedule/apply`: applica le suggerimenti AI creando i turni.
- Chat condivisa: `ChatRoom` + `ChatMessage` con messaggi AI generati
  (`POST /staff/chat/rooms/:id/ai-suggest`).

### 10.8 Marketing avanzato (`marketing/marketing.routes.ts`)
- **Media**: upload foto/video (base64), gestione e cancellazione.
- **AI generation**: `POST /marketing/generate-post` → caption + hashtag
  nel tono del brand, da topic e/o foto.
- **Canva/Gamma**: integrazioni `POST /marketing/canva/create` e
  `/marketing/gamma/create` per generazione grafica e presentazioni.
- **Social publishing**: `SocialPost` con stato bozza→pubblicato,
  `POST /marketing/posts/:id/publish` (hook multi-piattaforma).
- **Commenti**: sync automatico, `POST /marketing/comments/:id/auto-reply`
  per risposte AI ai commenti social.
- **Analytics**: `GET /marketing/analytics` (impression, reach, engagement,
  follower count, top posts).
- **Campaigns**: `Campaign` con budget, piattaforme, date.

### 10.9 Contabilità italiana (`accounting/accounting.routes.ts`)
Modulo completo di contabilità secondo le regole italiane (art. 2424/2425
codice civile):

- **Piano dei conti** (`ChartOfAccount`): 60 conti predefiniti italiani
  (Attivo, Passivo, Costi, Ricavi) con codici, subcategory, aliquote IVA
  e flag deducibilità. Seed automatico via `POST /accounting/accounts/seed`.
- **Fatture fornitori** (`SupplierInvoice`): registrazione con fornitore,
  numero, data, imponibile, aliquota IVA, ritenuta, totale calcolato,
  stato (RECEIVED → RECORDED → PAID), file allegato (PDF/immagine base64).
- **Contabilizzazione** (`POST /accounting/invoices/:id/record`): genera
  automaticamente una `JournalEntry` in **partita doppia** — DARE conto costo
  + DARE IVA a credito / AVERE conto fornitori.
- **Pagamento** (`POST /accounting/invoices/:id/pay`): genera registrazione
  DARE fornitore / AVERE banca/cassa.
- **Giornale contabile** (`JournalEntry` + `JournalLine`): registrazioni
  manuali con validazione dare=avere, righe con conto, importo dare/avere.
- **Liquidazione IVA** (`VatReturn`): calcolo automatico per periodo
  (mensile/trimestrale) — IVA a debito (ricavi) − IVA a credito (acquisti),
  stato bozza → presentata.
- **Conto economico** (`GET /accounting/income-statement`): aggrega ricavi e
  costi per subcategory nel periodo, con EBITDA, oneri finanziari, imposte,
  utile netto.
- **Bilancio patrimoniale** (`GET /accounting/balance-sheet`): aggrega
  attivo e passivo alla data, con totale attivo, totale passivo e
  patrimonio netto.
- **Bilancio di verifica** (`GET /accounting/trial-balance`): saldo dare/avere
  per conto con validazione bilanciamento.
- **Export commercialista** (`GET /accounting/export?format=json|csv`):
  export completo (piano conti, registrazioni, fatture, liquidazioni IVA)
  in JSON o CSV, pronto per la consegna al commercialista.

---

## 11. API REST (sintesi, base `/api/v1`)

- **Auth** (pubbliche): `POST /auth/login`, `/auth/login-pin`, `/auth/refresh`, `/auth/logout`.
- **Entitlement**: `GET /me/entitlements`.
- **Ordini/tavoli**: `GET /orders-tables/tables`, `POST /orders-tables/tables`,
  `POST /orders-tables/tables/:id/sessions`, `POST /orders-tables/orders`,
  `PATCH /orders-tables/orders/:id/status`, `PATCH /orders-tables/order-items/:id/status`,
  `GET /orders-tables/board`, `GET /orders-tables/orders`, `GET /products`.
- **Inventario**: `GET /inventory/stock`, `/inventory/low-stock`, `POST /inventory/movements`,
  `GET /inventory/movements`, `PATCH /inventory/stock/:productId/levels`.
- **Fornitori/acquisti**: `GET/POST/PATCH /suppliers`, `GET/POST /suppliers/:id/listings`,
  `GET /suppliers/reorder-proposals`, `POST /suppliers/reorder-proposals/ai`,
  ciclo `PurchaseOrder` (bozza→inviato→ricevuto) + ricezione merce.
- **Crediti**: `credit/*` (addebito/pagamento/rettifica, saldo).
- **Stats**: `stats/*` (tempi di preparazione, percentili), `GET /stats/dashboard`
  (KPI aggregati proprietario).
- **Staff**: `POST /staff/shifts/clock-in|clock-out`, `GET /staff/shifts`,
  `GET /staff/payroll`, `PATCH /staff/payroll/:id/approve|pay`.
- **Scheduling**: `GET/PUT /staff/availability`, `GET/POST/PATCH/DELETE
  /staff/schedule`, `POST /staff/schedule/ai-optimize`, `POST /staff/schedule/apply`.
- **Chat**: `GET/POST /staff/chat/rooms`, `GET/POST /staff/chat/rooms/:id/messages`,
  `POST /staff/chat/rooms/:id/ai-suggest`.
- **Marketing**: `GET/POST /marketing/media`, `POST /marketing/generate-post`,
  `POST /marketing/canva/create`, `POST /marketing/gamma/create`,
  `GET/POST/PATCH/DELETE /marketing/posts`, `POST /marketing/posts/:id/publish`,
  `GET/POST /marketing/accounts`, `GET/POST /marketing/comments`,
  `POST /marketing/comments/:id/auto-reply`, `GET /marketing/analytics`,
  `GET/POST/PATCH /marketing/campaigns`.
- **Contabilità**: `GET/POST /accounting/accounts`, `POST /accounting/accounts/seed`,
  `GET/POST /accounting/invoices`, `POST /accounting/invoices/:id/record|pay|upload`,
  `GET /accounting/invoices/:id/file`, `DELETE /accounting/invoices/:id`,
  `GET/POST/DELETE /accounting/journal`, `GET/POST /accounting/vat-returns`,
  `POST /accounting/vat-returns/calculate`, `PATCH /accounting/vat-returns/:id/file`,
  `GET /accounting/income-statement`, `GET /accounting/balance-sheet`,
  `GET /accounting/trial-balance`, `GET /accounting/export?format=json|csv`.
- **AI**: `GET /ai/status`, `POST /ai/upsell`, `POST /ai/marketing-copy`,
  `POST /ai/shift-suggestion`, `POST /ai/classify-arrival`
  (gated su modulo `ai`).

Tutte protette (tranne auth/health) da `devAuth` + RBAC/entitlement.

---

## 12. Frontend

### 12.1 Webapp Vite/React/TypeScript (`apps/web-*`)
- **web-owner**: dashboard proprietario Apple-style con login JWT reale
  (email/password o PIN). Moduli: Dashboard KPI (ricavi, ordini, scontrino medio,
  coperti, tempi, delta periodo, grafici), Board comande, Tempi preparazione,
  **Marketing** (media, AI post, Canva/Gamma, social publishing, commenti AI,
  analytics, campagne), Magazzino, Fornitori, Ordini d'acquisto, **Presenze staff**
  (clock-in/out, ore, paga), **Orari** (scheduling con AI optimization),
  **Chat** (stanze condivise + AI suggest), **Stipendi** (bozza→approvato→pagato),
  Crediti, **Contabilità** (piano conti italiano, fatture fornitori con upload,
  contabilizzazione partita doppia, giornale, liquidazione IVA, conto economico,
  bilancio patrimoniale, bilancio di verifica, export commercialista).
- **web-kds-bar** / **web-kds-kitchen**: KDS a colonne con invecchiamento a colori,
  bump, suono, auto-refresh, filtro postazione, WebSocket real-time.
- **web-waiter**: mobile-first — tavoli, presa ordine offline-first (`clientOrderId`),
  incasso, turni/time table + timbratura, notifiche, chat team+proprietario.

### 12.2 Mobile
- **employee-mobile** React Native/Expo (app dipendenti: KDS, turni, chat).

---

## 13. Catalogo / menu

- `apps/api/prisma/menu.data.ts`: **161 prodotti** (prezzi in centesimi), sezioni
  Colazione/Bancone, Tavola calda, Bibite/Liquori, Birre, Bollicine, Cocktails,
  Cocktails analcolici, Gin, Whisky, Rum. Codici deterministici e univoci per sezione.
- Import idempotente (chiave `venueId+code`) su venue `venue_piazzetta` — stesso id
  usato dagli header dev delle app.
- Voci a range di prezzo impostate al **limite inferiore** (da confermare): Caffè
  shakerato, Centrifughe, Tortino, Bibite in lattina, Succhi di frutta, Frullati.

---

## 14. Sicurezza & GDPR

- Denaro in centesimi; nessuna chiave nel repo (`.env.example` di riferimento).
- JWT firmati; refresh token solo come hash; password/PIN con scrypt.
- **Rotazione zero-downtime del segreto JWT** (v0.11): `verifyJwtMulti` prova
  una lista di segreti (`JWT_SECRET` + `JWT_SECRET_PREVIOUS`) identificati da
  `kid` nell'header. La firma usa sempre il segreto corrente. Compatibile con
  token pre-rotazione senza `kid`.
- **Rate limiting** (v0.11): sliding window su login (10/min IP), PIN (20/min),
  refresh (30/min), AI (60/min utente). Driver in-memory + Redis seam. Fail-open
  se Redis down. Header `RateLimit-*` + `Retry-After`.
- **Logging strutturato** (v0.11): JSON una-riga-per-evento in produzione,
  formato leggibile in dev. Request log con durata/status/userId/venueId.
- Input AI **anonimizzati** (solo ID/etichette). Immagini webcam previste **on-prem**
  (modulo vision) — al cloud solo eventi/etichette.
- **Real-time WebSocket** (v0.11): autenticazione via `?token=<jwt>` query string
  all'handshake (i browser non supportano header custom su WS). Il token non
  finisce nei log di request (path `/ws` escluso dal requestLogger).
- **Da fare in produzione**: RLS su Supabase se si espone PostgREST, audit su
  cassa/contabilità, backup cifrati, i18n `Europe/Rome`.

---

## 15. Configurazione (env principali)

`DATABASE_URL`, `PORT`, `NODE_ENV`; `JWT_SECRET`, `JWT_ACCESS_TTL_SEC`,
`JWT_REFRESH_TTL_SEC`; `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_MODEL`,
`ANTHROPIC_MODEL`, `AI_ROUTE_<TASK>`, `AI_MAX_RETRIES`, `AI_TIMEOUT_MS`,
`AI_MONTHLY_BUDGET_CENTS`, `AI_CACHE_TTL_MS`, `AI_FORECAST_SAFETY_DAYS`; `REDIS_URL`.

---

## 16. Testing & verifica

Nessun framework: asserzioni a runtime con `node --experimental-strip-types` e un
resolver hook per gli import estensionless (`tests/ts-resolve.mjs`).
- `tests/ai.test.mts` — **36/36** (routing, fallback, retry, cache, budget, forecast).
- `tests/auth-queue-entitlement.test.mts` — **38/38** (JWT, password/PIN, entitlement,
  cache TTL, coda, AuthService end-to-end con Prisma mockato).
- `tests/verify*.mjs` — logica preesistente (stazioni, tempi, crediti, macchina a stati).

Nota: type-stripping non supporta le "parameter properties" → i costruttori usano
campi espliciti. Typecheck completo e test d'integrazione col DB vanno eseguiti in
locale con le dipendenze installate.

---

## 17. Build & deployment

- `apps/api`: `npm install` → `prisma generate` → `prisma db push` (o `migrate deploy`)
  → `npm run db:seed:menu` (o import SQL) → `npm run dev` / `build` + `start`.
- Import menu Supabase: SQL Editor con `seed/menu_import_supabase_clean.sql` (tutto-in-uno).
- Produzione consigliata: Redis attivo (coda + cache entitlement), `tryEnableBullmq()`
  in `index.ts`, provider AI configurati, `JWT_SECRET` sicuro.

---

## 18. Debito tecnico / prossimi passi

Vedi `TODO.md`. In sintesi: collegare le webapp KDS/waiter al DB reale (dati
demo attivi); costruire i moduli backend ancora solo-UI (`cashier-pos` con
scontrino fiscale IT, `vision` per webcam on-prem); Billing (Stripe) →
`Venue.plan`/`VenueAddon`; OCR/AI per estrazione automatica campi fatture
fornitori; validazione formale contabilità da parte di un commercialista
italiano; backup cifrati, i18n `Europe/Rome`, RLS Supabase, CORS produzione
restrict, Redis/BullMQ deployment, observability.

**Risolti in v0.11** (hardening produzione): Redis/BullMQ + cache entitlement
persistita, rotazione segreto JWT, rate limiting anti brute-force, real-time
WebSocket per KDS (push-on-mutation), logging strutturato JSON.

**Risolti in v0.12** (moduli business): dashboard KPI proprietario, stipendi e
turni staff, marketing avanzato con AI (Canva/Gamma/social/analytics),
scheduling staff con ottimizzazione AI e chat condivisa, contabilità italiana
completa (piano conti, fatture fornitori, partita doppia, IVA, conto economico,
bilancio, export commercialista), frontend Apple-style con 12 tab.

---

## 14. App macOS Owner nativa (v0.13.0)

### 14.1 Architettura

App macOS nativa in SwiftUI (`macos/PiazzettaOwner/`, 26 file Swift) che
sostituisce la web app owner come piattaforma primaria per il proprietario.
Build su macOS 26.5 SDK con design Liquid Glass (WWDC 2026).

```
macos/PiazzettaOwner/
  PiazzettaOwnerApp.swift     # @main, WindowGroup, inject APIClient + AIAssistant
  ContentView.swift           # NavigationSplitView con 15 sidebar items
  GlassSupport.swift          # Liquid Glass helpers + palette colori ristorante
  APIClient.swift             # REST client con auto-login + auto-relogin al 401
  AIAssistant.swift           # Assistente AI (Claude Haiku) con pipeline adattiva
  AIChatView.swift            # Chat UI + banner suggerimenti non invadenti
  AIConfig.swift              # Config Anthropic + Keychain helper
  ServerManager.swift         # Gestione backend Docker (avvio/stop/status)
  ServerStatusView.swift      # Pannello server con URL LAN + QR code
  Models.swift                # ~40 modelli Codable allineati all'API
  DashboardView.swift         # KPI con glass card, sparkline, delta animati
  MenuAddOnsView.swift        # CRUD add-on menu con statistiche conversion
  MarketingView.swift         # 6 sub-tab: crea post, social, commenti, analytics, account, campagne
  SuppliersView.swift         # CRUD fornitori + listini + proposte riordino
  InventoryView.swift         # Stock + movimenti + rettifica giacenze
  CreditView.swift            # Clienti a credito + movimenti
  PayrollView.swift           # Cedolini stipendi
  ScheduleView.swift          # Turni pianificati + AI optimize
  ShiftsView.swift            # Presenze staff clock-in/out
  ChatView.swift              # Chat staff
  AccountingView.swift        # Contabilità italiana
  OrdersBoardView.swift       # Board comande KDS
  PrepTimeStatsView.swift     # Statistiche tempi preparazione
  MenuView.swift              # Menu prodotti con editing prezzi
  LoginView.swift             # Login fallback (auto-login default)
```

### 14.2 Design Liquid Glass (WWDC 2026)

- `.glassEffect(.regular.interactive())` su tutti i card
- `GlassEffectContainer` per raggruppare effetti glass
- `.buttonStyle(.glass)` e `.glassProminent` per azioni
- SF Symbols animati: `.symbolEffect(.bounce, .pulse, .variableColor)`
- `matchedGeometryEffect` per transizioni fluide
- Hover effect su liste e card

### 14.3 Palette colori ristorante italiano

| Colore | Hex | Uso |
|---|---|---|
| `accent` | `#C71F14` | Rosso pomodoro — azioni primarie, header |
| `accentSecondary` | `#D9A633` | Oro/ambra — accenti, badge |
| `success` | `#669933` | Verde oliva — KPI positivi, conferme |
| `danger` | `#B31A19` | Rosso scuro — KPI negativi, errori |
| `warning` | `#E68C26` | Arancio — alert, warning |
| `background` | `#F8F5F0` | Grigio caldo — sfondo app |

Gradienti: `accentGradient` (rosso→oro), `successGradient` (verde→teal),
`dangerGradient` (rosso→arancio), `warmGradient` (ambra→oro).

### 14.4 Assistente AI (Claude Haiku)

**Modello**: `claude-haiku-4-5` (medio-basso, economico, veloce).

**Pipeline adattiva che impara**:
1. Ogni interazione loggata in `AiInteraction` (section, prompt, response, tokens).
2. Pesi sezioni si aggiornano in base alla frequenza d'uso (`sectionWeights`).
3. Feedback 👍/👎 aggiorna `positiveFeedback`/`negativeFeedback`.
4. Tono si adatta: `concise` → risposte brevi, `detailed` → più lunghe.
5. Argomenti preferiti/evitati si imparano dal comportamento.

**Non invadente, sempre presente**:
- Banner discreto in alto (non modal, non popup).
- Frequenza: low (1h), medium (15min), high (1min).
- Auto-downgrade a "low" dopo 3 dismiss consecutivi.
- Pulsante flottante in basso a destra (icona sparkles).
- Suggerimenti contestuali per sezione attiva.

### 14.5 Menu Add-On (consigli owner → staff → clienti)

L'owner crea add-on menu che lo staff promuove ai clienti:

```
Owner (macOS) crea add-on "Caffè post-pranzo a 1€"
  → DB MenuAddOn (attivo 11:00-15:00, target: camerieri)
  → Cameriere (web app) vede banner durante il pranzo
  → "Vuole aggiungere un caffè? Solo 1€ in più"
  → Cameriere: "Accettato" → track statistiche
  → Owner (macOS) vede conversion rate
  → AI suggerisce nuovi add-on basandosi sui successi
```

### 14.6 Backend unificato (server singolo)

Il backend Express serve anche le web app dipendenti come file statici
sulla porta 3000 (`/waiter`, `/kds-bar`, `/kds-kitchen`) con SPA fallback.
Un unico server per API + web app. I dipendenti si collegano a
`http://<ip-mac>:3000/waiter` dal browser.

### 14.7 Pannello Server

L'app macOS include un pannello "Server" che:
- Mostra stato backend (verde/rosso)
- Avvia/ferma il container Docker
- Mostra URL locale e LAN
- Genera QR code per il collegamento dei dipendenti
- Lista web app dipendenti con link cliccabili

---

## 15. Modello dati — tabelle v0.13.0

### 15.1 AiPreference
Preferenze AI adattive per venue. Si aggiorna automaticamente in base
all'uso. Campi: `sectionWeights` (JSON), `tonePreference`, `language`,
`suggestionFrequency`, `interactionCount`, `positiveFeedback`,
`negativeFeedback`, `preferredTopics` (JSON), `avoidedTopics` (JSON).
Unique su `venueId`.

### 15.2 AiInteraction
Log di ogni interazione AI per apprendimento. Campi: `section`, `prompt`,
`response`, `feedback` (1/-1/null), `modelUsed`, `tokensUsed`.
Indici su `[venueId, createdAt]` e `[venueId, section]`.

### 15.3 MenuAddOn
Add-on menu creati dall'owner. Campi: `productId` (FK), `title`,
`staffScript` (come proporlo al cliente), `targetRoles` (JSON),
`activeFrom`/`activeTo`, `timeWindow` (es. "11:00-14:00"),
`weekDays` (JSON), `priority` (1-5), `discountPct`, `status`
(ACTIVE/PAUSED/EXPIRED), `timesProposed`, `timesAccepted`.

---

## 16. API REST — endpoint v0.13.0

### 16.1 AI Preferences
- `GET /api/v1/ai-preferences` — leggi preferenze attuali (auto-crea se mancano)
- `PATCH /api/v1/ai-preferences` — aggiorna tono, frequenza, argomenti
- `POST /api/v1/ai-preferences/feedback` — registra feedback (1=utile, -1=non utile)
- `POST /api/v1/ai-preferences/interaction` — logga interazione per apprendimento
- `GET /api/v1/ai-preferences/suggestions?section=X` — suggerimento contestuale non invadente

### 16.2 Menu Add-On
- `GET /api/v1/menu-addons` — lista add-on (owner: tutti, staff: solo ACTIVE)
- `GET /api/v1/menu-addons/active` — add-on attivi ora per ruolo/orario/giorno
- `POST /api/v1/menu-addons` — crea add-on (owner/manager)
- `PATCH /api/v1/menu-addons/:id` — modifica add-on
- `DELETE /api/v1/menu-addons/:id` — elimina add-on
- `POST /api/v1/menu-addons/:id/track` — registra proposta/accettazione (statistiche)

### 16.3 Web app statiche
- `GET /waiter` — web app cameriere (build Vite)
- `GET /kds-bar` — web app KDS bar
- `GET /kds-kitchen` — web app KDS cucina
- SPA fallback: qualsiasi route non di API serve `index.html`
