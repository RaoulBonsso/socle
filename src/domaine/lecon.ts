import { schemaEntete, type Lecon } from "./types";

/** Une leçon = un en-tête JSON entre `---json` et `---`, puis du markdown. */
export function lireLecon(slug: string, brut: string): Lecon {
  const m = brut.match(/^---json\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error(`Leçon « ${slug} » : en-tête ---json absent`);
  const entete = schemaEntete.parse(JSON.parse(m[1]));
  return { ...entete, slug, corps: m[2] };
}
