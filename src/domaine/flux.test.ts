import { describe, expect, it } from "vitest";
import { fusionner, lireFlux, nettoyer, SOURCES } from "./flux";

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>K8s</title>
<item><title>Kubernetes v1.36 &amp; plus</title><link>https://kubernetes.io/blog/a/</link><pubDate>Mon, 05 Oct 2026 10:00:00 -0800</pubDate><description>&lt;p&gt;Nouvelle &lt;b&gt;version&lt;/b&gt;&lt;/p&gt;</description></item>
<item><title>Ancien</title><link>https://kubernetes.io/blog/b/</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
<item><title>Sans lien</title><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Go</title>
<entry><title type="html">Go 1.27 is released</title><link rel="alternate" href="https://go.dev/blog/go1.27"/><link rel="self" href="https://go.dev/x"/><published>2026-10-02T00:00:00+00:00</published><summary>Résumé</summary></entry>
</feed>`;

const k8s = SOURCES.find((s) => s.id === "kubernetes")!;
const go = SOURCES.find((s) => s.id === "go")!;

describe("lecture des flux", () => {
  it("lit un flux RSS, nettoie le HTML et écarte les entrées sans lien", () => {
    const a = lireFlux(rss, k8s);
    expect(a.map((x) => x.titre)).toEqual(["Kubernetes v1.36 & plus", "Ancien"]);
    expect(a[0].resume).toBe("Nouvelle version");
    expect(a[0].categorie).toBe("cloud");
    expect(a[0].date).toBe("2026-10-05T18:00:00.000Z");
  });
  it("lit un flux Atom en prenant le lien « alternate »", () => {
    const [a] = lireFlux(atom, go);
    expect(a.url).toBe("https://go.dev/blog/go1.27");
    expect(a.titre).toBe("Go 1.27 is released");
  });
  it("fusionne sans doublon, du plus récent au plus ancien", () => {
    const a = lireFlux(rss, k8s);
    const f = fusionner([a, lireFlux(atom, go), a]);
    expect(f).toHaveLength(3);
    expect(f[0].titre).toContain("v1.36");
  });
  it("tronque proprement sur un mot", () => {
    expect(nettoyer("un deux trois quatre", 9)).toBe("un deux…");
  });
  it("ne déclare que des sources en HTTPS, sans doublon d'identifiant", () => {
    expect(SOURCES.every((s) => s.url.startsWith("https://"))).toBe(true);
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
  });
});
