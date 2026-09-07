/**
 * Catalogo prodotti di La Piazzetta trascritto dal menu cartaceo.
 * Prezzi in CENTESIMI. Per le voci con prezzo "a range" (es. 4/5,00 €) è usato
 * il valore INFERIORE e la voce è marcata con `note` (da confermare a listino).
 *
 * `category` determina la postazione via `stationForCategory` (vedi stations.ts):
 *  - colazione/bibite/liquore/birra/bollicine/cocktail/cocktail_analcolico/gin/
 *    whisky/rum → BAR (bancone)
 *  - tavola_calda → TAVOLA_CALDA (cucina)
 *
 * `group` è l'etichetta di sezione del menu (per raggruppare nelle app).
 */

export const VENUE_ID = 'venue_piazzetta';
export const VENUE_NAME = 'La Piazzetta';

export interface MenuItem {
  code: string;
  name: string;
  category: string;
  group: string;
  priceCents: number;
  unit: string;
  note?: string;
}

type Row = [name: string, priceCents: number, note?: string];

interface Section {
  group: string;
  category: string;
  prefix: string;
  unit?: string;
  items: Row[];
}

const SECTIONS: Section[] = [
  {
    group: 'Colazione — Bancone',
    category: 'colazione',
    prefix: 'COL',
    items: [
      ['Caffè', 150], ['Caffè deca', 170], ['Caffè corretto', 300], ['Marocchino', 180],
      ['Orzo piccolo', 180], ['Orzo grande', 190], ['Ginseng piccolo', 180], ['Ginseng grande', 190],
      ['Caffè shakerato', 400, 'range 4/5,00'], ['Macchiatone', 170], ['Macchiatone soia/avena', 200],
      ['Cappuccino', 200], ['Cappuccino deca', 220], ['Cappuccino latte di soia', 220],
      ["Cappuccino latte d'avena", 250], ['Cappuccino orzo/ginseng', 220],
      ['Latte bianco', 160], ['Latte macchiato', 220], ['Latte di soia', 250], ["Latte d'avena", 270],
      ['Latte e menta', 350], ['Cioccolata', 400], ['Cioccolata con panna', 450],
      ['The / Infusi / Tisane', 450], ['Camomilla', 300], ['Acqua e menta', 300],
      ['1/2 acqua', 150], ['Bicchiere acqua', 50], ['Spremute', 400], ['Centrifughe', 500, 'range 5/7,00'],
      // pasticceria da bancone
      ['Brioches vuota', 130], ['Brioches farcite', 150], ['Brioches di pasticceria', 160],
      ['Tortino', 400, 'range 4/5,00'], ['Crema al caffè', 350], ['Focaccia', 120],
    ],
  },
  {
    group: 'Tavola calda',
    category: 'tavola_calda',
    prefix: 'TAV',
    items: [
      ['Focaccine farcite', 350], ['Toast', 400], ['Tramezzini', 350], ['Panini', 500],
      ['Panino Hamburger', 800], ['Patatine fritte', 500],
    ],
  },
  {
    group: 'Bar — Bibite e liquori',
    category: 'bibite',
    prefix: 'BIB',
    items: [
      ['Bicchiere H2O', 50], ['H2O minerale 50 cl', 150], ['Bibite in lattina', 350, 'range 3,5/5,50'],
      ['Succhi di frutta', 350, 'range 3,5/5,50'], ['Frullati di frutta fresca', 500, 'range 5/5,50'],
      ['Amari', 400], ['Vermouth', 600],
      ['Aperitivi (Martini/Aperol/Bitter/Crodino/Sanbitter/Campari soda)', 500],
      ['Pastis', 600], ['Limoncello', 400], ['Mirto', 400], ['Liquore alla liquirizia', 400],
    ],
  },
  {
    group: 'Bar — Birre',
    category: 'birra',
    prefix: 'BIR',
    items: [
      ['Birre in bottiglia', 650], ['San Gabriel Ambra Rossa', 650], ['San Gabriel Bionda', 650],
      ['San Gabriel Buschina', 650], ['San Gabriel Esportazione (IPA)', 650],
      ['Poretti Bionda alla spina (piccola)', 500], ['Poretti Bionda alla spina (media)', 600],
      ['Poretti Rossa alla spina (piccola)', 500], ['Poretti Rossa alla spina (media)', 600],
      ['Poretti IPA alla spina (piccola)', 500], ['Poretti IPA alla spina (media)', 600],
      ["Tennent's", 500], ['Corona', 500], ["Beck's", 500], ['Ceres', 500],
    ],
  },
  {
    group: 'Bollicine',
    category: 'bollicine',
    prefix: 'BOL',
    items: [
      ['Prosecco Mionetto Valdobbiadene (calice)', 600], ['Prosecco Mionetto Valdobbiadene (bottiglia)', 3000],
      ['Prosecco Mionetto Valdobbiadene Sergio (calice)', 600], ['Prosecco Mionetto Valdobbiadene Sergio (bottiglia)', 3500],
      ['Prosecco Mionetto Valdobbiadene Rosè (calice)', 600], ['Prosecco Mionetto Valdobbiadene Rosè (bottiglia)', 3500],
      ['Franciacorta Martinelli (calice)', 700], ['Franciacorta Martinelli (bottiglia)', 4000],
      ['Franciacorta Barone Pizzini (calice)', 700], ['Franciacorta Barone Pizzini (bottiglia)', 4500],
      ["Franciacorta Ca' Del Bosco (bottiglia)", 6000], ['Franciacorta Bellavista (bottiglia)', 6000],
      ['Champagne Moet Chandon (bottiglia)', 7000], ['Champagne Deutz (bottiglia)', 7000],
      ['Champagne Deutz Rosè (bottiglia)', 8000],
    ],
  },
  {
    group: 'Cocktails',
    category: 'cocktail',
    prefix: 'CKT',
    items: [
      ['Americano', 800], ['Bacardi Cocktail', 800], ['Between The Streets', 800], ['Black Russian', 800],
      ['Bloody Mary', 800], ['Caipiriña', 800], ['Caipiraia', 800], ['Caipirissima', 800], ['Caipiroska', 800],
      ['Campari Orange', 800], ['Daiquiri', 800], ['Gin Fizz', 800], ['Long Island Ice Tea', 800], ['Mai-Tai', 800],
      ['Manhattan', 800], ['Margarita', 800], ['Mary Pickford', 800], ['Negroni', 800], ['Negroni Sbagliato', 800],
      ['Negrosky', 800], ['Old Fashioned', 800], ['Piña Colada', 800], ['Piglione Defaticante', 800],
      ['Screw Driver', 800], ['Sidecar', 800], ['Stinger', 800], ['Strawberry Daiquiry', 800], ['Tequila Sunrise', 800],
      ['Vodka Stinger', 800], ['Vodka Martini', 800], ['Martini Cocktail', 800], ['White Lady', 800],
      ['Mojito', 800], ['Mojito Zenzero Lamponi', 800], ['Mojito Mule', 800], ['Moscow Mule', 800],
    ],
  },
  {
    group: 'Cocktails base spumante (metodo classico)',
    category: 'cocktail',
    prefix: 'CKS',
    items: [
      ['Bellini', 1000], ['Rossini', 1000], ['Mimosa', 1000], ['Kir Royal', 800], ['Aperol Spritz', 800], ['B4 Hugo Spritz', 800],
    ],
  },
  {
    group: 'Cocktails analcolici',
    category: 'cocktail_analcolico',
    prefix: 'CKA',
    items: [
      ['Coconut', 750], ['Golden Sunset Arancia', 750], ['Luisita', 750], ['Pellicano', 750], ['Piazzetta', 750], ['Sherley Temple', 750],
    ],
  },
  {
    group: 'Bar — Gin',
    category: 'gin',
    prefix: 'GIN',
    items: [
      ['Ginuensis', 900], ['Bombay', 900], ['Tanqueray', 900], ['Beefeater 24', 1200], ['Gin Mare', 1200],
      ['Hendricks', 1200], ['Elephant', 1200], ['Gin Arte', 1200], ['The Barmaster', 1200], ['Major', 1200],
      ['Salent Pool', 1200], ['Acquaverdi', 1200], ['Malfi Pompelmo', 1200], ['Brookmans', 1200],
    ],
  },
  {
    group: 'Bar — Whisky',
    category: 'whisky',
    prefix: 'WHI',
    items: [
      ['Lagavulin', 900], ['Oban', 900], ['Talisker', 900], ['Laphroaig', 900], ['Glen Grant', 800],
      ['Glen Morange', 900], ['Jack Daniels', 800], ['Wild Turkey', 800], ['Four Roses', 800],
    ],
  },
  {
    group: 'Bar — Rum',
    category: 'rum',
    prefix: 'RUM',
    items: [
      ['Zacapa', 800], ['Diplomatico Mantuano', 800], ['Diplomatico Anniversario', 900],
      ['Santa Teresa', 800], ['Havana 7 anni', 700], ['Pampero Anniversario', 800],
    ],
  },
];

/** Espande le sezioni in un catalogo piatto con codici deterministici e univoci. */
export const CATALOG: MenuItem[] = SECTIONS.flatMap((s) =>
  s.items.map((row, i) => {
    const [name, priceCents, note] = row;
    return {
      code: `${s.prefix}-${String(i + 1).padStart(3, '0')}`,
      name,
      category: s.category,
      group: s.group,
      priceCents,
      unit: s.unit ?? 'pz',
      note,
    } as MenuItem;
  }),
);
