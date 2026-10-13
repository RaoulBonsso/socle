import { etatInitial, noter, type EtatCarte, type Note } from "./srs";

/** Toute la progression tient dans un objet sérialisable (stockage local, export JSON). */
export interface Progression {
  version: 1;
  lecons: Record<string, string>; // slug → jour terminé
  cartes: Record<string, EtatCarte>;
  journal: Record<string, { lecons: number; revisions: number; defis?: number }>;
  defis: Record<string, EtatDefi>;
}

/** Un défi vécu : chronométré, hypothèses horodatées, solution soumise, auto-évaluation. */
export interface EtatDefi {
  debut: string; // ISO
  hypotheses: { t: string; texte: string }[];
  indices: number;
  solution: string;
  soumisLe: string | null;
  criteres: number[]; // index des critères atteints
}

export const VIDE: Progression = { version: 1, lecons: {}, cartes: {}, journal: {}, defis: {} };

function compter(p: Progression, jour: string, cle: "lecons" | "revisions" | "defis") {
  const j = p.journal[jour];
  const base = { lecons: j?.lecons ?? 0, revisions: j?.revisions ?? 0, defis: j?.defis ?? 0 };
  return { ...p.journal, [jour]: { ...base, [cle]: base[cle] + 1 } };
}

export function marquerLue(p: Progression, slug: string, cartes: string[], jour: string): Progression {
  const nouvelles = Object.fromEntries(cartes.filter((id) => !p.cartes[id]).map((id) => [id, etatInitial(jour)]));
  return {
    ...p,
    lecons: { ...p.lecons, [slug]: p.lecons[slug] ?? jour },
    cartes: { ...p.cartes, ...nouvelles },
    journal: p.lecons[slug] ? p.journal : compter(p, jour, "lecons"),
  };
}

export function reviser(p: Progression, id: string, note: Note, jour: string): Progression {
  const e = p.cartes[id] ?? etatInitial(jour);
  return { ...p, cartes: { ...p.cartes, [id]: noter(e, note, jour) }, journal: compter(p, jour, "revisions") };
}

export function joursActifs(p: Progression): Record<string, number> {
  return Object.fromEntries(Object.entries(p.journal).map(([j, x]) => [j, x.lecons + x.revisions + (x.defis ?? 0)]));
}

function veille(j: string) {
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function serie(p: Progression, jour: string): number {
  const actif = (j: string) => (joursActifs(p)[j] ?? 0) > 0;
  let n = actif(jour) ? 1 : 0;
  let j = veille(jour);
  while (actif(j)) {
    n++;
    j = veille(j);
  }
  return n;
}

export function lireProgression(brut: unknown): Progression {
  const p = brut as Progression;
  if (!p || p.version !== 1 || typeof p.lecons !== "object" || typeof p.cartes !== "object") return VIDE;
  return { ...VIDE, ...p, defis: p.defis ?? {} };
}

const etatDefi = (p: Progression, id: string, maintenant: string): EtatDefi =>
  p.defis[id] ?? { debut: maintenant, hypotheses: [], indices: 0, solution: "", soumisLe: null, criteres: [] };

export function commencerDefi(p: Progression, id: string, maintenant: string): Progression {
  return p.defis[id] ? p : { ...p, defis: { ...p.defis, [id]: etatDefi(p, id, maintenant) } };
}

export function ajouterHypothese(p: Progression, id: string, texte: string, maintenant: string): Progression {
  const e = etatDefi(p, id, maintenant);
  if (!texte.trim() || e.soumisLe) return p;
  return { ...p, defis: { ...p.defis, [id]: { ...e, hypotheses: [...e.hypotheses, { t: maintenant, texte: texte.trim() }] } } };
}

export function voirIndice(p: Progression, id: string, total: number, maintenant: string): Progression {
  const e = etatDefi(p, id, maintenant);
  return { ...p, defis: { ...p.defis, [id]: { ...e, indices: Math.min(total, e.indices + 1) } } };
}

/** Soumettre fige la réponse : on ne corrige pas sa copie après avoir vu la correction. */
export function soumettre(p: Progression, id: string, solution: string, maintenant: string): Progression {
  const e = etatDefi(p, id, maintenant);
  if (e.soumisLe || !solution.trim()) return p;
  const jour = maintenant.slice(0, 10);
  return { ...p, defis: { ...p.defis, [id]: { ...e, solution: solution.trim(), soumisLe: maintenant } }, journal: compter(p, jour, "defis") };
}

export function evaluer(p: Progression, id: string, criteres: number[]): Progression {
  const e = p.defis[id];
  if (!e?.soumisLe) return p;
  return { ...p, defis: { ...p.defis, [id]: { ...e, criteres: [...new Set(criteres)].sort((a, b) => a - b) } } };
}

/**
 * Score sur 100 : la part des critères atteints, moins 10 par indice consulté,
 * plus un bonus de 10 si la solution est partie dans le délai annoncé.
 */
export function score(e: EtatDefi, nbCriteres: number, dureeMin: number): number {
  if (!e.soumisLe) return 0;
  const base = nbCriteres ? (e.criteres.length / nbCriteres) * 100 : 50;
  const minutes = (Date.parse(e.soumisLe) - Date.parse(e.debut)) / 60_000;
  const bonus = minutes <= dureeMin ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(base - 10 * e.indices + bonus)));
}
