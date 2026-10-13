/**
 * Garde-fou du contenu réel : ce test tourne sur contenu/ tel qu'il est
 * commité. Une leçon ajoutée par un agent qui casserait un lien, une
 * référence ou un schéma fait échouer la CI — elle ne sera pas publiée.
 */
import { describe, expect, it } from "vitest";
import { cartes, defis, lecons, parcours, ressources } from "./contenu";

describe("intégrité du contenu", () => {
  const ls = lecons();
  const slugs = new Set(ls.map((l) => l.slug));

  it("chaque leçon a un slug propre et des objectifs", () => {
    for (const l of ls) {
      expect(l.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(l.corps).toMatch(/## /);
    }
  });

  it("le parcours ne référence que des leçons existantes, chacune une seule fois", () => {
    const refs = parcours().pistes.flatMap((p) => p.modules.flatMap((m) => m.lecons));
    for (const r of refs) expect(slugs, `leçon absente : ${r}`).toContain(r);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("chaque leçon est rangée dans le parcours, dans sa piste et son module", () => {
    const p = parcours();
    for (const l of ls) {
      const piste = p.pistes.find((x) => x.id === l.piste);
      const mod = piste?.modules.find((m) => m.id === l.module);
      expect(mod?.lecons, `${l.slug} absente de ${l.piste}/${l.module}`).toContain(l.slug);
    }
  });

  it("prérequis et liens pointent vers des leçons existantes", () => {
    for (const l of ls) for (const r of [...l.prerequis, ...l.liens]) expect(slugs, `${l.slug} → ${r}`).toContain(r);
  });

  it("chaque carte appartient à une leçon, avec un identifiant unique", () => {
    const cs = cartes();
    for (const c of cs) expect(slugs, `cartes orphelines : ${c.lecon}`).toContain(c.lecon);
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
  });

  it("les ressources ont des identifiants et des URL uniques", () => {
    const rs = ressources();
    expect(new Set(rs.map((r) => r.id)).size).toBe(rs.length);
    expect(new Set(rs.map((r) => r.url)).size).toBe(rs.length);
  });

  it("un seul défi par jour, nommé par sa date, ne citant que des fiches existantes", () => {
    const ds = defis();
    expect(new Set(ds.map((d) => d.date)).size).toBe(ds.length);
    for (const d of ds) {
      expect(d.id.startsWith(d.date), `${d.id} doit commencer par ${d.date}`).toBe(true);
      for (const l of d.lecons) expect(slugs, `${d.id} → ${l}`).toContain(l);
    }
  });
});
