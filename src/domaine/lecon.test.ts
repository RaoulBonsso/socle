import { describe, expect, it } from "vitest";
import { lireLecon } from "./lecon";

const md = `---json
{"titre":"Les couches d'une image","piste":"devops","module":"conteneurs","niveau":2,"duree":20,"objectifs":["comprendre le cache"],"sources":[{"titre":"Docker docs","url":"https://docs.docker.com/build/cache/"}]}
---
## Pourquoi
Texte.`;

describe("lireLecon", () => {
  it("sépare l'en-tête JSON validé du corps markdown", () => {
    const l = lireLecon("images", md);
    expect(l.titre).toBe("Les couches d'une image");
    expect(l.prerequis).toEqual([]);
    expect(l.corps.trim().startsWith("## Pourquoi")).toBe(true);
  });
  it("rejette une leçon sans source ou sans en-tête", () => {
    expect(() => lireLecon("x", md.replace(/"sources":\[.*?\]\}/, "\"sources\":[]}"))).toThrow();
    expect(() => lireLecon("x", "## pas d'en-tête")).toThrow(/en-tête/);
  });
});
