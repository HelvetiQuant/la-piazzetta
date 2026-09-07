/**
 * Definizione DICHIARATIVA di piani e add-on — unica fonte di verità del
 * packaging. I moduli citati corrispondono agli id usati nel codice
 * (orders-tables, inventory, suppliers, credit, stats, ai, marketing).
 */

export type ModuleId =
  | 'orders-tables'
  | 'inventory'
  | 'suppliers'
  | 'credit'
  | 'stats'
  | 'ai'
  | 'marketing';

export interface PlanDef {
  id: string;
  label: string;
  modules: ModuleId[];
  features: string[];
  limits: Record<string, number>; // -1 = illimitato
}

export interface AddonDef {
  id: string;
  label: string;
  modules: ModuleId[];
  features?: string[];
  /** moduli richiesti (dipendenze) perché l'add-on abbia senso */
  requiresModules?: ModuleId[];
}

export const PLANS: Record<string, PlanDef> = {
  START: {
    id: 'START',
    label: 'Start',
    modules: ['orders-tables', 'inventory'],
    features: ['auto-decrement'],
    limits: { tables: 15, aiCallsPerMonth: 0 },
  },
  PRO: {
    id: 'PRO',
    label: 'Pro',
    modules: ['orders-tables', 'inventory', 'suppliers', 'credit', 'stats'],
    features: ['auto-decrement', 'reorder-alerts', 'credit-accounts', 'prep-stats'],
    limits: { tables: 60, aiCallsPerMonth: 2000 },
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    modules: ['orders-tables', 'inventory', 'suppliers', 'credit', 'stats', 'ai', 'marketing'],
    features: ['auto-decrement', 'reorder-alerts', 'credit-accounts', 'prep-stats', 'ai-forecast', 'ai-upsell', 'ai-marketing'],
    limits: { tables: -1, aiCallsPerMonth: -1 },
  },
};

export const ADDONS: Record<string, AddonDef> = {
  // L'AI predittiva (forecast/upsell) come add-on: richiede suppliers per il
  // riordino predittivo.
  'ai-suite': {
    id: 'ai-suite',
    label: 'AI Suite',
    modules: ['ai'],
    features: ['ai-forecast', 'ai-upsell'],
    requiresModules: ['suppliers'],
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing AI',
    modules: ['marketing'],
    features: ['ai-marketing'],
    requiresModules: ['ai'], // dipende dall'AI Suite
  },
};

export const DEFAULT_PLAN = 'START';
