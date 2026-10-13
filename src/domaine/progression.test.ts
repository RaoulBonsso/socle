import { describe, expect, it } from "vitest";
import { joursActifs, marquerLue, reviser, serie, VIDE } from "./progression";

describe("progression", () => {
  it("terminer une leçon ajoute ses cartes à la révision, sans écraser celles déjà suivies", () => {
    let p = marquerLue(VIDE, "images", ["images-1", "images-2"], "2026-10-13");
    p = reviser(p, "images-1", 3, "2026-10-13");
    const avant = p.cartes["images-1"];
    p = marquerLue(p, "images", ["images-1", "images-2", "images-3"], "2026-10-14");
    expect(p.cartes["images-1"]).toEqual(avant);
    expect(Object.keys(p.cartes)).toHaveLength(3);
    expect(p.lecons.images).toBe("2026-10-13");
  });
  it("compte l'activité par jour et la série", () => {
    let p = marquerLue(VIDE, "a", [], "2026-10-11");
    p = reviser(marquerLue(p, "b", ["b-1"], "2026-10-12"), "b-1", 3, "2026-10-13");
    expect(joursActifs(p)["2026-10-12"]).toBe(1);
    expect(serie(p, "2026-10-13")).toBe(3);
    expect(serie(p, "2026-10-15")).toBe(0);
  });
  it("une série en cours n'est pas cassée tant que la journée n'est pas finie", () => {
    const p = marquerLue(VIDE, "a", [], "2026-10-12");
    expect(serie(p, "2026-10-13")).toBe(1);
  });
});

import { ajouterHypothese, commencerDefi, evaluer, score, soumettre, voirIndice } from "./progression";

describe("défi du jour", () => {
  const t0 = "2026-10-14T08:00:00.000Z";
  it("enregistre les hypothèses horodatées jusqu'à la soumission, puis fige la copie", () => {
    let p = commencerDefi(VIDE, "d1", t0);
    p = ajouterHypothese(p, "d1", "le conteneur manque de mémoire", "2026-10-14T08:05:00.000Z");
    p = ajouterHypothese(p, "d1", "  ", "2026-10-14T08:06:00.000Z");
    p = soumettre(p, "d1", "limite mémoire + fuite corrigée", "2026-10-14T08:40:00.000Z");
    p = ajouterHypothese(p, "d1", "trop tard", "2026-10-14T09:00:00.000Z");
    p = soumettre(p, "d1", "autre réponse", "2026-10-14T09:00:00.000Z");
    expect(p.defis.d1.hypotheses.map((h) => h.texte)).toEqual(["le conteneur manque de mémoire"]);
    expect(p.defis.d1.solution).toBe("limite mémoire + fuite corrigée");
    expect(p.journal["2026-10-14"].defis).toBe(1);
  });
  it("note : critères atteints, pénalité par indice, bonus dans le temps", () => {
    let p = commencerDefi(VIDE, "d1", t0);
    p = voirIndice(p, "d1", 3, t0);
    p = soumettre(p, "d1", "x", "2026-10-14T08:30:00.000Z");
    p = evaluer(p, "d1", [0, 1, 1, 2]);
    expect(p.defis.d1.criteres).toEqual([0, 1, 2]);
    expect(score(p.defis.d1, 4, 60)).toBe(75); // 75 − 10 + 10
    expect(score({ ...p.defis.d1, soumisLe: "2026-10-14T12:00:00.000Z" }, 4, 60)).toBe(65);
  });
  it("on ne s'auto-évalue pas avant d'avoir soumis", () => {
    const p = evaluer(commencerDefi(VIDE, "d1", t0), "d1", [0]);
    expect(p.defis.d1.criteres).toEqual([]);
  });
});
