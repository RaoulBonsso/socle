import { describe, expect, it } from "vitest";
import { avantMinuit, defiDuJour, lireDefi } from "./defi";

const brut = (date: string) => `---json
{"titre":"Le conteneur qui meurt","date":"${date}","piste":"devops","difficulte":2,"duree":60,"contexte":"PME de transport, 40 salariés","competences":["Docker"],"livrable":"Diagnostic et correctif","indices":["regarde dmesg"],"criteres":["cause identifiée","limite fixée"],"sources":[{"titre":"Docker","url":"https://docs.docker.com/"}]}
---
## La situation
Le service tombe.
===CORRECTION===
## Diagnostic
OOM.`;

describe("défis", () => {
  it("sépare énoncé et correction", () => {
    const d = lireDefi("x", brut("2026-10-14"));
    expect(d.enonce).toContain("Le service tombe");
    expect(d.enonce).not.toContain("OOM");
    expect(d.correction).toContain("OOM");
  });
  it("refuse un défi sans correction", () => {
    expect(() => lireDefi("x", brut("2026-10-14").replace("===CORRECTION===", ""))).toThrow(/correction/);
  });
  it("choisit le défi du jour, sinon le rattrapage non soumis", () => {
    const ds = ["2026-10-14", "2026-10-15", "2026-10-16"].map((j) => lireDefi(j, brut(j)));
    expect(defiDuJour(ds, "2026-10-15", new Set())?.id).toBe("2026-10-15");
    expect(defiDuJour(ds, "2026-10-17", new Set(["2026-10-16"]))?.id).toBe("2026-10-15");
    expect(defiDuJour(ds, "2026-10-13", new Set())).toBeNull();
  });
  it("calcule le temps avant minuit à Paris", () => {
    expect(avantMinuit(new Date("2026-10-14T21:00:00Z"))).toBe(3600_000); // 23 h à Paris (UTC+2)
  });
});
