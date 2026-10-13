import { describe, expect, it } from "vitest";
import { leconDuJour, ordreDesPistes } from "./programme";
import type { Parcours } from "./types";

const parcours: Parcours = {
  pistes: [
    { id: "devops", titre: "D", description: "", modules: [{ id: "m", titre: "m", lecons: ["d1", "d2"], aVenir: [] }] },
    { id: "data", titre: "Da", description: "", modules: [{ id: "m", titre: "m", lecons: ["a1"], aVenir: [] }] },
    { id: "fullstack", titre: "F", description: "", modules: [{ id: "m", titre: "m", lecons: ["f1"], aVenir: [] }] },
  ],
};
const prerequis = { d2: ["a1"] } as Record<string, string[]>;

describe("leçon du jour", () => {
  it("fait tourner les pistes d'un jour à l'autre (apprentissage entrelacé)", () => {
    expect(ordreDesPistes(3, "2026-10-13")).not.toEqual(ordreDesPistes(3, "2026-10-14"));
    const jours = ["2026-10-13", "2026-10-14", "2026-10-15"].map((j) => leconDuJour(parcours, new Set(), j, prerequis));
    expect(new Set(jours).size).toBe(3);
  });
  it("ne propose jamais une leçon dont les prérequis ne sont pas faits", () => {
    for (const j of ["2026-10-13", "2026-10-14", "2026-10-15"]) expect(leconDuJour(parcours, new Set(["d1"]), j, prerequis)).not.toBe("d2");
    expect(["d2", "f1"]).toContain(leconDuJour(parcours, new Set(["d1", "a1"]), "2026-10-13", prerequis));
  });
  it("renvoie null quand tout est fait", () => {
    expect(leconDuJour(parcours, new Set(["d1", "d2", "a1", "f1"]), "2026-10-13", prerequis)).toBeNull();
  });
});
