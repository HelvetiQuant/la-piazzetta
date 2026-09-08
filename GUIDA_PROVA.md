# La Piazzetta — Guida alla prova

Ambiente di prova su rete locale. **Nessun dato è reale e nessuno scontrino
viene emesso**: si può sbagliare liberamente, anzi è quello che serve.

---

## Come si avvia (sul portatile)

```bash
make prova
```

Il comando fa tutto: accende il database, prepara i dati, costruisce le app e
avvia il server. Alla fine stampa gli indirizzi da usare.

Per ricominciare da zero, cancellando tutto quello che è stato inserito durante
le prove: `make prova-reset`. Per spegnere: `Ctrl+C`, poi `make prova-stop`.

---

## Come ci si collega (dal telefono o dal tablet)

Il dispositivo deve stare sulla **stessa rete Wi-Fi del portatile**. L'indirizzo
è quello stampato all'avvio, nella forma `http://192.168.x.x:3000`.

| Chi | Indirizzo |
|---|---|
| Titolare | `…:3000/owner` |
| Cameriere | `…:3000/waiter` |
| Schermo bar | `…:3000/kds-bar` |
| Schermo cucina | `…:3000/kds-kitchen` |

Conviene aggiungere l'indirizzo alla schermata principale del telefono: si apre
come un'app.

### Accessi

Password uguale per tutti: **`Prova2026!`**

| Ruolo | Email | PIN |
|---|---|---|
| Titolare | `titolare@lapiazzetta.local` | 1111 |
| Banco | `banco@lapiazzetta.local` | 2222 |
| Sala | `sala@lapiazzetta.local` | 3333 |
| Cucina | `cucina@lapiazzetta.local` | 4444 |

---

## Cosa c'è già dentro

I tavoli del locale nelle tre aree — 5 interni, 5 nel dehors, e gli esterni —
il menu completo, 3 fornitori, 3 clienti con conto aperto, e le giacenze di
magazzino con qualche prodotto volutamente sotto soglia, che serve a far
scattare le proposte di riordino.

Se la numerazione dei tavoli non corrisponde a quella vera del locale,
segnalatelo: è la prima cosa da sistemare, perché il personale deve ritrovare
sullo schermo gli stessi numeri che ha in testa.

---

## Cosa provare

Fatelo **in servizio o simulando un servizio vero**, non a tavolino. I problemi
veri escono quando si ha fretta.

### Cameriere — la prova più importante

1. Aprire un tavolo, prendere una comanda di 4-5 voci, inviarla.
2. Aggiungere altre voci al tavolo già aperto.
3. Prendere due tavoli contemporaneamente senza confonderli.
4. Provare con le mani bagnate, con lo schermo sporco, in controluce.
5. Allontanarsi dal Wi-Fi e tornare: la comanda si perde?

Domande a cui rispondere: **quanti tocchi servono per una comanda semplice?**
C'è qualcosa che si trova a fatica nel menu? Il pulsante giusto è sotto il
pollice o bisogna cambiare presa?

### Schermi bar e cucina

1. Le comande arrivano subito? Si sente il suono?
2. Si leggono da dove sta davvero chi lavora, a distanza e con la luce del
   locale?
3. Il colore che segna il ritardo si nota mentre si lavora, o passa inosservato?
4. Segnare "pronto" è comodo con le mani occupate?

### Titolare

1. La dashboard dice quello che vuoi sapere in dieci secondi, o devi cercarlo?
2. Magazzino: le proposte di riordino hanno senso?
3. Clienti a credito: registrare un pagamento parziale.
4. Fornitori: creare un ordine e provare a inviarlo.
5. Turni e statistiche: c'è qualcosa di sbagliato o mancante?

---

## Cosa NON funziona ancora (è atteso, non serve segnalarlo)

- **Non si chiude il conto e non si incassa.** È la parte che stiamo
  costruendo: il tavolo resta occupato per sempre e gli incassi in dashboard
  sono parziali.
- **Non si vende al banco senza tavolo.** Per provare un caffè al volo bisogna
  aprire un tavolo finto.
- **Il registratore di cassa e il POS non sono collegati.**
- **L'ordine al fornitore non parte davvero**: cambia solo stato.
- **Nessuna notifica** arriva sul telefono.

---

## Come segnalare

Per ogni problema servono tre righe:

1. **Chi eri** (quale accesso) e **su cosa** (telefono, tablet, quale app).
2. **Cosa stavi facendo**, passo per passo.
3. **Cosa ti aspettavi** e **cosa è successo invece**.

Una foto o un video di dieci secondi valgono più di mezza pagina di
descrizione. Se qualcosa è solo scomodo e non rotto, **segnalalo lo stesso**:
la lentezza in servizio costa più di un errore raro.
