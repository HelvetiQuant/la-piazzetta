/**
 * Piano dei conti italiano standard per bar/ristorazione.
 * Strutturato secondo codice civile art. 2424 (Stato patrimoniale)
 * e art. 2425 (Conto economico).
 */

export interface AccountSeed {
  code: string;
  name: string;
  category: 'ATTIVO' | 'PASSIVO' | 'COSTO' | 'RICAVO';
  subcategory: string;
  vatRate?: number;
  deductible?: boolean;
}

export const ITALIAN_CHART_OF_ACCOUNTS: AccountSeed[] = [
  // === ATTIVO ===
  // A) Crediti verso soci
  { code: '1.01', name: 'Crediti verso soci', category: 'ATTIVO', subcategory: 'Crediti verso soci' },
  // B) Immobilizzazioni
  { code: '2.01', name: 'Immobilizzazioni immateriali', category: 'ATTIVO', subcategory: 'Immobilizzazioni' },
  { code: '2.02', name: 'Costi di impianto e ampliamento', category: 'ATTIVO', subcategory: 'Immobilizzazioni' },
  { code: '2.03', name: 'Beni mobili (arredi, attrezzature)', category: 'ATTIVO', subcategory: 'Immobilizzazioni' },
  { code: '2.04', name: 'Macchinari e impianti', category: 'ATTIVO', subcategory: 'Immobilizzazioni' },
  { code: '2.05', name: 'Fondo ammortamento beni mobili', category: 'ATTIVO', subcategory: 'Immobilizzazioni' },
  { code: '2.06', name: 'Fondo ammortamento macchinari', category: 'ATTIVO', subcategory: 'Immobilizzazioni' },
  // C) Rimanenze
  { code: '3.01', name: 'Rimanenze merci', category: 'ATTIVO', subcategory: 'Rimanenze' },
  { code: '3.02', name: 'Rimanenze materie prime', category: 'ATTIVO', subcategory: 'Rimanenze' },
  // D) Attivo circolante
  { code: '4.01', name: 'Crediti commerciali (clienti)', category: 'ATTIVO', subcategory: 'Attivo circolante' },
  { code: '4.02', name: 'Crediti diversi', category: 'ATTIVO', subcategory: 'Attivo circolante' },
  { code: '4.03', name: 'IVA a credito', category: 'ATTIVO', subcategory: 'Attivo circolante' },
  { code: '4.04', name: 'Conto cassa', category: 'ATTIVO', subcategory: 'Attivo circolante' },
  { code: '4.05', name: 'Conto banca', category: 'ATTIVO', subcategory: 'Attivo circolante' },
  { code: '4.06', name: 'POS / Terminali pagamento', category: 'ATTIVO', subcategory: 'Attivo circolante' },
  { code: '4.07', name: 'Ratei e risconti attivi', category: 'ATTIVO', subcategory: 'Attivo circolante' },

  // === PASSIVO ===
  // A) Patrimonio netto
  { code: '5.01', name: 'Capitale sociale', category: 'PASSIVO', subcategory: 'Patrimonio netto' },
  { code: '5.02', name: 'Riserve', category: 'PASSIVO', subcategory: 'Patrimonio netto' },
  { code: '5.03', name: 'Utili portati a nuovo', category: 'PASSIVO', subcategory: 'Patrimonio netto' },
  { code: '5.04', name: 'Utile / Perdita esercizio', category: 'PASSIVO', subcategory: 'Patrimonio netto' },
  // B) Fondi rischi e oneri
  { code: '6.01', name: 'Fondo TFR', category: 'PASSIVO', subcategory: 'Fondi rischi e oneri' },
  { code: '6.02', name: 'Fondo imposte', category: 'PASSIVO', subcategory: 'Fondi rischi e oneri' },
  // C) Debiti
  { code: '7.01', name: 'Debiti verso fornitori', category: 'PASSIVO', subcategory: 'Debiti' },
  { code: '7.02', name: 'Debiti tributari', category: 'PASSIVO', subcategory: 'Debiti' },
  { code: '7.03', name: 'Debiti verso istituti previdenziali', category: 'PASSIVO', subcategory: 'Debiti' },
  { code: '7.04', name: 'Debiti verso dipendenti (stipendi)', category: 'PASSIVO', subcategory: 'Debiti' },
  { code: '7.05', name: 'IVA a debito', category: 'PASSIVO', subcategory: 'Debiti' },
  { code: '7.06', name: 'Debiti diversi', category: 'PASSIVO', subcategory: 'Debiti' },
  { code: '7.07', name: 'Ratei e risconti passivi', category: 'PASSIVO', subcategory: 'Debiti' },

  // === COSTI (Conto economico) ===
  // A) Valore della produzione
  { code: '8.01', name: 'Ricavi vendite e prestazioni (Bar)', category: 'RICAVO', subcategory: 'Ricavi', vatRate: 10 },
  { code: '8.02', name: 'Ricavi vendite (Tavola calda)', category: 'RICAVO', subcategory: 'Ricavi', vatRate: 10 },
  { code: '8.03', name: 'Ricavi bevande alcoliche', category: 'RICAVO', subcategory: 'Ricavi', vatRate: 22 },
  { code: '8.04', name: 'Ricavi variazioni rimanenze', category: 'RICAVO', subcategory: 'Ricavi' },
  { code: '8.05', name: 'Ricavi diversi (merchandising)', category: 'RICAVO', subcategory: 'Ricavi', vatRate: 22 },
  // B) Costi della produzione
  { code: '9.01', name: 'Acquisti materie prime (alimentari)', category: 'COSTO', subcategory: 'Acquisti', vatRate: 10, deductible: true },
  { code: '9.02', name: 'Acquisti bevande', category: 'COSTO', subcategory: 'Acquisti', vatRate: 22, deductible: true },
  { code: '9.03', name: 'Acquisti merci varie', category: 'COSTO', subcategory: 'Acquisti', vatRate: 22, deductible: true },
  { code: '9.04', name: 'Costo personale (stipendi e salari)', category: 'COSTO', subcategory: 'Costo personale' },
  { code: '9.05', name: 'Costo personale (oneri sociali)', category: 'COSTO', subcategory: 'Costo personale' },
  { code: '9.06', name: 'Costo personale (TFR)', category: 'COSTO', subcategory: 'Costo personale' },
  { code: '9.07', name: 'Affitti e canoni locazione', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.08', name: 'Energia elettrica', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.09', name: 'Acqua e gas', category: 'COSTO', subcategory: 'Servizi', vatRate: 10, deductible: true },
  { code: '9.10', name: 'Telefonia e internet', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.11', name: 'Manutenzione ordinaria', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.12', name: 'Pulizie', category: 'COSTO', subcategory: 'Servizi', vatRate: 10, deductible: true },
  { code: '9.13', name: 'Assicurazioni', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.14', name: 'Consulenze (commercialista)', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.15', name: 'Spese bancarie e commissioni', category: 'COSTO', subcategory: 'Servizi' },
  { code: '9.16', name: 'Marketing e pubblicità', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.17', name: 'Trasporti e spedizioni', category: 'COSTO', subcategory: 'Servizi', vatRate: 22, deductible: true },
  { code: '9.18', name: 'Ammortamenti beni mobili', category: 'COSTO', subcategory: 'Ammortamenti' },
  { code: '9.19', name: 'Ammortamenti macchinari', category: 'COSTO', subcategory: 'Ammortamenti' },
  { code: '9.20', name: 'Costi variabili diversi', category: 'COSTO', subcategory: 'Altri costi' },
  { code: '9.21', name: 'Costi generali', category: 'COSTO', subcategory: 'Altri costi' },
  // C) Proventi e oneri finanziari
  { code: '10.01', name: 'Interessi attivi', category: 'RICAVO', subcategory: 'Proventi finanziari' },
  { code: '10.02', name: 'Interessi passivi', category: 'COSTO', subcategory: 'Oneri finanziari' },
  { code: '10.03', name: 'Oneri finanziari diversi', category: 'COSTO', subcategory: 'Oneri finanziari' },
  // D) Imposte
  { code: '11.01', name: 'Imposte sul reddito (IREN/IRPEF)', category: 'COSTO', subcategory: 'Imposte' },
  { code: '11.02', name: 'IRAP', category: 'COSTO', subcategory: 'Imposte' },
];

export const VAT_RATES = [
  { rate: 22, label: '22% — Ordinaria' },
  { rate: 10, label: '10% — Ridotta (somministrazione alimenti)' },
  { rate: 4, label: '4% — Minima' },
  { rate: 0, label: '0% — Esente/Non imponibile' },
];
