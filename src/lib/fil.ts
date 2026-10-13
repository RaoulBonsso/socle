import { fusionner, lireFlux, SOURCES, type Article } from "@/domaine/flux";

/** Relit chaque flux au plus une fois par heure ; une source en panne n'empêche pas les autres. */
export async function fil(): Promise<{ articles: Article[]; enPanne: string[] }> {
  const enPanne: string[] = [];
  const lots = await Promise.all(
    SOURCES.map(async (s) => {
      try {
        const r = await fetch(s.url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Socle (+https://github.com/RaoulBonsso/socle)" } });
        if (!r.ok) throw new Error(String(r.status));
        return lireFlux(await r.text(), s);
      } catch {
        enPanne.push(s.nom);
        return [];
      }
    }),
  );
  return { articles: fusionner(lots), enPanne };
}
