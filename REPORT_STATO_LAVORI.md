# La Piazzetta — Report Stato Lavori

**Data:** 22 settembre 2026 · **Versione:** 0.24.0 · **Repo:** github.com/HelvetiQuant/la-piazzetta

---

## 1. Panoramica

Piattaforma gestionale AI-native per bar/tavola calda. Architettura: Mac come
server locale + web app per dipendenti + app native owner (macOS/iPad).

| Componente | Tecnologia | Stato |
|---|---|---|
| Backend API | Express + Prisma + PostgreSQL | ✅ Operativo |
| Webapp Owner | React/Vite (`/owner`) | ✅ Operativa |
| Webapp Cameriere | React/Vite (`/waiter`) | ✅ Operativa |
| KDS Bar | React/Vite (`/kds-bar`) | ✅ Operativa |
| KDS Cucina | React/Vite (`/kds-kitchen`) | ✅ Operativa |
| App iOS owner | SwiftUI (Xcode) | ✅ Buildata e installata su iPad |
| App macOS owner | SwiftUI | ✅ Buildata |
| CI | 14 step automatici | ✅ Verde |

---

## 2. Funzionalità PRONTE e testate end-to-end

### Sala e comande (cameriere)
- ✅ Login PIN con picker visuale staff (niente ID tecnici)
- ✅ Apertura tavolo con coperti → coperto congelato all'apertura (anche oltre mezzanotte)
- ✅ Comanda con **note/allergie per riga** ("senza glutine" arriva evidenziato al KDS)
- ✅ Catalogo per categoria con stazione (bar/cucina) automatica
- ✅ Bozza carrello persistente (sopravvive a navigazione/refresh)
- ✅ Idempotenza invio: doppio tap o retry offline non duplica la comanda
- ✅ Annulla comanda con conferma
- ✅ **Prodotto esaurito**: badge ESAURITO, non ordinabile, errore chiaro
- ✅ Conto con IVA e coperto; **split alla romana** + misto contanti/carta; pagamento a credito cliente
- ✅ Notifiche "pronto al pass" lampeggianti + suono
- ✅ Clock-in/out turno, chat staff, note owner con conferma obbligatoria
- ✅ Crediti clienti: addebito sul conto con controllo fido

### Cucina e Bar (KDS)
- ✅ Board kanban In arrivo / In preparazione / Pronti
- ✅ **1-tap bump** (mani sporche) + aging colorato (verde→arancio→rosso 5'/10')
- ✅ Note cliente in evidenza; ricetta dietro icona ⓘ
- ✅ **"Prodotto finito" (86'd)** direttamente dal KDS → i camerieri smettono di venderlo all'istante
- ✅ Aggiornamento real-time via WebSocket
- ✅ Item serviti/annullati spariscono dalla board; stato ordine aggregato corretto

### Cassa
- ✅ Pagamenti atomici multi-metodo, resto, mance
- ✅ Storno riga con motivo obbligatorio (append-only + reso magazzino)
- ✅ Vendita al banco (quick-sale) separata dai tavoli
- ✅ Cassetto portasoldi: apertura/chiusura con conteggio e scostamento
- ✅ Chiusura giornaliera con riconciliazione e verdict

### Owner (webapp + iPad)
- ✅ Dashboard KPI real-time (incassi, ordini, coperti, top prodotti, confronto periodo)
- ✅ Menu CRUD con soft-delete e toggle esaurito
- ✅ Magazzino: giacenze, movimenti storicizzati, sottoscorta, rettifiche
- ✅ Fornitori + ordini d'acquisto (bozza→inviato→ricevuto)
- ✅ Contabilità italiana: piano conti, fatture, prima nota, CE, BP, IVA
- ✅ Presenze/stipendi, scheduling turni, disponibilità staff
- ✅ Chat staff, disposizioni con ack obbligatorio
- ✅ Crediti clienti con limiti fido
- ✅ Marketing: post social, commenti, Canva, **Gamma** (testato live), analytics

### AI (provider Mistral attivo, fallback OpenAI/Anthropic)
- ✅ **Assistente conversazionale owner** — chat con accesso ai dati reali:
  - "Resoconto incassi ultimi 3 giorni" → report numerico reale
  - "Chi posso mettere al bar venerdì sera?" → disponibilità vere dello staff
  - "Cosa c'è sotto scorta?" → magazzino reale
- ✅ **Comandi differiti**: "quando carico la foto, prepara il post per venerdì" →
  all'upload la bozza viene generata automaticamente con la foto (testato)
- ✅ Upsell AI sul carrello, marketing copy, auto-risposta commenti
- ✅ Previsione domanda → proposte di riordino
- ✅ Budget mensile, retry, cache, rate limit, paywall per piano
- ✅ Nessun crash su provider down (fallback a catena + errore pulito)

### Integrazioni esterne
- ✅ **Meta OAuth automatico** (Facebook+Instagram): pulsante "Connetti", token
  long-lived ~60gg, rinnovo, scoperta pagina+account IG business
- ✅ **Gamma**: generazione documenti/presentazioni (chiave verificata live)
- ✅ Canva, WhatsApp Business API (configurabili via env)

### Infrastruttura
- ✅ Monorepo ordinato (apps/ + packages/), Dockerfile + docker-compose
- ✅ Migrazioni Prisma, seed, wizard provisioning primo avvio
- ✅ Sicurezza: ruoli per endpoint, tenant isolation per venue, PIN hash scrypt
- ✅ WebSocket real-time KDS/dashboard, base-path per sotto-percorsi

---

## 3. Da terminare / note aperte

| # | Cosa | Priorità | Note |
|---|---|---|---|
| 1 | **App iOS owner: completare le schermate** | Alta | Build installata su iPad; la shell esiste, va verificata la parità funzionale con la webapp (dashboard, assistente AI, marketing…) |
| 2 | **Push "esaurito" real-time ai camerieri** | Media | Oggi il menu si aggiorna al refresh; aggiungere evento WS |
| 3 | **Chiavi AI di produzione** | Alta | In uso chiave Mistral temporanea; OpenAI/Anthropic del nodo B non valide/senza crediti — servono chiavi definitive |
| 4 | **Meta App review** | Media | Per pubblicare davvero servono app Meta in "Live" + scopes approvati (`instagram_content_publish`, `pages_manage_posts`) |
| 5 | **Vulnerabilità dipendenze** | Media | 24 alert Dependabot (5 high) — giro di aggiornamento npm pianificato |
| 6 | **Stampa comanda/scontrino fiscale** | Da decidere | Integrazione stampante/RT fiscale non ancora presente |
| 7 | **Ordini asporto/delivery** | Da decidere | Canale non gestito (oggi solo tavoli + banco) |
| 8 | **Backup automatico DB** | Media | Documentato in DEPLOY.md, schedulazione da attivare |
| 9 | **Report mensili/export commercialista** | Media | CE/BP presenti; export XML/CSV da completare se richiesto |
| 10 | **Test su dispositivi reali in servizio** | Alta | Provare durante un servizio vero (serata) per feedback UX |

---

## 4. Test effettuati

- **E2E reali sul DB**: sessione→ordine→KDS→servito→conto→pagamento→chiusura
- **Split payment** cash+carta, pagamento a credito con fido
- **Allergie** su KDS, **idempotenza** doppio-tap, **storno** con motivo
- **86'd**: marcatura da KDS → blocco vendita → riattivazione
- **Assistente AI**: incassi reali, disponibilità staff (UNAVAILABLE rispettata),
  comando differito upload foto → bozza post generata
- **Gamma**: documento reale generato via API
- **CI**: 14/14 step (typecheck, build, test unitari, ratchet qualità)

---

## 5. Accessi

| App | URL (rete locale) |
|---|---|
| Owner | `http://<mac>:3001/owner` |
| Cameriere | `http://<mac>:3001/waiter` |
| KDS Bar | `http://<mac>:3001/kds-bar` |
| KDS Cucina | `http://<mac>:3001/kds-kitchen` |
| App iPad | PiazzettaOwner (installata, team NHSGVLNV6B) |

**Stato complessivo: il cuore operativo (sala→cucina→cassa→chiusura) è pronto
e testato. Da completare: parità funzionale app iOS, chiavi AI definitive,
abilitazione pubblicazione social Meta, e un turno di prova reale.**
