import type { Parcours } from "./types";

const jourOrdinal = (jour: string) => Math.floor(Date.parse(`${jour}T12:00:00Z`) / 86_400_000);

/** Ordre des pistes du jour : on commence par une piste différente chaque jour. */
export function ordreDesPistes(n: number, jour: string): number[] {
  const debut = jourOrdinal(jour) % n;
  return Array.from({ length: n }, (_, i) => (debut + i) % n);
}

/**
 * Entrelacement : alterner les sujets d'un jour à l'autre ancre mieux qu'un
 * bloc continu (Rohrer & Taylor, 2007). Dans chaque piste, on suit l'ordre
 * du parcours et on saute ce dont les prérequis ne sont pas acquis.
 */
export function leconDuJour(p: Parcours, faites: Set<string>, jour: string, prerequis: Record<string, string[]>): string | null {
  for (const i of ordreDesPistes(p.pistes.length, jour)) {
    const suivante = p.pistes[i].modules
      .flatMap((m) => m.lecons)
      .find((s) => !faites.has(s) && (prerequis[s] ?? []).every((x) => faites.has(x)));
    if (suivante) return suivante;
  }
  return null;
}
