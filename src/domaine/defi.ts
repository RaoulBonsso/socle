import { z } from "zod";
import { PISTES } from "./types";

export const schemaDefi = z.object({
  titre: z.string().min(5),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  piste: z.enum(PISTES),
  difficulte: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  duree: z.number().int().min(10).max(240),
  contexte: z.string().min(10),
  competences: z.array(z.string()).min(1),
  livrable: z.string().min(5),
  indices: z.array(z.string()).min(1).max(5),
  criteres: z.array(z.string()).min(2),
  lecons: z.array(z.string()).default([]),
  sources: z.array(z.object({ titre: z.string(), url: z.string().url() })).min(1),
});

export interface Defi extends z.infer<typeof schemaDefi> {
  id: string;
  enonce: string;
  correction: string;
}

const SEPARATEUR = /^===CORRECTION===\s*$/m;

/** Un défi = en-tête JSON, énoncé markdown, puis la correction après `===CORRECTION===`. */
export function lireDefi(id: string, brut: string): Defi {
  const m = brut.match(/^---json\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error(`Défi « ${id} » : en-tête ---json absent`);
  const [enonce, correction, ...reste] = m[2].split(SEPARATEUR);
  if (!correction?.trim() || reste.length) throw new Error(`Défi « ${id} » : il faut exactement une correction après ===CORRECTION===`);
  return { ...schemaDefi.parse(JSON.parse(m[1])), id, enonce, correction };
}

/** Le défi du jour ; à défaut, le plus récent non soumis (rattrapage) ; sinon le plus récent. */
export function defiDuJour(defis: Defi[], jour: string, soumis: Set<string>): Defi | null {
  const passes = defis.filter((d) => d.date <= jour).sort((a, b) => (a.date < b.date ? 1 : -1));
  return passes.find((d) => d.date === jour) ?? passes.find((d) => !soumis.has(d.id)) ?? passes[0] ?? null;
}

/** Millisecondes restantes avant minuit, heure de Paris : l'échéance du défi. */
export function avantMinuit(maintenant: Date): number {
  const paris = new Date(maintenant.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const minuit = new Date(paris);
  minuit.setHours(24, 0, 0, 0);
  return minuit.getTime() - paris.getTime();
}
