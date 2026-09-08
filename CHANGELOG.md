# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [0.14.0] — 2026-09-08

Lotto 1 — Monorepo e componenti condivisi: npm workspaces, pacchetti
condivisi (api-client, ui, shared-components), Swift Package unificato
per macOS/iOS, eliminazione file duplicati, palette unica.

### Added — npm workspaces
- `package.json` root con `"workspaces": ["apps/*", "packages/*"]`.
- `packages/tsconfig/` — `tsconfig.base.json` condiviso per tutte le
  web app (target, lib, moduleResolution, strict).
- `packages/api-client/` — client HTTP con login JWT, refresh
  automatico, `apiFetch`. Prima 4 copie byte-identiche.
- `packages/ui/` — design system completo (colors, Card, KpiCard,
  Badge, Button, Input, Select, Spinner, EmptyState, ErrorBanner,
  GlobalStyles). Prima esisteva solo in web-owner.
- `packages/shared-components/` — `StaffNotesBanner`, `AddOnBanner`.
  Prima 3 copie byte-identiche di StaffNotesBanner.

### Changed — Web app come consumatori
- Tutte le 4 web app importano da `@la-piazzetta/api-client`,
  `@la-piazzetta/ui`, `@la-piazzetta/shared-components`.
- `tsconfig.json` di ogni app estende `@la-piazzetta/tsconfig`.
- `package.json` di ogni app dipende dai pacchetti condivisi.
- File duplicati rimossi: 4× `lib/client.ts`, 4× `src/ui.tsx` (owner),
  3× `StaffNotesBanner.tsx`, 1× `AddOnBanner.tsx`.
- `scripts/ci.sh`: un `npm ci` in root invece di 4 installazioni
  separate.

### Fixed — Colori hard-coded
- 13 file .tsx con colori hard-coded (`#c62828`, `#2e7d32`, `#1565c0`,
  `#e65100`, `#ff6f00`) sostituiti con token del design system
  (`colors.accent`, `colors.success`, `colors.secondary`,
  `colors.warning`, `colors.danger`).
- Palette unica allineata alle app Swift: rosso pomodoro `#C71F14`,
  oro `#D9A633`, verde oliva `#669933`, rosso scuro `#B31A19`,
  arancio `#E68C26`, sfondo `#F8F5F0`.

### Added — Swift Package condiviso
- `swift-packages/PiazzettaShared/` — Package.swift con target
  `PiazzettaShared` per macOS 14+ e iOS 17+.
- 27 file Swift unificati: 10 identici copiati, 17 divergenti
  riconciliati con `#if os(macOS)` / `#else` (iOS).
- `GlassSupport.swift` unificato: `hoverHighlight(cornerRadius:)` con
  default, `GlassEmptyState(message:)` opzionale, `glassEffect` con
  `#available`, `DeltaBadge` con due init.
- `APIClient.swift` con `baseURL` condizionale per piattaforma.
- `ServerManager.swift` / `ServerStatusView.swift` con implementazioni
  separate (Docker control su macOS, health check su iOS).
- `ContentView.swift` con AI banner e floating button sotto
  `#if os(macOS)`, `.sheet` su iOS.
- `swift build` verde, 0 errori, 0 warning.

### Verified
- `npm ci` in root installa tutto (api + 4 web app + 3 pacchetti).
- Typecheck: 0 errori per tutte le 4 web app e i 3 pacchetti.
- `swift build` del pacchetto condiviso: 0 errori.
- Zero file byte-identici tra apps/web-* (verificato con md5).

## [0.13.1] — 2026-09-08

Lotto 0 — Hardening: chiusura della falla di sicurezza cross-tenant,
denormalizzazione venueId, rimozione cast `as any`, ratchet sui tipi,
igiene del repository. Nessuna funzionalità nuova.

### Fixed — Sicurezza cross-tenant
- `GET /api/v1/orders-tables/sessions/:id/orders` filtrava solo per
  `sessionId` senza controllo `venueId` né `requireRoles`: un utente
  autenticato di qualsiasi venue poteva leggere comande e importi di
  un altro locale conoscendo un sessionId. Corretto con filtro
  `venueId` diretto e `requireRoles('OWNER','MANAGER','WAITER','CASHIER')`.
- `PATCH /api/v1/staff/:userId/rate` aggiornava un `User` per id senza
  verificare l'appartenenza al venue. Corretto con pattern
  guard-then-update (`findFirst` + `update`).
- `staff-notes` (4 rotte): `findUnique`/`update`/`delete` con
  `where: { id, venueId }` non erano validi come filtro di sicurezza
  perché `StaffNote` non ha `@@unique([id, venueId])`. Corrette con
  `findFirst` + `update`/`delete` per id.
- `menu-addons` (3 rotte): stesso problema di `staff-notes`. Corrette
  con `findFirst` + `update`/`delete` per id.
- Audit completo di tutte le 140 rotte: 9 vulnerabili, tutte corrette.

### Changed — Denormalizzazione venueId
- `TableSession` e `Order` ora hanno `venueId` diretto (era
  `session → table → venueId`, 3 hop di join per ogni query).
- Migration `20260908_venue_denorm`: aggiunge colonna, backfill dai
  dati esistenti, FK verso `Venue`, indici `@@index([venueId, createdAt])`.
- 8 query aggiornate per usare `venueId` diretto invece del join a
  3 livelli (`index.ts`, `orders.routes.ts`, `stats/stats.routes.ts`,
  `stats/dashboard.routes.ts`).
- `schema.prisma` e `prisma/seed/schema_supabase.sql` allineati.

### Fixed — Rimozione cast `as any` (10 cast)
- `suppliers/purchase.routes.ts` (2): rimosso `product` dall'include
  (relazione inesistente) e cast `as any`.
- `security/logger.ts` (1): error handler tipato con
  `ErrorRequestHandler` di Express invece di `as any`.
- `entitlement/cache.ts` (1): import dinamico ioredis tipato con
  `import type { Redis }` invece di `as any`.
- `security/rate-limit.ts` (1): stesso fix di `cache.ts`; il cast
  nascondeva un bug latente (`pipeline.exec()` nullable), corretto
  con guard esplicito.
- `accounting/accounting.routes.ts` (1): payload update tipato con
  `Prisma.ChartOfAccountUpdateInput`.
- `marketing/marketing.routes.ts` (2): payload update tipati con
  `Prisma.SocialPostUpdateInput` e `Prisma.CampaignUpdateInput`.
- `marketing/marketing.service.ts` (1): definito `MarketingVariant`
  con `hashtags?: string[]` invece di `(variant as any).hashtags`.
- `realtime/kds-ws.ts` (1): definito `NotificationPayload` esplicito
  invece di `...(payload as any)`.

### Added — Ratchet sugli `as any`
- Step `ci_any_ratchet` in `scripts/ci.sh`: conta le occorrenze di
  `as any` in `apps/api/src` e fallisce se superano il budget in
  `.any-budget` (57). Il budget si aggiorna solo verso il basso.
- File `.any-budget` in radice con valore iniziale 57.

### Changed — Igiene repository
- `.gitignore`: stringato a `.env*` con eccezioni per `.env.example`
  e `.env.*.example`.
- `.env.ci` rimosso (ridondante con `docker-compose.ci.yml`).
- `LICENSE`: aggiunta licenza proprietaria (Copyright Riccardo Gaetti,
  tutti i diritti riservati). Il software è vendibile a moduli separati.
- `.dockerignore`: aggiunto per accelerare il contesto di build.
- `apps/employee-mobile/` spostato in `archive/employee-mobile/` con
  README che spiega la scelta delle web app per i dipendenti.

### Verified
- Pipeline CI: 9/10 step passati (working tree pulito richiede commit).
- Test logica pura: 33/33, 14/14, 12/12 verdi.
- Suite AI: 36/36. Suite Auth/Queue/Entitlement: 38/38.
- Typecheck: 0 errori. Prisma validate: OK.
- `as any` count: 57 (erano 67, ridotti di 10).

### Known gaps
- 57 cast `as any` residui (non introdotti in questo lotto): per lo
  più `(req as any).devUser`, `await resp.json() as any`, campi JSON
  `meta`/`perPlatform`. Da ridurre nei lotti successivi.

## [0.13.0] — 2026-09-01

App macOS nativa per l'owner con design Liquid Glass (WWDC 2026), assistente AI
integrato (Claude Haiku) con pipeline adattiva che impara dall'uso, sistema di
add-on menu promossi dallo staff, e web app dipendenti servite dal backend unico.

### Added — App macOS Owner nativa (SwiftUI + Liquid Glass)
- App macOS `PiazzettaOwner` con 26 file Swift, build su macOS 26.5 SDK.
- `NavigationSplitView` con 15 sezioni sidebar: Server, Dashboard, Comande,
  Tempi, Marketing, Menu, Add-on Menu, Magazzino, Fornitori, Acquisti,
  Presenze, Orari, Chat, Stipendi, Crediti, Contabilità, Assistente AI.
- Design Liquid Glass WWDC 2026: `.glassEffect(.regular.interactive())`,
  `GlassEffectContainer`, `.buttonStyle(.glass)`, SF Symbols animati con
  `.symbolEffect`, gradienti vibranti, hover effect, transizioni fluide.
- Palette colori ristorante italiano: rosso pomodoro `#C71F14` (accent),
  oro `#D9A633` (secondary), verde oliva `#669933` (success), arancio
  `#E68C26` (warning), grigio caldo `#F8F5F0` (background).
- Auto-login con credenziali owner + auto-relogin al 401 (sessione scaduta).
- Pannello "Server": stato backend Docker, URL LAN, QR code per dipendenti,
  controlli avvio/stop container.

### Added — Assistente AI integrato (Claude Haiku)
- `AIAssistant.swift`: integrazione Anthropic Messages API con streaming SSE.
- Modello `claude-haiku-4-5` (medio-basso, economico, veloce).
- Autenticazione: API key salvata in Keychain (fallback OAuth scaffold pronto).
- System prompt contestuale: accede a dati reali (dashboard, menu, staff,
  contabilità) tramite APIClient per risposte informate.
- **Pipeline adattiva che impara dall'uso**:
  - Ogni interazione loggata in `AiInteraction` (section, prompt, response,
    tokens).
  - Pesi sezioni si aggiornano in base alla frequenza d'uso
    (`sectionWeights`).
  - Feedback 👍/👎 aggiorna contatori `positiveFeedback`/`negativeFeedback`.
  - Tono si adatta: `concise` → risposte brevi, `detailed` → più lunghe.
  - Argomenti preferiti/evitati si imparano dal comportamento.
- **Non invadente, sempre presente**:
  - Banner discreto in alto (non modal, non popup).
  - Frequenza suggerimenti: low (1h), medium (15min), high (1min).
  - Auto-downgrade a "low" dopo 3 dismiss consecutivi.
  - Pulsante flottante in basso a destra (icona sparkles).
  - Suggerimenti contestuali per sezione (Dashboard, Marketing, Staff, ecc.).
- `AIChatView.swift`: chat UI con bolle messaggi, quick actions, typing
  indicator animato, pulsanti feedback per risposta.

### Added — Menu Add-On (consigli owner promossi via staff)
- Modello `MenuAddOn` in Prisma: add-on creati dall'owner con titolo,
  script per lo staff, prodotto target, ruoli, fascia oraria, giorni
  settimana, priorità, sconto.
- Endpoint API: `GET/POST/PATCH/DELETE /menu-addons`,
  `GET /menu-addons/active` (filtra per ruolo, orario, giorno),
  `POST /menu-addons/:id/track` (registra proposta/accettazione).
- `MenuAddOnsView.swift` (macOS): Table con tutti gli add-on, Form di
  creazione con selettore prodotto, statistiche (conversion rate),
  pausa/riattiva/elimina, card con colore per priorità.
- `AddOnBanner.tsx` (web cameriere): banner scorrevole non invadente
  che mostra add-on attivi per il cameriere. Pulsanti "Accettato" /
  "Proposto" / dismiss. Gradient rosso pomodoro → oro (brand coerente).
- Flusso: owner crea add-on → cameriere vede banner → propone al cliente
  → track statistiche → owner vede conversion rate → AI suggerisce nuovi
  add-on.

### Added — Backend unificato (server singolo)
- `apps/api/src/index.ts`: serve le web app dipendenti come file statici
  sulla porta 3000 (`/waiter`, `/kds-bar`, `/kds-kitchen`) con SPA fallback.
- Un unico server per API + web app: i dipendenti si collegano a
  `http://<ip-mac>:3000/waiter` dal browser.

### Added — AI Preferences DB (impara dall'owner)
- Modello `AiPreference`: preferenze adattive per venue (tono, frequenza,
  argomenti preferiti/evitati, pesi sezioni, contatori feedback).
- Modello `AiInteraction`: log di ogni interazione AI per apprendimento.
- Endpoint: `GET/PATCH /ai-preferences`, `POST /ai-preferences/feedback`,
  `POST /ai-preferences/interaction`, `GET /ai-preferences/suggestions`.
- Migrazione `20260901_ai_preferences_addons` (3 nuove tabelle).

### Added — Web app cameriere aggiornata
- `AddOnBanner.tsx`: componente banner add-on integrato in `App.tsx`.
- `api.ts`: endpoint `addOnApi.active()` e `addOnApi.track()`.
- Banner con animazione slideDown, gradient brand, pulsanti di tracking.

### Changed — App iOS Owner (deprecata in favore macOS)
- L'app iOS `PiazzettaOwner` rimane disponibile ma l'app macOS è ora la
  piattaforma primaria per l'owner. L'iPad può usare la web app owner
  via browser.

## [0.12.0] — 2026-08-27

Moduli business completi: dashboard KPI proprietario, stipendi e turni staff,
marketing avanzato con AI, scheduling staff con ottimizzazione AI e chat
condivisa, contabilità italiana completa. Frontend owner Apple-style con 12 tab.

### Added — Dashboard KPI proprietario (`stats/dashboard.routes.ts`)
- `GET /stats/dashboard?from=&to=`: aggrega ricavi totali e incassati, numero
  ordini, scontrino medio, coperti, tempo medio consegna, delta periodo
  precedente, ricavi per giorno, ordini per ora, top prodotti, breakdown
  postazione (bar/cucina), stato pagamenti.
- Frontend `Dashboard.tsx`: card KPI con delta, grafici ricavi/ordini,
  top prodotti, breakdown bar/cucina.

### Added — Stipendi e turni staff (`staff/staff.routes.ts`)
- `StaffShift`: clock-in/out con calcolo ore e paga (hourlyRateCents × ore).
- `PayrollEntry`: workflow bozza → approvato → pagato.
- Endpoint: `POST /staff/shifts/clock-in`, `POST /staff/shifts/:id/clock-out`,
  `GET /staff/shifts`, `GET /staff/payroll`, `PATCH /staff/payroll/:id/approve|pay`.
- Frontend `StaffShifts.tsx` e `Payroll.tsx`.

### Added — Scheduling staff con AI (`staff/scheduling.routes.ts`)
- `AvailabilitySlot`: disponibilità settimanale (giorno, fascia, preferenza).
- `ScheduledShift`: turni pianificati con stato e flag `aiSuggested`.
- `POST /staff/schedule/ai-optimize`: ottimizzazione AI turni su copertura
  richiesta e vincoli (max ore, min riposo), con punteggio confidenza.
- `POST /staff/schedule/apply`: applica suggerimenti AI.
- Chat condivisa: `ChatRoom` + `ChatMessage` con `POST /staff/chat/rooms/:id/ai-suggest`.
- Frontend `StaffSchedule.tsx` e `StaffChat.tsx`.

### Added — Marketing avanzato (`marketing/`)
- Media: upload foto/video base64, gestione, cancellazione.
- AI generation: `POST /marketing/generate-post` → caption + hashtag nel tono
  del brand.
- Canva/Gamma: `POST /marketing/canva/create`, `POST /marketing/gamma/create`.
- Social publishing: `SocialPost` bozza→pubblicato, `POST /posts/:id/publish`.
- Commenti: sync, `POST /marketing/comments/:id/auto-reply` (risposte AI).
- Analytics: `GET /marketing/analytics` (impression, reach, engagement, top posts).
- Campaigns: `Campaign` con budget, piattaforme, date.
- Frontend `Marketing.tsx` Apple-style.

### Added — Contabilità italiana (`accounting/`)
- **Piano dei conti italiano** (`chart-of-accounts.ts`): 60 conti predefiniti
  secondo art. 2424/2425 codice civile (Attivo, Passivo, Costi, Ricavi) con
  aliquote IVA italiane (22%, 10%, 4%, 0%) e flag deducibilità.
- **Fatture fornitori** (`SupplierInvoice`): registrazione con fornitore, P.IVA,
  numero, data, imponibile, aliquota IVA, ritenuta, totale calcolato, stato
  (RECEIVED → RECORDED → PAID), upload file PDF/immagine.
- **Contabilizzazione partita doppia** (`POST /accounting/invoices/:id/record`):
  genera `JournalEntry` con righe DARE costo + DARE IVA a credito / AVERE fornitore.
- **Pagamento** (`POST /accounting/invoices/:id/pay`): registrazione DARE fornitore
  / AVERE banca.
- **Giornale contabile**: registrazioni manuali con validazione dare=avere.
- **Liquidazione IVA** (`VatReturn`): calcolo automatico IVA a debito/credito
  per periodo mensile/trimestrale.
- **Conto economico** (`GET /accounting/income-statement`): ricavi e costi per
  subcategory, EBITDA, oneri finanziari, imposte, utile netto.
- **Bilancio patrimoniale** (`GET /accounting/balance-sheet`): attivo, passivo,
  patrimonio netto.
- **Bilancio di verifica** (`GET /accounting/trial-balance`): saldo dare/avere
  con validazione bilanciamento.
- **Export commercialista** (`GET /accounting/export?format=json|csv`): export
  completo in JSON o CSV.
- Frontend `Accounting.tsx` Apple-style con 5 tab (Fatture, Registrazioni,
  Report, Piano Conti, IVA).

### Added — Frontend owner Apple-style
- `web-owner` riscritto con 12 tab: Dashboard, Comande, Tempi, Marketing,
  Magazzino, Fornitori, Acquisti, Presenze, Orari, Chat, Stipendi, Crediti,
  Contabilità.
- Login JWT reale (email/password o PIN) con refresh automatico token.
- Componenti: `Dashboard`, `Marketing`, `StaffShifts`, `StaffSchedule`,
  `StaffChat`, `Payroll`, `Accounting`.
- API client tipizzato in `api.ts` con namespace `dashboard`, `staff`, `mkt`,
  `schedule`, `chat`, `acct`.

### Added — Migrazioni DB
- `20260827_staff_shifts_salary`: tabelle `StaffShift`, `PayrollEntry`.
- `20260827_marketing_advanced`: tabelle `MediaAsset`, `SocialPost`,
  `SocialAccount`, `SocialComment`, `Campaign`.
- `20260827_staff_scheduling_chat`: tabelle `AvailabilitySlot`,
  `ScheduledShift`, `ChatRoom`, `ChatMessage`.
- `20260827_accounting`: tabelle `ChartOfAccount`, `SupplierInvoice`,
  `JournalEntry`, `JournalLine`, `VatReturn`, `CostCenter`.

### Verified
- Backend avviato in Docker, connesso a Supabase, migration applicate.
- Prisma client rigenerato, schema validato.
- Login email/password e PIN verificati per tutti i ruoli.
- Dashboard endpoint: HTTP 200 con KPI aggregati.
- Staff/Payroll endpoints: HTTP 200.
- Accounting: seed piano conti (60 conti), creazione fattura, contabilizzazione
  partita doppia, conto economico, bilancio, bilancio di verifica bilanciato,
  export JSON/CSV — tutti verificati.
- Frontend owner: build OK, anteprima browser su http://localhost:5173.

### Known gaps (non risolti in questa voce)
- OCR/AI per estrazione automatica campi fatture (da implementare).
- Validazione formale contabilità da parte di un commercialista italiano.
- Moduli solo-UI: `cashier-pos` (scontrino fiscale IT), `vision` (webcam on-prem).
- Webapp KDS/waiter ancora con dati demo (da collegare al DB reale).
- Backup cifrati, i18n `Europe/Rome`, RLS Supabase, CORS produzione restrict.

## [0.11.0] — 2026-08-26

Hardening di produzione: Redis per cache/rate-limit, rotazione JWT, real-time
WebSocket per KDS, logging strutturato, rate limiting anti brute-force.

### Added — Sicurezza
- **Rotazione zero-downtime del segreto JWT** (`auth/jwt.util.ts`):
  `verifyJwtMulti` verifica un token contro una lista di segreti (corrente +
  precedenti) identificati da `kid` nell'header JWT. `loadSecretKeys` parsa
  `JWT_SECRET` + `JWT_SECRET_PREVIOUS` da env. `AuthService.verifyAccess` usa
  la multi-verifica quando sono presenti più segreti; la firma usa sempre il
  segreto corrente con il `kid` corrispondente. Compatibile con token
  pre-rotazione senza `kid` (prova tutti i segreti).
- **Rate limiting** (`security/rate-limit.ts`): sliding window con contatori,
  driver in-memory + adapter Redis (`RedisRateLimitStore`) per condivisione
  multi-istanza. Applicato a `/auth/login` (10/min per IP), `/auth/login-pin`
  (20/min), `/auth/refresh` (30/min), endpoint AI (60/min per utente,
  configurabile via `AI_RATE_LIMIT_PER_MIN`). Header standard `RateLimit-*` +
  `Retry-After`. Fail-open se Redis è down.
- **Logging strutturato** (`security/logger.ts`): logger JSON con livelli
  (debug/info/warn/error), formato leggibile in dev e JSON una-riga-per-evento
  in produzione (pronto per collector). Middleware `requestLogger` logga
  metodo/path/status/durata/userId/venueId; `errorLogger` cattura errori non
  gestiti con stack. Salta `/health` e `/ws`. Livello configurabile via
  `LOG_LEVEL`.

### Added — Real-time
- **WebSocket KDS** (`realtime/kds-ws.ts`): server WebSocket attaccato al
  server HTTP su `/ws`. Autenticazione via query string `?token=<jwt>&station=`
  all'handshake (i browser non supportano header custom su WS). I moduli
  ordini chiamano `deps.onBoardChange(venueId, station)` dopo ogni mutazione
  (creazione ordine, avanzamento stato ordine/riga) → push immediato ai client
  KDS connessi per la postazione. I client ricevono
  `{ type: 'board-update', station }` e rifanno il GET /board
  (pull-on-push). Degradazione graceful: se `ws` non è installato, le webapp
  KDS continuano col polling a 5s. Endpoint `/api/v1/health/realtime` per
  monitorare i client connessi.

### Added — Infrastruttura
- **Cache entitlement su Redis** (`entitlement/cache.ts`): `RedisCache`
  adapter drop-in con TTL nativo Redis (PX ms), fail-open su Redis down
  (cache miss → fallback DB). `resolveCache` factory: Redis se `REDIS_URL` +
  `ioredis` installato, altrimenti in-memory. `EntitlementService.create()`
  factory async che risolve la cache Redis all'avvio.
- **BullMQ attivato all'avvio** (`index.ts`): `tryEnableBullmq()` chiamato
  nel bootstrap; se `REDIS_URL` + `bullmq` installato, la coda passa da
  in-memory a Redis (persistenza job, multi-istanza).
- **Dipendenze**: `ws` (obbligatoria, real-time), `bullmq` + `ioredis`
  (optionalDependencies, attivi solo con Redis).

### Fixed
- `web-owner/src/components/Inventory.tsx`: fragment `<>...</>` senza `key`
  nella mappa righe → warning React "Each child in a list should have a key".
  Sostituito con `<Fragment key={r.productId}>`.

### Changed
- `http.ts`: `RouteDeps` esteso con `onBoardChange?` (hook real-time opzionale).
- `orders/orders.routes.ts`: `notifyBoard()` chiama `onBoardChange` dopo
  creazione ordine (per le postazioni delle righe), avanzamento stato ordine
  (entrambe le postazioni) e bump riga singola (postazione della riga).
- `index.ts`: wiring completo (logger, rate-limit, WebSocket, BullMQ, cache
  Redis), bootstrap async, endpoint `/health/realtime`.
- `.env.example`: nuove variabili (`JWT_SECRET_PREVIOUS`, `JWT_SECRET_KID`,
  `AI_RATE_LIMIT_PER_MIN`, `LOG_LEVEL`).

### Verified
- Type-check e test runtime da eseguire sul portatile con `npm install` +
  `npx prisma generate` (l'engine Prisma richiede rete non bloccata).
- L'agente Xcode Claude ha revisionato il diff (sicurezza, ordine middleware,
  fail-open, rotazione JWT) e individuato bug critici/medi/bassi, tutti
  corretti in questa stessa voce:
  - **CRITICO**: il wiring asincrono con `void (async () => ...)` registrava
    rate-limit e paywall AI DOPO le rotte (Express matcha prima la rotta) →
    inefficaci. Risolto serializzando tutto in `bootstrap()` con `await`
    prima di registrare le rotte.
  - **MEDIO**: `loginKeyFn` non distingueva `/login` da `/login-pin` (chiavi
    distinte per endpoint); client ioredis senza listener `'error'` (crash
    processo su Redis down); `notifyVenue` con condizione invertita
    (isolamento tenant); `PEXPIRE` ad ogni `INCR` Redis (lockout permanente);
    fallback silenzioso a segreto JWT dev in produzione (guardia
    `NODE_ENV=production` + `JWT_SECRET` mancante → exit 1).
  - **BASSO**: `orderDeps` cast ridondante rimosso; `errorLogger` degradato a
    `warn` per errori client (400/401/403) + rimosso log duplicato 500;
    `AuthError` gestito nell'error handler (401 invece di 500); sweep
    periodico dei bucket in-memory schedulato; rimosso singleton
    `getEntitlementService` (doppia cache con invalidazioni non allineate).

### Known gaps (non risolti in questa voce)
- Moduli solo-UI/non costruiti: `cash-treasury`, `chat`, `staff-shifts`,
  `cashier-pos` (scontrino fiscale IT), `vision`.
- `employee-mobile` resta React Native separata.
- Backup cifrati, i18n `Europe/Rome`, RLS Supabase: ancora da fare.

## [0.10.0] — 2026-08-26

Generazione dei frontend web moderni (Vite + React + TypeScript) sull'architettura
esistente, e primo giro di hardening del backend per l'avvio su un portatile.

### Added — Frontend
- `web-owner`: dashboard proprietario riscritta come vera app Vite (era solo
  `index.html` statico + una cartella `dashboard/` scollegata). Login JWT reale
  (email/password o PIN) davanti ai moduli già esistenti (Board ordini, Statistiche,
  Crediti, Magazzino, Fornitori, Ordini d'acquisto). Il client API ora passa da
  `lib/client.ts` con refresh automatico del token invece degli header dev-auth
  statici.
- `web-waiter`: nuova app cameriere da zero — mappa tavoli (libero/occupato,
  apertura sessione con n° coperti), menu per categoria, carrello, invio comanda,
  avanzamento stato ordine (servita/pagata), polling automatico.
- `web-kds-bar` / `web-kds-kitchen`: nuovi schermi KDS — stesso componente
  `Board.tsx`, differenziati solo da `VITE_STATION` (BAR / TAVOLA_CALDA) e porta
  dev. Colonne In arrivo/In preparazione/Pronti, invecchiamento a colori (verde
  <5', arancio <10', rosso oltre), bump al tap sulla riga, beep su nuovi arrivi,
  auto-refresh ogni 5s.
- Ogni app ha `.env.example` con `VITE_API_URL` per puntare all'IP del portatile
  in LAN.

### Added — Infrastruttura locale
- `docker-compose.yml`: Postgres locale in container per far girare il backend
  su un portatile senza servizi esterni.
- `README.md`: guida di avvio end-to-end (Postgres → API → frontend), inclusa
  la procedura per trovare l'IP LAN del portatile e servire i frontend buildati
  ai device di sala.

### Fixed
- `apps/api`: mancava `tsconfig.json` (lo script `build` lo richiedeva ma non
  esisteva) → aggiunto.
- `apps/api/package.json`: `version` allineata a questo changelog (era 0.7.0);
  script `test` corretto (puntava a un file `.ts` inesistente, il reale è `.mts`,
  e mancava la seconda suite).
- `apps/api/src/index.ts`: CORS configurabile via `CORS_ORIGIN` (di default `*`,
  necessario perché in LAN i frontend girano su origin/porte diverse dall'API).
- Rimossa `apps/dashboard/` (React scollegata, senza scaffold Vite): il suo
  contenuto è confluito in `web-owner`, ora l'unica dashboard proprietario.

### Verified
- Le 4 app frontend compilano (`tsc --noEmit`) e buildano (`vite build`) senza
  errori.
- Type-check del backend non completabile in questo ambiente di sviluppo (il
  download dell'engine Prisma da `binaries.prisma.sh` è bloccato dalla rete del
  sandbox); da verificare sul portatile reale con `npx prisma generate`.

### Known gaps (non risolti in questa voce)
- Manca un endpoint per chiudere una sessione tavolo / liberare il tavolo dopo
  il pagamento — la UI cameriere non lo espone di conseguenza.
- `employee-mobile` resta un'app React Native separata, non convertita in web
  app in questo giro.
- Redis/BullMQ, cache entitlement in produzione, moduli `cash-treasury`/`chat`/
  `staff-shifts`/`cashier-pos`/`vision`: ancora da costruire (vedi
  `ARCHITETTURA_TECNICA.md` §18).

## [Unreleased] — 2026-08-26 (audit)

Audit dello zip di export del repository, nessuna modifica funzionale al codice.

### Fixed / Da correggere (rilevato in questo audit, poi applicato in 0.10.0)
- `apps/api/package.json` riportava `version: 0.7.0`, disallineato rispetto a
  questo CHANGELOG (già a 0.9.0).
- Script `"test"` in `apps/api/package.json` puntava a `../../tests/ai.test.ts`
  (estensione errata); il file reale è `tests/ai.test.mts`.

### Note
- Lo zip esportato conteneva ~50 file sciolti in root (`auth.routes.ts`, `TODO.md`,
  `MODULO_AI.md`, `OTTIMIZZAZIONE_DASHBOARD.md`, `index (4).html`,
  `migration (1).sql`/`(2).sql`, ecc.) il cui **contenuto non corrispondeva al nome**
  (es. `auth.routes.ts` in root conteneva lo schema SQL, non le routes) — probabili
  download duplicati salvati senza sottocartelle. Non sono stati inclusi nel
  pacchetto rigenerato: struttura corretta e affidabile resta `apps/*/src`.

## [0.9.0] — 2026-07-27

Frontend per tutti i ruoli e **import del menu reale** nel database.

### Added — Webapp (HTML self-contained, `apps/`)
- `web-owner`: dashboard proprietario con analytics (incasso, scontrino medio, coperti,
  ordini, tempi di preparazione, rotazione tavoli, costo lavoro), grafici (incassi,
  mix bar/cucina), top prodotti, scorte basse; sezione **Forniture, pagamenti & cassa**
  (riordino AI, ordini fornitori, debiti cash/banca, **cassa dipendenti** per acquisti
  on-the-go, crediti/debiti).
- `web-kds-bar` e `web-kds-kitchen`: schermi ricezione ordini (KDS) in stile Toast/
  Lightspeed — colonne In arrivo/In preparazione/Pronti, invecchiamento a colori, bump,
  suono, auto-refresh, filtrati per postazione.
- `web-waiter`: app cameriere mobile-first — mappa tavoli, presa/gestione ordini
  offline-first, incasso, **turni + time table** con timbratura, notifiche orari, e
  **chat integrata** (canali team + diretta col proprietario).
- Ogni app documenta gli endpoint reali a cui agganciarsi; dati demo finché non si
  imposta `API_BASE`/token. Chat e turni richiedono i moduli backend `chat` e
  `staff-shifts` (da costruire).

### Added — Import menu
- `apps/api/prisma/menu.data.ts`: catalogo unico (**161 prodotti** dal menu cartaceo,
  prezzi in centesimi) diviso in Colazione/Bancone, Tavola calda, Bibite/Liquori, Birre,
  Bollicine, Cocktails, Cocktails analcolici, Gin, Whisky, Rum.
- `prisma/seed-menu.ts` (seed Prisma) e generatori `gen-menu-sql.mts`/`gen-menu-apps.mts`.
- SQL per Supabase: `seed/schema_supabase.sql` (18 tabelle, indici, FK), `seed/menu_prices.sql`
  (import), `seed/menu_import_supabase.sql` (+ variante `_clean` senza commenti) tutto-in-uno.
- `stations.ts` esteso con le nuove categorie (colazione, bibite, bollicine,
  cocktail_analcolico, gin, whisky, rum → BAR).

### Changed
- Import idempotente (chiave `venueId+code`) sul venue `venue_piazzetta`.

### Note
- 6 voci a prezzo "a range" impostate al limite inferiore (da confermare): Caffè
  shakerato, Centrifughe, Tortino, Bibite in lattina, Succhi di frutta, Frullati.

## [0.8.0] — 2026-07-27

Secondo blocco di allineamento: **auth JWT reale**, **coda job** (BullMQ-ready) ed
**entitlement/paywall**. Nessuna nuova dipendenza (crypto nativo + adapter pluggabili).

### Added — Auth (`apps/api/src/auth/`)
- `jwt.util.ts`: JWT **HS256** con crypto nativo (claims sub/venueId/roles/iat/exp).
- `password.util.ts`: hashing password/PIN con **scrypt**; refresh token come SHA-256.
- `auth.service.ts`: login email/password e PIN, refresh con **rotazione+revoca**.
- `auth.middleware.ts`: guard reale (Bearer) con fallback dev fuori produzione;
  `req.devUser` invariato → moduli a valle non toccati.
- `auth.routes.ts`: `/auth/login`, `/auth/login-pin`, `/auth/refresh`, `/auth/logout`.
- Schema: `User.passwordHash`, modello `RefreshToken` + migration.

### Added — Coda job (`apps/api/src/queue/`)
- `queue.ts`: interfaccia `Queue` + driver **in-memory** con retry/backoff.
- `bullmq.adapter.ts`: adapter **BullMQ/Redis** drop-in, lazy (attivo solo con
  `REDIS_URL` e pacchetto installato).

### Added — Entitlement (`apps/api/src/entitlement/`)
- `plans.config.ts`: piani Start/Pro/Enterprise + add-on (`ai-suite`, `marketing`).
- `entitlement.logic.ts`: risoluzione pura piano→moduli/feature/limiti con verifica
  dipendenze add-on.
- `cache.ts` + `entitlement.service.ts`: cache TTL con invalidazione (seam Redis).
- `entitlement.routes.ts`: `GET /me/entitlements` + `requireModule` (paywall 403).
- Schema: modello `VenueAddon` + migration. Wiring: modulo **AI gated** su piano/add-on.

### Changed
- Provider AI **nativo di default: OpenAI** per tutti i task (Anthropic come
  fallback/override via env).

### Verified
- `tests/auth-queue-entitlement.test.mts`: **38/38** (JWT, password/PIN, entitlement,
  cache, coda, AuthService end-to-end con Prisma mockato). Suite AI: **36/36**.

## [0.7.0] — 2026-07-27

Primo blocco di allineamento al changelog di progetto: **AiService reale**
(OpenAI + Anthropic) e prime integrazioni di dominio.

### Added — AiService (`apps/api/src/ai/`)
- `ai.service.ts`: astrazione unica sui due provider con **routing per task**,
  **fallback** automatico tra provider, **retry** con backoff esponenziale + jitter,
  **budget mensile** e **cache** in-memory per i task deterministici.
- `ai.provider.ts`: chiamate **reali** a OpenAI (Chat Completions) e Anthropic
  (Messages) via `fetch` nativo, con timeout (`AbortController`) e `ProviderError`
  (ritentabile vs permanente). Nessuna dipendenza SDK aggiuntiva.
- `ai.logic.ts`: logica pura (routing, backoff, `BudgetTracker`, stima costi, prompt
  per task, parsing JSON tollerante, fusione previsione → riordino).
- `ai.config.ts`: configurazione da env (chiavi, modelli, routing, budget, timeout,
  cache); `.env.example` come riferimento (chiavi mai nel repo).

### Added — Integrazioni di dominio
- `POST /api/v1/ai/upsell`: suggerimenti di upsell su un carrello.
- `POST /api/v1/ai/marketing-copy`: varianti social/email nel tono richiesto.
- `POST /api/v1/suppliers/reorder-proposals/ai`: **riordino predittivo** —
  `demand_forecast` sui movimenti `SALE` che alza il livello target del riordino
  quando la domanda prevista supera la configurazione statica (riusa `computeReorder`).
- `GET /api/v1/ai/status`: stato servizio + budget speso.

### Added — Build & doc
- `apps/api/package.json` (deps runtime: express, @prisma/client, zod, cors, dotenv;
  dev: prisma, typescript, tsx, @types).
- `MODULO_AI.md`: documentazione del modulo.

### Verified
- `tests/ai.test.mts`: **36/36** asserzioni a runtime (routing, fallback dopo 401,
  retry dopo 503, cache, budget, forecast → riordino) con `fetch` mockato.

### Note / roadmap
- Budget e cache sono per-processo: da spostare su **Redis** per il multi-istanza.
- Prossimi allineamenti (dal TODO): modulo `auth` (JWT reale), BullMQ, entitlement
  cache + `GET /me/entitlements`, completamento moduli `cashier-pos`/`payroll`/ecc.
