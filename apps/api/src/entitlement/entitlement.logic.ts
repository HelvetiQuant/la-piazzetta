/**
 * Risoluzione PURA piano + add-on → moduli/feature/limiti abilitati.
 * Verifica le dipendenze degli add-on (un add-on con dipendenze mancanti è
 * RIFIUTATO e non abilita nulla). Nessuna I/O.
 */

import { PLANS, ADDONS, DEFAULT_PLAN, type ModuleId } from './plans.config.js';

export interface Entitlements {
  plan: string;
  modules: ModuleId[];
  features: string[];
  limits: Record<string, number>;
  addons: string[]; // add-on effettivamente applicati
  rejectedAddons: { id: string; reason: string }[];
}

export function resolveEntitlements(planId: string | null | undefined, addonIds: string[] = []): Entitlements {
  const plan = PLANS[(planId ?? '').toUpperCase()] ?? PLANS[DEFAULT_PLAN];

  const modules = new Set<ModuleId>(plan.modules);
  const features = new Set<string>(plan.features);
  const limits: Record<string, number> = { ...plan.limits };
  const applied: string[] = [];
  const rejected: { id: string; reason: string }[] = [];

  for (const rawId of addonIds) {
    const addon = ADDONS[rawId];
    if (!addon) {
      rejected.push({ id: rawId, reason: 'add-on sconosciuto' });
      continue;
    }
    // Le dipendenze vanno soddisfatte dal PIANO o da add-on già applicati.
    const missing = (addon.requiresModules ?? []).filter((m) => !modules.has(m));
    if (missing.length > 0) {
      rejected.push({ id: rawId, reason: `dipendenze mancanti: ${missing.join(', ')}` });
      continue;
    }
    addon.modules.forEach((m) => modules.add(m));
    (addon.features ?? []).forEach((f) => features.add(f));
    applied.push(addon.id);
  }

  return {
    plan: plan.id,
    modules: Array.from(modules),
    features: Array.from(features),
    limits,
    addons: applied,
    rejectedAddons: rejected,
  };
}

export function hasModule(ent: Entitlements, moduleId: ModuleId): boolean {
  return ent.modules.includes(moduleId);
}

export function hasFeature(ent: Entitlements, feature: string): boolean {
  return ent.features.includes(feature);
}

/** Limite numerico (-1 = illimitato). Ritorna Infinity se illimitato/assente. */
export function limitOf(ent: Entitlements, key: string): number {
  const v = ent.limits[key];
  if (v === undefined || v === -1) return Infinity;
  return v;
}
