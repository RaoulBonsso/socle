import { describe, expect, it } from "vitest";
import { aReviser, etatInitial, noter, previsions } from "./srs";

const J = "2026-10-13";

describe("révision espacée", () => {
  it("une carte neuve est due le jour où on la découvre", () => {
    expect(etatInitial(J).echeance).toBe(J);
  });

  it("« bien » espace les révisions : 1 j, 6 j, puis × facilité", () => {
    let e = noter(etatInitial(J), 3, J);
    expect(e.intervalle).toBe(1);
    expect(e.echeance).toBe("2026-10-14");
    e = noter(e, 3, "2026-10-14");
    expect(e.intervalle).toBe(6);
    e = noter(e, 3, "2026-10-20");
    expect(e.intervalle).toBe(15); // 6 × 2,5
    expect(e.echeance).toBe("2026-11-04");
  });

  it("« encore » remet la carte à demain, baisse la facilité et compte l'oubli", () => {
    const e = noter(noter(noter(etatInitial(J), 3, J), 3, "2026-10-14"), 1, "2026-10-20");
    expect(e.intervalle).toBe(1);
    expect(e.repetitions).toBe(0);
    expect(e.oublis).toBe(1);
    expect(e.facilite).toBeCloseTo(2.3);
  });

  it("« facile » saute plus loin, « difficile » moins loin", () => {
    const base = noter(noter(etatInitial(J), 3, J), 3, "2026-10-14");
    expect(noter(base, 4, "2026-10-20").intervalle).toBeGreaterThan(noter(base, 3, "2026-10-20").intervalle);
    expect(noter(base, 2, "2026-10-20").intervalle).toBeLessThan(noter(base, 3, "2026-10-20").intervalle);
  });

  it("la facilité ne descend jamais sous 1,3 et l'intervalle plafonne à un an", () => {
    let e = etatInitial(J);
    for (let i = 0; i < 20; i++) e = noter(e, 1, J);
    expect(e.facilite).toBe(1.3);
    let f = etatInitial(J);
    for (let i = 0; i < 30; i++) f = noter(f, 4, f.echeance);
    expect(f.intervalle).toBeLessThanOrEqual(365);
  });

  it("liste les cartes dues, les plus en retard d'abord", () => {
    const etats = { a: { ...etatInitial(J), echeance: "2026-10-10" }, b: { ...etatInitial(J), echeance: "2026-10-15" }, c: { ...etatInitial(J), echeance: "2026-10-01" } };
    expect(aReviser(etats, J)).toEqual(["c", "a"]);
  });

  it("annonce l'intervalle de chaque bouton avant de répondre", () => {
    const p = previsions(noter(etatInitial(J), 3, J), "2026-10-14");
    expect(p[1]).toBe(1);
    expect(p[3]).toBe(6);
    expect(p[4]).toBeGreaterThan(6);
  });
});
