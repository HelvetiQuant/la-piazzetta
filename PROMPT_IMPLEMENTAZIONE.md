# Prompt di implementazione — La Piazzetta

> Da consegnare a un agente di sviluppo (Claude Code, Devin o equivalente) con
> accesso in scrittura al repository `HelvetiQuant/la-piazzetta`.
> Riferimento: commit `c9b7fab` (2026-09-08).

---

## 0. Chi sei e cosa stai facendo

Sei un senior engineer full-stack che lavora su **La Piazzetta**, una piattaforma
gestionale AI-native per un bar con tavola calda, realmente in esercizio. Il
backend gira su un portatile in sala; i dipendenti si collegano da tablet e
telefoni sulla stessa rete Wi-Fi tramite web app.

Il codice esiste già ed è maturo: 140 endpoint, 40 modelli Prisma, 13 migration,
4 web app, un'app owner macOS/iOS in SwiftUI. **Non stai partendo da zero e non
devi riscrivere niente.** Stai chiudendo i buchi che impediscono al sistema di
essere usato in servizio.

Lavora in **quattro lotti sequenziali**. Ogni lotto è un blocco di commit
autonomo, con la pipeline verde alla fine. Non iniziare il lotto successivo
finché il precedente non è completo e verificato.

---

## 1. Regole trasversali — valgono per ogni riga che scrivi

**Lingua.** Codice, commenti, messaggi di commit, changelog, stringhe UI: tutto
in italiano. Il locale è italiano e l'owner legge il codice.

**Denaro.** Sempre `Int` in centesimi. Mai `Float`, mai `Decimal`, mai euro nel
database. La conversione avviene solo al bordo della UI.

**Struttura dei moduli.** Ogni dominio backend espone
`registerXxxRoutes(app, prisma, deps)` in `apps/api/src/<dominio>/` e **non
importa altri moduli di dominio**. Le dipendenze passano da `RouteDeps`
(`apps/api/src/http.ts`).

**Logica pura separata.** Ogni calcolo non banale va in un file `*.logic.ts`
senza I/O: niente Prisma, niente `fetch`, niente `Date.now()` implicito (passa
`now` come parametro). Questo è il motivo per cui il progetto ha 133 asserzioni
verdi senza database, ed è la convenzione più importante da rispettare.

**Test.** Ogni file `*.logic.ts` nuovo richiede una suite in `tests/` nello
stile esistente (asserzioni a runtime, nessun framework, `.mts` con
`--experimental-strip-types`). Guarda `tests/verify-purchase.mjs` come modello.

**Isolamento multi-tenant.** Ogni query che parte da un `id` fornito dal client
deve verificare il `venueId` PRIMA di agire. Il pattern del progetto è
guard-then-update:

```ts
const x = await prisma.model.findFirst({ where: { id, venueId: user.venueId } });
if (!x) { res.status(404).json({ error: 'Non trovato' }); return; }
await prisma.model.update({ where: { id }, data });
```

Non usare mai `findUnique({ where: { id } })` seguito da un update su risorse
che appartengono a un venue.

**Tipizzazione.** `strict` è attivo. **Non aggiungere `as any`.** Se il tipo non
torna, il tipo va risolto, non silenziato. C'è uno step di CI che te lo impedisce
(vedi Lotto 0.4).

**Migration.** Scritte a mano, additive, idempotenti (`IF NOT EXISTS`, FK
guardate), nella convenzione `apps/api/prisma/migrations/AAAAMMGG_nome/migration.sql`.
Aggiorna sempre anche `schema.prisma` e `prisma/seed/schema_supabase.sql`.

**AI: propone, non decide.** Nessuna azione automatica su denaro, ordini a
fornitori o comunicazioni verso l'esterno senza conferma umana esplicita.
Questo vincolo non è negoziabile in nessun lotto.

**Verifica prima di dichiarare fatto.** Prima di ogni commit:

```bash
make ci          # pipeline completa in Docker
```

Se non puoi usare Docker: `bash scripts/ci.sh api && bash scripts/ci.sh web`.
Un lotto è concluso solo con la pipeline verde. Non commentare test per farli
passare, non aggiungere `--force`, non allentare `tsconfig.json`.

**Changelog.** Ogni lotto aggiunge una voce in testa a `CHANGELOG.md` nel
formato Keep a Changelog già usato (`### Added` / `### Changed` / `### Fixed` /
`### Verified` / `### Known gaps`), con la data reale del giorno. Aggiorna anche
`ARCHITETTURA_TECNICA.md` per ogni modulo o modello nuovo.

---

## 2. Stato verificato del repository

Dati misurati sul commit `c9b7fab`, non dedotti dalla documentazione:

- Test di logica pura: **33/33, 14/14, 12/12** verdi.
- Suite AI **36/36** e Auth/Queue/Entitlement **38/38** verdi.
- Le 4 web app compilano e buildano pulite.
- Import ESM già corretti dal codemod: `moduleResolution: NodeNext` è coerente.
- Nessun segreto reale committato.
- `apps/api/src` contiene **66 occorrenze di `as any`**, di cui 10 aggiunte nel
  commit `c9b7fab`.

Documentazione da leggere prima di iniziare: `ARCHITETTURA_TECNICA.md` (fonte di
verità sull'architettura), `CHANGELOG.md`, `README.md`.

---

# LOTTO 0 — Hardening (mezza giornata)

Obiettivo: chiudere il buco di sicurezza e impedire che la qualità dei tipi
degradi ulteriormente. Nessuna funzionalità nuova.

## 0.1 Falla di sicurezza cross-tenant

`apps/api/src/index.ts:242`, `GET /api/v1/orders-tables/sessions/:id/orders`
filtra solo per `sessionId`: nessun controllo `venueId`, nessun `requireRoles`.
Un utente autenticato di qualsiasi venue, conoscendo un `sessionId`, legge
comande e importi di un altro locale.

È l'unica rotta che sfugge al pattern guard-then-update. Correggila:

```ts
where: { sessionId: id, session: { table: { venueId: user.venueId } } }
```

Aggiungi `requireRoles('OWNER', 'MANAGER', 'WAITER', 'CASHIER')`.

Poi **verifica sistematicamente tutte le 140 rotte**: per ognuna che accetta un
`:id` di risorsa, controlla che esista il filtro di venue. Elenca nel commit
quelle corrette. Se ne trovi altre, correggile con lo stesso pattern.

## 0.2 Denormalizzare `venueId`

`Order` e `TableSession` non hanno un `venueId` proprio: l'isolamento passa da
`session → table → venueId`, tre hop di join a ogni query. È fragile (facile
dimenticarlo, come in 0.1), lento e blocca la futura RLS su Supabase.

Migration `20260908_venue_denorm`:

- aggiungi `venueId String` a `TableSession` e `Order`, con relazione a `Venue`;
- backfill dai dati esistenti risalendo la catena `session → table`;
- indici `@@index([venueId, createdAt])` su entrambi;
- aggiorna tutte le query che oggi fanno il join a tre livelli usando il campo
  diretto.

## 0.3 Sostituire i 10 cast introdotti in `c9b7fab`

Sono soppressioni, non correzioni. Vanno risolte con tipi veri:

| File | Cast | Come risolverlo |
|---|---|---|
| `suppliers/purchase.routes.ts` (×2) | `include: {...} as any` | `Prisma.PurchaseOrderGetPayload<{ include: typeof includeArgs }>`, estraendo l'oggetto `include` in una costante con `satisfies Prisma.PurchaseOrderInclude` |
| `security/logger.ts` | `}) as any` sull'error handler | Tipare come `ErrorRequestHandler` di `express`. **Attenzione**: se la firma a 4 argomenti è sbagliata, Express non invoca mai l'handler a runtime e il cast lo nascondeva. Verifica con un test che un errore lanciato in una rotta produca il log atteso. |
| `entitlement/cache.ts`, `security/rate-limit.ts` | `(await import('ioredis')).default as any` | `import type Redis from 'ioredis'` e tipizzare l'import dinamico. `ioredis` è in `optionalDependencies`: mantieni la degradazione se il pacchetto manca. |
| `accounting/accounting.routes.ts`, `marketing/marketing.routes.ts` (×3) | `} as any` su payload Prisma | Tipi `Prisma.XxxCreateInput` / `Prisma.InputJsonValue` per i campi JSON |
| `realtime/kds-ws.ts` | `...(payload as any)` | Definire un tipo `NotificationPayload` esplicito |

## 0.4 Ratchet sugli `as any`

Aggiungi a `scripts/ci.sh` uno step `ci_any_ratchet` che conta le occorrenze di
`as any` in `apps/api/src` e fallisce se superano il valore in un file
`.any-budget` committato in radice. Imposta il budget al valore **dopo** il
punto 0.3 (dovrebbe essere ~56). Il file va aggiornato solo verso il basso, mai
verso l'alto: se un lotto futuro ha bisogno di alzarlo, è il segnale che c'è un
problema di design da discutere, non da aggirare.

Registra lo step in tutti i target che includono `api`.

## 0.5 `.gitignore` e `.env.ci`

`.env.ci` è tracciato nel repo e non è coperto dal `.gitignore` (che ha `.env` e
`.env.*.local`, ma non `.env.ci`). Oggi contiene solo valori fittizi, ma è anche
ridondante: le stesse quattro variabili sono già in `docker-compose.ci.yml`, che
è la fonte usata davvero dalla pipeline.

- Cancella `.env.ci` (o rinominalo `.env.ci.example` se ti serve come riferimento).
- Stringi il `.gitignore`:

```gitignore
.env*
!.env.example
!.env.*.example
```

## 0.6 Igiene del repository

- Aggiungi un file `LICENSE` (proprietaria, tutti i diritti riservati, salvo
  diversa indicazione dell'owner — **chiedi prima di scegliere**).
- Aggiungi `.dockerignore` (almeno `node_modules`, `dist`, `.git`, `ios`, `macos`)
  per accelerare il contesto di build.
- `apps/employee-mobile/` è codice morto: la scelta di prodotto è web app.
  Spostalo in `archive/employee-mobile/` con un `README.md` che spiega perché,
  oppure rimuovilo. Non lasciarlo in `apps/` a confondere.

### Criteri di accettazione — Lotto 0

- `make ci` verde su tutti gli step, incluso "working tree pulito".
- `grep -r "as any" apps/api/src | wc -l` ≤ valore in `.any-budget`.
- Nessuna rotta con `:id` priva di controllo `venueId`: elenco nel commit.
- Un test dimostra che l'error handler Express viene effettivamente invocato.

---

# LOTTO 1 — Monorepo e componenti condivisi (2 giorni)

Va fatto **prima** del Lotto 2, altrimenti la cassa verrà duplicata in quattro
app.

## 1.1 Il problema, misurato

File byte-identici oggi:

- `src/lib/client.ts` → **4** copie (owner, waiter, kds-bar, kds-kitchen)
- `src/main.tsx`, `tsconfig.json`, `src/vite-env.d.ts` → **4** copie
- `src/components/StaffNotesBanner.tsx` → **3** copie
- `ios/PiazzettaOwner/` e `macos/PiazzettaOwner/` → stessi 27 file Swift,
  **10 identici, 17 già divergenti**

Inoltre `apps/web-owner/src/ui.tsx` (377 righe) è un design system completo e
ben fatto — `colors`, `Card`, `KpiCard`, `Delta`, `Badge`, `Button`, `Input`,
`Select`, `Segmented`, `Spinner`, `EmptyState`, `ErrorBanner`, `GlobalStyles` —
ma **esiste solo in web-owner**. Cameriere e KDS hanno stili inline riscritti a
mano, con colori diversi da quelli ufficiali.

Non c'è un `package.json` di root: non è un workspace, quindi non c'è modo di
condividere pacchetti.

## 1.2 Cosa costruire

```
package.json                 # npm workspaces: ["apps/*", "packages/*"]
packages/
  tsconfig/                  # tsconfig.base.json condiviso
  api-client/                # da lib/client.ts (fetch + refresh JWT automatico)
  ui/                        # da web-owner/src/ui.tsx
  shared-components/         # StaffNotesBanner, AddOnBanner
```

Regole:

- **Non riscrivere `ui.tsx`.** Spostalo e basta. È già buono.
- La palette deve essere **una sola**, allineata a quella ufficiale delle app
  Swift (`GlassSupport.swift`): rosso pomodoro `#C71F14`, oro `#D9A633`, verde
  oliva `#669933`, rosso scuro `#B31A19`, arancio `#E68C26`, sfondo `#F8F5F0`.
  I colori inline diversi in `CreditManagement.tsx` e negli altri frontend
  (`#c62828`, `#2e7d32`, `#1565c0`) vanno sostituiti con i token del pacchetto.
- Le web app diventano consumatori: import da `@la-piazzetta/ui` e
  `@la-piazzetta/api-client`. Nessuna copia locale residua.
- Allinea le versioni: tutte le web app sono a `0.1.0`, portale a `0.13.0`.
- Aggiorna `scripts/ci.sh` per il layout workspace (un `npm ci` in radice al
  posto di quattro installazioni separate).

## 1.3 Swift

Crea uno Swift Package condiviso con `APIClient`, `Models`, `AIAssistant`,
`GlassSupport` e le view comuni; target separati solo per ciò che diverge
davvero (macOS ha `ServerManager` e `ServerStatusView`, iOS no).

**Riconcilia i 17 file già divergenti**: per ognuno decidi quale versione è
corretta, non fare merge meccanici. Se una divergenza è intenzionale
(adattamento a iPhone), isolala dietro `#if os(macOS)`.

### Criteri di accettazione — Lotto 1

- `npm ci` in radice installa tutto; `make ci` verde.
- Zero file byte-identici tra `apps/web-*` (verificabile con `md5sum`).
- Zero colori hard-coded nei frontend: solo token da `@la-piazzetta/ui`.
- Il progetto Swift compila su entrambe le piattaforme.

---

# LOTTO 2 — v0.14.0 "Cassa e chiusura del cerchio" (1 settimana)

**Questo è il lotto che sblocca il prodotto.** Oggi il ciclo si ferma prima del
pagamento: la dashboard incassi mostra numeri parziali, la contabilità non ha
ricavi reali, il tavolo non si libera mai.

## 2.1 Stato verificato del problema

- Nessun modello `Payment`, nessun `CashDrawer` tra i 40 modelli esistenti.
- `Order.sessionId String` è **obbligatorio**: impossibile registrare una
  vendita al banco. In un bar è il caso d'uso dominante — caffè al volo,
  brioche, asporto: l'80% degli scontrini non ha un tavolo.
- `TableSession.closedAt DateTime?` **esiste già nello schema** ma nessuno dei
  140 endpoint lo scrive. Il tavolo passa a `OCCUPIED` all'apertura sessione e
  non torna mai `FREE`.

## 2.2 Schema — migration `20260909_cashier_pos`

```prisma
model Payment {
  id           String   @id @default(cuid())
  venueId      String
  venue        Venue    @relation(fields: [venueId], references: [id])
  orderId      String?
  sessionId    String?
  method       String   // CASH | CARD | CREDIT (buoni pasto NON accettati)
  amountCents  Int
  tipCents     Int      @default(0)
  changeCents  Int      @default(0)
  cashDrawerId String?
  customerId   String?  // valorizzato quando method = CREDIT
  // esito restituito dal terminale POS (scambio importo, vedi Lotto 2 bis)
  posTerminalId String?
  posAuthCode   String?
  posTxnId      String?
  createdBy    String
  createdAt    DateTime @default(now())

  @@index([venueId, createdAt])
  @@index([orderId])
}

model CashDrawer {
  id              String    @id @default(cuid())
  venueId         String
  shiftId         String?   // turno di bar a cui il cassetto è legato
  openedBy        String
  openedAt        DateTime  @default(now())
  openingCents    Int
  closedBy        String?
  closedAt        DateTime?
  countedCents    Int?      // contato a mano a fine turno
  expectedCents   Int?      // calcolato dai movimenti
  differenceCents Int?      // counted - expected
  note            String?
  status          String    @default("OPEN")

  @@index([venueId, openedAt])
}
```

Modifiche ai modelli esistenti:

- `Order.sessionId` → **opzionale** (attenzione: c'è una FK non-null da
  rilassare, la migration va scritta con cura e testata su database vuoto).
- `Order.channel String @default("TABLE")` — valori `TABLE | COUNTER | TAKEAWAY`.
- `Order.discountCents Int @default(0)`, `Order.coverChargeCents Int @default(0)`.
- `TableSession`: aggiungi `closedBy`, `totalCents`, `status`
  (`OPEN | CLOSED`). `closedAt` c'è già.

## 2.3 Coperto e turni di cassa — decisioni dell'owner

**Coperto: importo fisso a persona, differenziato per giorno.**
1,50 € nei giorni feriali, 1,80 € nel weekend. Non è una costante: è una regola.

```prisma
model CoverChargeRule {
  id             String @id @default(cuid())
  venueId        String
  weekdayCents   Int    @default(150)
  weekendCents   Int    @default(180)
  weekendDays    Int[]  @default([6, 7])  // ISO: 6 = sabato, 7 = domenica
  appliesTo      String @default("TABLE") // solo servizio al tavolo

  @@unique([venueId])
}
```

Tre vincoli da rispettare:

- **Congela la tariffa all'apertura della sessione**, non al momento del conto.
  Un tavolo che si siede venerdì alle 23:00 e paga sabato alle 00:30 non deve
  cambiare tariffa a metà cena. Salva
  `TableSession.coverChargeCentsPerGuest` come snapshot alla creazione.
- **Il coperto si applica solo al canale `TABLE`.** Niente coperto su vendita al
  banco o asporto.
- **`TableSession.guests` ha oggi `@default(1)`**: con il coperto a importo
  fisso quel default diventa un errore di incasso silenzioso (1,50 € invece di
  6,00 € per un tavolo da quattro). Rendi il numero di coperti **obbligatorio**
  all'apertura del tavolo nella UI del cameriere, e verifica che il valore sia
  coerente in `computeBill`.

Nota fiscale per il Lotto 4: il coperto è una voce imponibile al 10% come la
somministrazione, e va indicato sullo scontrino. Serve quindi un prodotto o un
reparto dedicato, non un importo aggiunto in coda al totale.

**Metodi di pagamento accettati: contanti, carta, conto sospeso (credito).**
I **buoni pasto non sono accettati**: non introdurre il metodo `VOUCHER` né la
relativa regola sul resto. Se in futuro servisse Satispay, passa comunque dal
terminale Worldline o da un metodo dedicato: non anticiparlo ora.

**Turno di cassa: uno per turno di bar, non uno al giorno.** Il cassetto è
gestito da chi sta al banco, quindi:

- `CashDrawer` si lega al modello `Shift` esistente (che ha già `shiftRole`
  con valore `BARMAN` e `status` OPEN/CLOSED) tramite `shiftId`;
- al cambio banconiere si **chiude il cassetto, si conta, se ne apre uno
  nuovo**. Non si passa il cassetto aperto da una persona all'altra: è l'unico
  modo perché la differenza di cassa sia attribuibile;
- un turno di bar non può iniziare senza cassetto aperto, e non può chiudersi
  lasciandone uno aperto: valida entrambe le transizioni;
- la chiusura giornaliera aggrega i cassetti del giorno, non li sostituisce.

## 2.4 Logica pura — `apps/api/src/cashier/bill.logic.ts`

Nessun I/O. Funzioni richieste, ognuna con test:

- `computeBill(orderItems, guests, coverChargeCentsPerGuest, sconto, channel)` →
  totale, imponibile, IVA per aliquota, righe aggregate. Il coperto entra solo
  se `channel === TABLE`.
- `splitBill(bill, mode)` — `mode` è `{ type: 'equal', parts: n }` oppure
  `{ type: 'byItems', groups: [...] }`. Invariante: la somma delle parti deve
  sempre uguagliare il totale, resti dell'arrotondamento inclusi (distribuiscili,
  non perderli).
- `applyDiscount(bill, discount)` — percentuale o importo fisso, con limite
  massimo configurabile
- `computeChange(totalCents, tenderedCents)` → resto, errore se insufficiente
- `reconcileDrawer(opening, payments, counted)` → atteso, differenza, verdetto

Casi limite da coprire nei test: conto a zero, sconto superiore al totale, split
in parti che non dividono esattamente (es. 10,01 € in 3), pagamento misto che
eccede il totale, resto su pagamento con carta (deve essere sempre 0), coperto
su tavolo aperto venerdì e chiuso sabato (tariffa congelata a 1,50 €), coperto
azzerato su canale COUNTER e TAKEAWAY, split che deve distribuire anche il
coperto tra le parti.

## 2.5 Endpoint — `apps/api/src/cashier/cashier.routes.ts`

```
GET    /api/v1/orders-tables/sessions/:id/bill      # conto aggregato
POST   /api/v1/orders-tables/sessions/:id/close     # chiude, libera il tavolo
POST   /api/v1/cashier/orders/:id/pay               # pagamento anche misto
POST   /api/v1/cashier/orders/:id/void-item         # storno riga con motivo
POST   /api/v1/cashier/quick-sale                   # vendita al banco
POST   /api/v1/cashier/drawer/open
POST   /api/v1/cashier/drawer/close
GET    /api/v1/cashier/drawer/current
GET    /api/v1/cashier/daily-report?date=           # chiusura giornaliera
```

Vincoli comportamentali:

- La chiusura sessione **fallisce con 409** se restano ordini non pagati o righe
  non servite. Riporta `Table.state` a `FREE` e valorizza `closedAt`, `closedBy`,
  `totalCents`, `status = CLOSED`. Notifica i KDS via `onBoardChange` per
  ripulire le board.
- `pay` accetta un **array** di metodi (pagamento misto: 20 € contanti + resto
  carta). Tutto in una transazione Prisma.
- `void-item` richiede un motivo obbligatorio e va in audit trail. Deve
  **stornare anche il movimento di magazzino** (movimento inverso di tipo
  `RETURN`, non cancellazione del `SALE` originale: l'audit trail è
  append-only).
- `quick-sale` crea un `Order` con `channel = COUNTER` e `sessionId = null`, già
  in stato `PAID`, in una sola chiamata: prodotti + metodo di pagamento.

## 2.6 Integrazione con i moduli esistenti

- **Contabilità**: ogni `Payment` genera una `JournalEntry` in partita doppia —
  DARE cassa/banca, AVERE ricavi + IVA a debito, usando i conti del piano
  italiano già presente in `accounting/chart-of-accounts.ts`. Da qui la
  contabilità si popola da sola.
- **Crediti**: `method = CREDIT` chiama `applyTransaction`
  (`credit/credit.logic.ts`) con controllo del fido. Se il fido è superato,
  409 con messaggio chiaro al cameriere. **Non duplicare la logica dei crediti**:
  richiamala.
- **Dashboard**: i KPI oggi leggono da `Order.totalCents`/`paidAt`. Verifica che
  i pagamenti misti e le vendite al banco entrino correttamente nei ricavi e nel
  breakdown bar/cucina.

## 2.7 Scambio importo con il POS

Il locale ha già un **PAX A920 Pro**, terminale Android con lettore contactless
e stampante integrata. Supporta i protocolli ECR **17, 21, 37, 47 e 99**, su
TCP/IP o seriale. Questo permette di eliminare la digitazione manuale
dell'importo sul terminale.

Flusso da implementare in `POST /cashier/orders/:id/pay` quando
`method = CARD`:

1. il backend invia l'importo al terminale via ECR su TCP;
2. il POS gestisce l'interazione col cliente (carta, PIN, contactless);
3. il POS restituisce esito, **Terminal ID**, **codice di autorizzazione** e
   **numero transazione**;
4. solo con esito positivo si crea il `Payment`, valorizzando i tre campi
   `posTerminalId` / `posAuthCode` / `posTxnId`;
5. poi parte l'emissione del documento fiscale (Lotto 4).

Vincoli di progettazione:

- **Il numero di protocollo deve essere configurabile** (`POS_ECR_PROTOCOL`),
  non cablato. Ogni acquirer usa un dialetto leggermente diverso del protocollo
  17, ed esistono casi documentati di A920 Pro in cui lo scambio importo
  funziona meglio con **ECR 37**. La scelta si fa provando sul campo.
- Configurazione del terminale: app **PAX Tools** → "Configura ECR", IP statico
  sulla LAN e porta dedicata (es. `192.168.1.200:8220`). Il launcher e il codice
  di accesso dipendono dall'acquirer.
- **Acquirer: Worldline Italia** (il terminale è fornito da Banca Passadore, che
  non è l'acquirer). Worldline offre lo scambio importo come servizio a
  catalogo, quindi il percorso è supportato e non artigianale. Due implicazioni:
  la funzione **va attivata sul contratto** prima che il terminale risponda —
  non basta configurarla in PAX Tools — e la documentazione di integrazione ECR
  va richiesta a Worldline.
- Il **codice terminale (TML)** è stampato sullo scontrino del POS ed è
  disponibile sul portale merchant **Byond** di Worldline. Serve sia per la
  configurazione del driver sia per il collegamento POS–RT (vedi 4.7).
- Dettaglio di configurazione noto sui POS in ECR17: l'opzione "scambio importo
  / importo obbligatorio" sul terminale va impostata su **NO**, altrimenti il
  terminale attende un importo digitato a mano. Da verificare col tecnico
  Worldline in fase di attivazione.
- **Rischio di rete da verificare per primo**: gli A920 Pro sono spesso
  consegnati con SIM preinstallata e operano in 4G, con la configurazione di
  rete bloccata dal gestore terminali. Lo scambio importo via TCP richiede che
  il terminale stia sulla WiFi/LAN del locale con IP statico. Se è bloccato,
  serve un intervento del GT: verificalo **prima** di pianificare il lavoro, non
  a metà implementazione. Se non è ottenibile, resta il fallback manuale e lo
  scambio importo si rimanda.
- **Timeout e stato ambiguo**: se il POS non risponde, non dare per fallita la
  transazione. Stesso trattamento previsto per il registratore: stato
  `UNKNOWN`, conferma umana prima di ritentare. Un doppio addebito è peggio di
  un mancato incasso.
- **Fallback manuale sempre disponibile**: se lo scambio importo non funziona,
  il cameriere deve poter registrare il pagamento con carta digitando
  l'importo sul terminale come si fa oggi. Non bloccare mai l'incasso.
- Interfaccia astratta `PaymentTerminal` in `apps/api/src/cashier/terminal.port.ts`,
  con `mock.driver.ts` per CI. Stesso schema del `FiscalPrinter` del Lotto 4.

Nota: il protocollo 17 è un'integrazione tecnica **facoltativa** ed è cosa
diversa dall'obbligo amministrativo di collegamento POS–RT sul portale
dell'Agenzia delle Entrate (vedi 4.7). Non confonderli.

## 2.8 Frontend cameriere — `apps/web-waiter`

**Modalità Banco** (nuova, e schermata di default per il ruolo barista):

- griglia dei 20 prodotti più venduti, ordinati per frequenza reale;
- ricerca rapida con tastiera;
- **due tap per un caffè**: prodotto → "Incassa contanti". Questo è il criterio
  di accettazione dell'intera schermata, misuralo.

**Flusso conto al tavolo**:

- pulsante "Conto" → riepilogo righe, coperti, sconto, totale;
- "Incassa" → scelta metodo (contanti con calcolo resto, carta, a credito con
  selezione cliente dall'anagrafica esistente);
- split: divisione in N parti uguali oppure selezione righe con checkbox;
- alla conferma, il tavolo torna libero sulla mappa **senza refresh manuale**.

`apps/web-waiter/src/pages/TableOrder.tsx` è a 711 righe: **spezzalo** prima di
aggiungerci la cassa, non dopo.

## 2.9 Frontend owner

Aggiungi al `web-owner` e all'app macOS una vista "Chiusura giornaliera":
incassato per metodo di pagamento, per postazione, storni con motivo,
differenza di cassa. È la schermata che l'owner guarderà ogni sera.

### Criteri di accettazione — Lotto 2

- Un servizio completo simulato end-to-end: apertura cassa → apertura tavolo →
  comanda → KDS → servito → conto → split → pagamento misto → tavolo libero →
  chiusura cassa quadrata.
- Una vendita al banco in **due tap**, senza tavolo.
- Le scritture contabili generate quadrano (`GET /accounting/trial-balance`
  bilanciato).
- Con il terminale mock: pagamento carta con scambio importo, esito negativo
  gestito, timeout che non produce doppio addebito, fallback manuale funzionante.
- `make ci` verde, nuove suite di test comprese.

---

# LOTTO 3 — v0.15.0 "L'agente AI" (1 settimana)

Oggi l'AI è **interamente on-demand**: BullMQ è cablato e attivo ma non c'è un
solo job ricorrente. L'AI reagisce, non agisce. Questo lotto la fa lavorare in
background.

## 3.1 Notifiche — `apps/api/src/notifications/`

**Buona notizia da non sprecare**: `marketing/marketing.service.ts` implementa
già chiamate reali a WhatsApp Cloud API (`publishToWhatsApp`, con
`WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`), Instagram e Facebook Graph. Non sono
stub. **Riusa quel codice**, non riscriverlo: estrai la parte di trasporto in un
modulo condiviso e costruiscici sopra.

Astrazione, sullo stesso modello di `AiService` (che è ben fatto: routing,
fallback, retry con backoff, budget, degradazione controllata):

```ts
interface NotificationChannel {
  readonly name: string;
  isAvailable(): boolean;                        // chiave presente?
  send(to: Recipient, msg: Message): Promise<SendResult>;
}
```

Driver: `WhatsAppChannel`, `EmailChannel` (SMTP), `WebPushChannel`,
`InAppChannel` (riusa il modello `StaffNote` già esistente, con ack obbligatorio).

Requisiti: fallback ordinato tra canali, **deduplica e cooldown** per non
tempestare l'owner, log di ogni invio, degradazione controllata se manca la
configurazione (mai un crash).

## 3.2 Motore di regole — `apps/api/src/agent/rules.logic.ts`

Logica pura, valutabile senza database:

```ts
interface Rule {
  id: string;
  trigger: TriggerType;
  condition: (ctx: RuleContext) => boolean;
  severity: 'info' | 'warning' | 'urgent';
  channels: string[];
  cooldownMinutes: number;
  buildMessage: (ctx: RuleContext) => Message;
}
```

Regole iniziali:

| Regola | Condizione |
|---|---|
| Scorta critica | giacenza sotto soglia **e** lead-time fornitore > giorni di copertura residua |
| Fido superato | credito cliente oltre `limitCents` |
| Fattura in scadenza | fattura fornitore non pagata a 3 giorni dalla scadenza |
| Incasso anomalo | incasso giornaliero fuori da ±2σ rispetto allo stesso giorno della settimana nelle ultime 8 settimane |
| Cucina in ritardo | tempo medio di preparazione > 15 min per 30 minuti consecutivi |
| Costo lavoro alto | costo lavoro > soglia % del ricavo previsto |
| Cassa non quadrata | differenza di cassa oltre soglia alla chiusura |

## 3.3 Job schedulati — `apps/api/src/agent/jobs.ts`

Repeatable job BullMQ (l'infrastruttura c'è già, `queue/bullmq.adapter.ts`):

| Orario | Job |
|---|---|
| 03:00 | chiusura contabile, riclassificazione, backup |
| 06:00 | previsione domanda → proposte riordino → **notifica all'owner** |
| ogni ora in servizio | valutazione regole di anomalia |
| lunedì 08:00 | proposta turni della settimana + report settimanale |
| 1° del mese | export per il commercialista |

**Tutti i job devono essere idempotenti**: se girano due volte non devono
duplicare nulla. Devono funzionare anche senza Redis, degradando al driver
in-memory già presente.

## 3.4 Approvazione one-tap

Il flusso che dà valore all'intero lotto:

1. Alle 06:00 l'agente calcola le proposte di riordino.
2. Manda all'owner un messaggio WhatsApp: cosa ordinare, da chi, quanto costa.
3. Il messaggio contiene un **link firmato a scadenza** (token monouso, TTL
   breve, legato al `venueId`; non un JWT di sessione).
4. L'owner apre, vede il riepilogo, conferma con un tap.
5. **Solo allora** il sistema genera il PDF dell'ordine e lo recapita al
   fornitore via email o WhatsApp.

Questo chiude anche il buco per cui `POST /purchase-orders/:id/send`
(`suppliers/purchase.routes.ts:94`) oggi cambia solo lo stato nel database senza
recapitare nulla.

**Nessuna variante di questo flusso in cui l'ordine parte da solo.** Nemmeno
sotto una soglia di importo, nemmeno per prodotti "sicuri".

### Criteri di accettazione — Lotto 3

- Un job schedulato girato due volte non produce effetti duplicati.
- Con `WHATSAPP_TOKEN` assente, l'agente degrada su email o in-app senza errori.
- Il link di approvazione scade e non è riutilizzabile: test dedicato.
- Nessun ordine a fornitore può partire senza un'azione umana registrata:
  test dedicato.
- `make ci` verde.

---

# LOTTO 4 — Ponte fiscale Axon Micrelec (1 settimana)

Il locale ha un registratore telematico **Axon Micrelec** (marchio italiano
della greca Micrelec). Finché non è collegato, il personale deve battere due
volte ogni scontrino: una sul nostro sistema e una sul registratore. È il
motivo per cui, senza questo lotto, l'adozione quotidiana non regge.

**Modello confermato: Axon Micrelec EDO PLUS II RT**, omologazione
`A.A.E. 0217760 del 16/06/2023`, **RT nativo**. Produttore e distributore:
AP.esse s.p.a. (Gruppo Buffetti), Gardigiano di Scorzè (VE), `info@apesse.com`,
T +39 041 583 05 94.

Essendo un RT nativo e non un misuratore fiscale convertito, ha firmware
recente (XML7.0, lotteria istantanea, protocollo 17 per lo scambio importo con
i POS). Questo aumenta la probabilità che il protocollo di comando sia esposto
su TCP: vedi 4.2.

## 4.1 Specifiche del dispositivo

Dalla scheda tecnica, i numeri che vincolano il progetto:

| Voce | Limite |
|---|---|
| Reparti | fino a **60** (8 diretti da tastiera), descrizione **20 caratteri** |
| Aliquote IVA | fino a **12** prefissate |
| Codici natura | fino a **6**, con ventilazione IVA |
| Modalità di pagamento | fino a **20** |
| Sconti e maggiorazioni | fino a **10** funzioni preimpostate |
| Loghi grafici | fino a 9, in testa e coda scontrino |
| Larghezza di stampa | 57 mm — **32 caratteri per linea** |
| DGFE | SD-HC |

Porte disponibili:

- **1 × RJ45 LAN 10/100 Mbps**
- 2 × USB (una riservata alla manutenzione, **una per collegamento PC**)
- 2 × seriali (PC, scanner o torretta LCD)
- 1 × RJ11 per il **cassetto portasoldi** (12 VDC)

## 4.2 Conseguenza principale: si va in TCP, non su seriale

La porta Ethernet integrata cambia il progetto rispetto all'ipotesi iniziale.

Il driver **Axon FPid Pro è software Windows** e funziona per scambio di file su
cartella; il protocollo **XON-XOFF su seriale** non ha checksum né controllo di
comunicazione, ed è considerato poco affidabile. Entrambi diventano ripieghi se
il dispositivo accetta i comandi fiscali su socket TCP, come è normale per gli
RT italiani dotati di LAN.

**Verifica questo per primo con AP.esse** (`info@apesse.com`, T +39 041 583 05 94):
è il produttore, e ha la documentazione che i concessionari locali spesso non
hanno. Chiedi il manuale del protocollo di comunicazione e la porta TCP di
ascolto. Se il TCP è disponibile:

- il backend può pilotare il registratore **direttamente dal portatile**,
  qualunque sia il sistema operativo, senza mini-PC Windows di appoggio;
- il collegamento è più affidabile della seriale e diagnosticabile;
- il ponte fiscale resta comunque un **modulo separato** dentro `apps/api`, non
  un servizio a parte.

Struttura:

```
apps/api/src/fiscal/
  fiscal.port.ts          # interfaccia FiscalPrinter
  fiscal.routes.ts
  spool.ts                # coda persistente, retry
  drivers/
    axon-tcp.driver.ts    # primario, se il TCP è confermato
    axon-serial.driver.ts # ripiego XON-XOFF
    mock.driver.ts        # sviluppo e CI
```

```ts
interface FiscalPrinter {
  isOnline(): Promise<boolean>;
  printReceipt(doc: FiscalDocument): Promise<FiscalResult>;
  printRefund(doc: FiscalDocument, ref: string): Promise<FiscalResult>;
  dailyClose(): Promise<ZReportResult>;   // la chiusura Z trasmette all'AdE
  readStatus(): Promise<PrinterStatus>;   // carta, errori, stato
  openDrawer(): Promise<void>;            // via RJ11 sul registratore
}
```

Se il locale cambia registratore, si riscrive un driver e non la cassa. In CI si
usa `mock.driver.ts` e non serve hardware.

## 4.3 Cassetto portasoldi: passa dal registratore

Il cassetto si collega in **RJ11 sul registratore**, non al portatile. Quindi
`POST /cashier/drawer/open` del Lotto 2 non pilota un dispositivo proprio: manda
il comando di apertura all'RT. Non comprare hardware aggiuntivo, e non
progettare un percorso separato.

Corollario: l'apertura del cassetto va tracciata come evento anche quando non
c'è una vendita (resto, fondo cassa, prelievo). È un dato di controllo, e con
un solo canale fisico è facile registrarlo.

## 4.4 Reparti e IVA

**Configurazione dichiarata dall'owner: aliquota unica al 10%.** È coerente con
il regime della somministrazione di alimenti e bevande in pubblico esercizio,
che copre anche le bevande alcoliche servite al tavolo o al banco. Il grosso del
venduto sta quindi su un solo reparto.

Questo semplifica molto il Lotto 4, ma **non autorizza a cablare il 10% nel
codice**. Restano casi tipici di un bar che seguono trattamenti diversi e che
vanno confermati col commercialista prima di programmare i reparti:

| Caso | Trattamento | Verifica |
|---|---|---|
| Asporto di alcolici (bottiglia da portare via) | cessione di bene, non somministrazione | il locale li vende? |
| Tabacchi | regime a monopolio, codice natura dedicato | c'è la rivendita? |
| Lotterie, gratta e vinci, ricariche, biglietti | fuori campo o esente, codici natura | quali di questi? |
| Corrispettivi non riscossi (conti sospesi) | modalità di pagamento, non aliquota | già previsto nel Lotto 2 |

Il dispositivo gestisce fino a 6 codici natura: lo spazio c'è.

**Il vincolo Micrelec resta.** Il registratore verifica che l'aliquota
dell'articolo inviato coincida con quella del reparto configurato; se non
coincidono, lo scontrino non viene stampato. Con un'aliquota sola il rischio è
basso, ma la validazione va implementata comunque: il giorno che si aggiunge un
reparto, l'errore sarebbe silenzioso e scoperto in cassa.

Mantieni quindi la mappatura come dato di prima classe, con una configurazione
iniziale minima:

```prisma
model VatDepartment {
  id           String @id @default(cuid())
  venueId      String
  departmentNo Int                    // 1..60, come programmato sull'RT
  description  String                 // max 20 caratteri, deve coincidere con l'RT
  vatRate      Int                    // centesimi di punto: 1000 = 10%
  natureCode   String?                // per tabacchi, lotterie, ricariche
  channel      String?                // TABLE | COUNTER | TAKEAWAY | null = tutti

  @@unique([venueId, departmentNo])
  @@index([venueId, vatRate, channel])
}
```

Il campo `channel` resta anche se oggi non discrimina: serve il giorno che si
aggiunge l'asporto di alcolici, ed è già disponibile da `Order.channel` del
Lotto 2. Non rimuoverlo per "semplificare".

Regole da implementare comunque:

- **Validazione preventiva**: ogni riga deve avere un reparto risolto e coerente
  prima dell'invio. Errore chiaro al cameriere, non rifiuto silenzioso dell'RT.
- **Comando di verifica**: un endpoint che rilegge la programmazione dei reparti
  dall'RT e la confronta con `VatDepartment`. All'avvio e in un job giornaliero:
  se qualcuno riprogramma il registratore da tastiera, te ne accorgi subito.
- **Limiti a schema**: 60 reparti, 12 aliquote, 6 codici natura. Valida in
  scrittura.
- **Descrizioni a 20 caratteri**, righe a **32 caratteri**: tronca in modo
  deterministico e testa il layout. Non lasciare che sia l'RT a tagliare come
  capita.

## 4.5 Metodi di pagamento

Il dispositivo gestisce fino a **20 modalità di pagamento**: spazio abbondante,
mappa i nostri `PaymentMethod` uno a uno e lascia i codici riservati documentati.

La codifica classica dei gestionali su XON-XOFF è `1T` contanti, `2T` assegni,
`3T` carte, `6T` crediti in sospensione, e le descrizioni programmate sull'RT
devono corrispondere, altrimenti gli scontrini escono con diciture errate.
Verifica la codifica effettiva sul manuale AP.esse invece di darla per buona.

Attenzione al caso `CREDIT`: il conto sospeso va sul codice dei **corrispettivi
non riscossi**, non su contanti. È la differenza tra una contabilità che quadra
e una che non quadra, e si riflette direttamente sulle scritture in partita
doppia generate nel Lotto 2.

## 4.6 Modalità operativa: chi comanda il registratore

L'EDO PLUS è un **registratore di cassa completo**, con tastiera a 40 tasti e
doppio display, non una semplice stampante fiscale. Quando è pilotato dal PC va
messo in modalità di emissione, e in quella modalità la vendita manuale da
tastiera non è disponibile.

È una decisione operativa, non tecnica: **chiedila all'owner**. Se il personale
deve poter battere qualcosa a mano (un caffè al volo mentre il tablet è
occupato), serve una procedura chiara per uscire e rientrare, e i due flussi
vanno riconciliati alla chiusura Z. La risposta più semplice e più sicura è che
il registratore sia pilotato **solo** dal nostro sistema.

## 4.7 Collegamento POS–RT: adempimento amministrativo, non tecnico

**Non modifica l'architettura.** L'obbligo introdotto dalla legge di bilancio
2025 e operativo dal 1° gennaio 2026 richiede di comunicare all'Agenzia delle
Entrate, tramite il portale "Fatture e Corrispettivi", l'associazione tra
ciascun POS (fisico, virtuale o softPOS) e il registratore telematico. È una
dichiarazione, non un cablaggio: il flusso di `POST /cashier/orders/:id/pay`
resta quello progettato nel Lotto 2.

Due implicazioni pratiche da segnalare all'owner, non da implementare:

- La prima comunicazione per i POS in uso a gennaio 2026 scadeva il **20 aprile
  2026**; le sanzioni vanno da 1.000 a 4.000 euro. Da verificare col
  commercialista che sia stata fatta.
- Per ogni nuovo POS o variazione la finestra va dal sesto all'ultimo giorno
  lavorativo del secondo mese successivo alla disponibilità dello strumento.
  **Se in futuro il sistema integra pagamenti online o un softPOS, va dichiarato
  anche quello**: mettilo nella documentazione del modulo pagamenti come nota
  operativa.

## 4.8 Robustezza — il requisito principale del lotto

Questa è la parte che distingue un'integrazione fiscale che regge un servizio
da una che fa perdere incassi.

- **Spool persistente su disco.** Registratore offline, senza carta o in errore:
  lo scontrino va in coda e viene ritentato. Non si perde, non blocca la cassa,
  il cameriere vede lo stato.
- **Idempotenza.** Ogni documento porta un `clientDocId` univoco (stessa logica
  di `Order.clientOrderId`). Un retry dopo timeout non deve mai produrre **due**
  scontrini fiscali: è un errore che costa denaro e va spiegato all'Agenzia
  delle Entrate.
- **Stato ambiguo esplicito.** Se il comando va in timeout non sai se lo
  scontrino è uscito. Marca `UNKNOWN`, non `FAILED`, e chiedi conferma umana
  ("lo scontrino è stampato? sì/no") prima di ritentare.
- **Chiusura Z riconciliata.** L'RT nativo trasmette autonomamente all'Agenzia
  delle Entrate alla chiusura giornaliera. Comanda la chiusura dal nostro
  sistema e confronta il totale Z con `GET /cashier/daily-report`: se divergono,
  alza un alert. È il controllo che scopre mancate emissioni ed errori di
  battitura.
- **Sensore fine carta.** Il dispositivo lo segnala: leggilo in `readStatus()` e
  avvisa **prima** che il rotolo finisca a metà servizio.

## 4.9 Schema

Migration `20260916_fiscal`, oltre a `VatDepartment` sopra:

```prisma
model FiscalDocument {
  id            String    @id @default(cuid())
  venueId       String
  orderId       String?
  clientDocId   String    @unique      // idempotenza
  type          String    // RECEIPT | REFUND | VOID
  status        String    // QUEUED | SENT | PRINTED | FAILED | UNKNOWN
  payloadJson   Json                    // documento inviato, per audit
  fiscalNumber  String?                 // numero restituito dall'RT
  zReportNumber String?
  errorCode     String?
  attempts      Int       @default(0)
  createdAt     DateTime  @default(now())
  printedAt     DateTime?

  @@index([venueId, createdAt])
  @@index([status])
}
```

### Criteri di accettazione — Lotto 4

- Con `mock.driver.ts`, la pipeline verifica: emissione, storno, chiusura Z,
  retry su offline, e che un doppio invio dello stesso `clientDocId` produca
  **un solo** documento.
- Registratore staccato a metà servizio: la cassa continua a funzionare, gli
  scontrini si accodano, alla riconnessione escono tutti una volta sola.
- Il totale della chiusura Z coincide con `GET /cashier/daily-report`.
- Un prodotto con aliquota non mappata viene rifiutato **prima** dell'invio, con
  messaggio comprensibile.
- La verifica dei reparti rileva una divergenza introdotta a mano sull'RT.
- Il layout dello scontrino rispetta 32 caratteri per linea e 20 per reparto.

---

## 3. Cosa NON fare

- Non riscrivere moduli che funzionano. `AiService`, `computeReorder`,
  `applyTransaction`, `canTransition`, `applyReceipt`, il piano dei conti e
  `ui.tsx` sono codice buono e testato.
- Non introdurre dipendenze nuove senza necessità reale. Il progetto usa `fetch`
  nativo, `crypto` nativo e nessun SDK per AI, auth e code: è una scelta
  deliberata, rispettala.
- Non toccare `tsconfig.json` per far passare il typecheck.
- Non aggiungere `as any`.
- Non implementare lo **scontrino fiscale telematico** dentro il Lotto 2. Il
  registratore è un Axon Micrelec e ha vincoli suoi: è il Lotto 4. Nel Lotto 2
  progetta la cassa in modo che l'emissione del documento fiscale si innesti
  dopo, dietro l'interfaccia `FiscalPrinter`, senza rifattorizzare i pagamenti.
- Non fare commit monolitici. Un commit per unità logica coerente, messaggio in
  italiano che spiega **perché**, non solo cosa.

---

## 4. Da chiarire con l'owner prima di partire

Fai queste domande **prima** di scrivere codice sul Lotto 2 — le risposte
cambiano il design:

1. ~~Registratore telematico: marca e modello?~~ **Risposto: Axon Micrelec EDO
   PLUS II RT** (omologazione 0217760, RT nativo). Resta da chiarire per il
   Lotto 4: (a) il **manuale del protocollo di comunicazione e la porta TCP**,
   da richiedere ad AP.esse — è il punto che sblocca l'intero lotto; (b) se il
   personale deve poter battere a mano dal registratore mentre il sistema lo
   pilota (vedi 4.6).
2. ~~Coperto?~~ **Risposto: fisso a persona, 1,50 € feriali / 1,80 € weekend.**
   Resta da confermare quali giorni contano come weekend (sabato e domenica, o
   anche il venerdì sera?) e il trattamento dei festivi infrasettimanali.
3. **Prodotti fuori dal 10%**: il locale vende alcolici da asporto, tabacchi,
   gratta e vinci, ricariche telefoniche o biglietti? Ognuno richiede un reparto
   o un codice natura dedicato sul registratore. Da confermare col
   commercialista.
4. ~~Acquirer del POS?~~ **Risposto: Worldline Italia**, terminale fornito da
   Banca Passadore. Restano da ottenere da Worldline: attivazione dello scambio
   importo sul contratto, documentazione ECR con protocollo e porta, e la
   possibilità di mettere l'A920 Pro sulla WiFi del locale con **IP statico**
   invece che su SIM 4G (verificare per primo: è il rischio di pianificazione
   maggiore del Lotto 2).
   Nota per l'owner, non implementativa: se esistono due convenzionamenti
   distinti — PagoBancomat e carte di credito — su un unico terminale fisico,
   sul portale dell'Agenzia vanno registrati **due collegamenti separati**, uno
   per acquirer.
5. ~~Metodi di pagamento?~~ **Risposto: contanti, carta, conto sospeso. Buoni
   pasto non accettati.** Resta da confermare se Satispay è accettato.
6. ~~Turni di cassa?~~ **Risposto: uno per turno di bar**, gestito da chi sta al
   banco. Modellato su `Shift`.
7. **Licenza** del repository: proprietaria o altro?
