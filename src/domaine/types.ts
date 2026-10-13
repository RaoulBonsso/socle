import { z } from "zod";

export const PISTES = ["devops", "data", "fullstack"] as const;
export type Piste = (typeof PISTES)[number];

const url = z.string().url();

export const schemaEntete = z.object({
  titre: z.string().min(3),
  piste: z.enum(PISTES),
  module: z.string().min(1),
  niveau: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  duree: z.number().int().min(5).max(90),
  prerequis: z.array(z.string()).default([]),
  objectifs: z.array(z.string()).min(1),
  sources: z.array(z.object({ titre: z.string(), url })).min(1),
  liens: z.array(z.string()).default([]),
});
export type Entete = z.infer<typeof schemaEntete>;
export interface Lecon extends Entete {
  slug: string;
  corps: string;
}

export const schemaCarte = z.object({
  id: z.string().min(1),
  question: z.string().min(5),
  reponse: z.string().min(1),
  type: z.enum(["rappel", "pourquoi", "code", "piege"]),
});
export type Carte = z.infer<typeof schemaCarte> & { lecon: string };

export const schemaParcours = z.object({
  pistes: z.array(
    z.object({
      id: z.enum(PISTES),
      titre: z.string(),
      description: z.string().default(""),
      modules: z.array(z.object({ id: z.string(), titre: z.string(), lecons: z.array(z.string()), aVenir: z.array(z.string()).default([]) })),
    }),
  ),
});
export type Parcours = z.infer<typeof schemaParcours>;

export const schemaRessource = z.object({
  id: z.string(),
  titre: z.string(),
  url,
  type: z.enum(["doc", "cours", "livre", "spec", "outil", "labo"]),
  piste: z.enum([...PISTES, "transverse"]),
  niveau: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  officiel: z.boolean(),
  langue: z.enum(["fr", "en"]),
  description: z.string(),
  ajouteLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type Ressource = z.infer<typeof schemaRessource>;
