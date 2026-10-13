import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import { lireLecon } from "@/domaine/lecon";
import { lireDefi, type Defi } from "@/domaine/defi";
import { schemaCarte, schemaParcours, schemaRessource, type Carte, type Lecon, type Parcours, type Ressource } from "@/domaine/types";

/** Le contenu vit dans le dépôt (contenu/) : versionné, relu, testé, enrichi un peu chaque jour. */
const RACINE = join(process.cwd(), "contenu");

export const lecons = cache((): Lecon[] => {
  const dossier = join(RACINE, "lecons");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".md"))
    .map((f) => lireLecon(f.replace(/\.md$/, ""), readFileSync(join(dossier, f), "utf8")));
});

export const lecon = (slug: string) => lecons().find((l) => l.slug === slug) ?? null;

export const cartes = cache((): Carte[] => {
  const dossier = join(RACINE, "cartes");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const slug = f.replace(/\.json$/, "");
      return schemaCarte.array().parse(JSON.parse(readFileSync(join(dossier, f), "utf8"))).map((c) => ({ ...c, lecon: slug }));
    });
});

export const parcours = cache((): Parcours => {
  const f = join(RACINE, "parcours.json");
  return existsSync(f) ? schemaParcours.parse(JSON.parse(readFileSync(f, "utf8"))) : { pistes: [] };
});

export const ressources = cache((): Ressource[] => {
  const f = join(RACINE, "ressources.json");
  return existsSync(f) ? schemaRessource.array().parse(JSON.parse(readFileSync(f, "utf8"))) : [];
});

export const prerequis = () => Object.fromEntries(lecons().map((l) => [l.slug, l.prerequis]));

export const defis = cache((): Defi[] => {
  const dossier = join(RACINE, "defis");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".md"))
    .map((f) => lireDefi(f.replace(/\.md$/, ""), readFileSync(join(dossier, f), "utf8")))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
});

export const defi = (id: string) => defis().find((d) => d.id === id) ?? null;
