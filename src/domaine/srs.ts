/**
 * Révision espacée, variante de SM-2 (Wozniak, 1987 — l'algorithme d'origine
 * d'Anki). On revoit une notion juste avant de l'oublier : l'intervalle
 * grandit à chaque rappel réussi et repart de zéro après un oubli.
 */

export type Note = 1 | 2 | 3 | 4; // encore · difficile · bien · facile

export interface EtatCarte {
  repetitions: number;
  intervalle: number; // jours
  facilite: number;
  echeance: string; // AAAA-MM-JJ
  oublis: number;
  derniere: string | null;
}

export const LIBELLES_NOTE: Record<Note, string> = { 1: "Encore", 2: "Difficile", 3: "Bien", 4: "Facile" };

const PLAFOND = 365;
const FACILITE_MIN = 1.3;

function decaler(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const etatInitial = (jour: string): EtatCarte => ({ repetitions: 0, intervalle: 0, facilite: 2.5, echeance: jour, oublis: 0, derniere: null });

export function noter(e: EtatCarte, note: Note, jour: string): EtatCarte {
  if (note === 1) {
    return { ...e, repetitions: 0, intervalle: 1, facilite: Math.max(FACILITE_MIN, round2(e.facilite - 0.2)), oublis: e.oublis + 1, echeance: decaler(jour, 1), derniere: jour };
  }
  const facilite = Math.max(FACILITE_MIN, round2(e.facilite + (note === 2 ? -0.15 : note === 4 ? 0.15 : 0)));
  let intervalle: number;
  if (e.repetitions === 0) intervalle = note === 4 ? 4 : 1;
  else if (e.repetitions === 1) intervalle = note === 2 ? 3 : note === 4 ? 8 : 6;
  else intervalle = Math.round(e.intervalle * (note === 2 ? 1.2 : e.facilite * (note === 4 ? 1.3 : 1)));
  intervalle = Math.min(PLAFOND, Math.max(1, intervalle));
  return { ...e, repetitions: e.repetitions + 1, intervalle, facilite, echeance: decaler(jour, intervalle), derniere: jour };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function aReviser(etats: Record<string, EtatCarte>, jour: string): string[] {
  return Object.entries(etats)
    .filter(([, e]) => e.echeance <= jour)
    .sort((a, b) => (a[1].echeance < b[1].echeance ? -1 : a[1].echeance > b[1].echeance ? 1 : 0))
    .map(([id]) => id);
}

export function previsions(e: EtatCarte, jour: string): Record<Note, number> {
  return { 1: noter(e, 1, jour).intervalle, 2: noter(e, 2, jour).intervalle, 3: noter(e, 3, jour).intervalle, 4: noter(e, 4, jour).intervalle };
}
