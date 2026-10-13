import { XMLParser } from "fast-xml-parser";
import type { Piste } from "./types";

export const CATEGORIES = [
  { id: "cloud", titre: "Cloud & DevOps" },
  { id: "data", titre: "Data" },
  { id: "dev", titre: "Développement" },
  { id: "ia", titre: "IA" },
  { id: "securite", titre: "Sécurité & conformité" },
] as const;
export type Categorie = (typeof CATEGORIES)[number]["id"];

export interface Source {
  id: string;
  nom: string;
  url: string;
  categorie: Categorie;
  piste: Piste | null;
  site: string;
}

/**
 * Uniquement des flux publiés par l'éditeur ou l'autorité elle-même. Chaque
 * flux a été vérifié (HTTP 200 et articles récents) le 2026-10-13 ; voir
 * docs/adr/0002-sources-officielles.md pour les sources écartées.
 */
export const SOURCES: Source[] = [
  { id: "kubernetes", nom: "Kubernetes", url: "https://kubernetes.io/feed.xml", categorie: "cloud", piste: "devops", site: "https://kubernetes.io/blog/" },
  { id: "docker", nom: "Docker", url: "https://www.docker.com/blog/feed/", categorie: "cloud", piste: "devops", site: "https://www.docker.com/blog/" },
  { id: "cncf", nom: "CNCF", url: "https://www.cncf.io/feed/", categorie: "cloud", piste: "devops", site: "https://www.cncf.io/blog/" },
  { id: "aws", nom: "AWS — Nouveautés", url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/", categorie: "cloud", piste: "devops", site: "https://aws.amazon.com/new/" },
  { id: "gcp", nom: "Google Cloud — notes de version", url: "https://cloud.google.com/feeds/gcp-release-notes.xml", categorie: "cloud", piste: "devops", site: "https://cloud.google.com/release-notes" },
  { id: "azure", nom: "Microsoft Azure", url: "https://azure.microsoft.com/fr-fr/blog/feed/", categorie: "cloud", piste: "devops", site: "https://azure.microsoft.com/fr-fr/blog/" },
  { id: "hashicorp", nom: "HashiCorp", url: "https://www.hashicorp.com/blog/feed.xml", categorie: "cloud", piste: "devops", site: "https://www.hashicorp.com/blog" },
  { id: "grafana", nom: "Grafana Labs", url: "https://grafana.com/blog/index.xml", categorie: "cloud", piste: "devops", site: "https://grafana.com/blog/" },
  { id: "cloudflare", nom: "Cloudflare", url: "https://blog.cloudflare.com/rss/", categorie: "cloud", piste: "devops", site: "https://blog.cloudflare.com/" },
  { id: "postgresql", nom: "PostgreSQL", url: "https://www.postgresql.org/news.rss", categorie: "data", piste: "data", site: "https://www.postgresql.org/about/newsarchive/" },
  { id: "airflow", nom: "Apache Airflow", url: "https://airflow.apache.org/blog/index.xml", categorie: "data", piste: "data", site: "https://airflow.apache.org/blog/" },
  { id: "dbt", nom: "dbt Labs", url: "https://www.getdbt.com/blog/rss.xml", categorie: "data", piste: "data", site: "https://www.getdbt.com/blog" },
  { id: "duckdb", nom: "DuckDB", url: "https://duckdb.org/feed.xml", categorie: "data", piste: "data", site: "https://duckdb.org/news/" },
  { id: "github", nom: "GitHub Changelog", url: "https://github.blog/changelog/feed/", categorie: "dev", piste: "fullstack", site: "https://github.blog/changelog/" },
  { id: "nodejs", nom: "Node.js", url: "https://nodejs.org/en/feed/blog.xml", categorie: "dev", piste: "fullstack", site: "https://nodejs.org/en/blog" },
  { id: "nextjs", nom: "Next.js", url: "https://nextjs.org/feed.xml", categorie: "dev", piste: "fullstack", site: "https://nextjs.org/blog" },
  { id: "react", nom: "React", url: "https://react.dev/rss.xml", categorie: "dev", piste: "fullstack", site: "https://react.dev/blog" },
  { id: "typescript", nom: "TypeScript", url: "https://devblogs.microsoft.com/typescript/feed/", categorie: "dev", piste: "fullstack", site: "https://devblogs.microsoft.com/typescript/" },
  { id: "rust", nom: "Rust", url: "https://blog.rust-lang.org/feed.xml", categorie: "dev", piste: null, site: "https://blog.rust-lang.org/" },
  { id: "go", nom: "Go", url: "https://go.dev/blog/feed.atom", categorie: "dev", piste: null, site: "https://go.dev/blog/" },
  { id: "huggingface", nom: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", categorie: "ia", piste: "data", site: "https://huggingface.co/blog" },
  { id: "certfr-alertes", nom: "CERT-FR (ANSSI) — alertes", url: "https://www.cert.ssi.gouv.fr/alerte/feed/", categorie: "securite", piste: "devops", site: "https://www.cert.ssi.gouv.fr/alerte/" },
  { id: "certfr-avis", nom: "CERT-FR (ANSSI) — avis", url: "https://www.cert.ssi.gouv.fr/avis/feed/", categorie: "securite", piste: "devops", site: "https://www.cert.ssi.gouv.fr/avis/" },
  { id: "cnil", nom: "CNIL", url: "https://www.cnil.fr/fr/rss.xml", categorie: "securite", piste: null, site: "https://www.cnil.fr/fr/actualites" },
];

export interface Article {
  titre: string;
  url: string;
  date: string; // ISO
  resume: string;
  source: string;
  categorie: Categorie;
  piste: Piste | null;
}

const parseur = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true, htmlEntities: true });

/* eslint-disable @typescript-eslint/no-explicit-any -- forme libre des flux RSS/Atom, normalisée ici */
const texte = (v: any): string => (v === undefined || v === null ? "" : typeof v === "object" ? texte(v["#text"] ?? "") : String(v));
const liste = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function nettoyer(html: string, max = 220): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}…` : t;
}

function lienAtom(l: any): string {
  const liens = liste(l);
  const alt = liens.find((x: any) => typeof x === "object" && (x["@_rel"] ?? "alternate") === "alternate") ?? liens[0];
  return typeof alt === "string" ? alt : (alt?.["@_href"] ?? "");
}

export function lireFlux(xml: string, s: Source, max = 8): Article[] {
  const d = parseur.parse(xml);
  const bruts = d?.rss?.channel?.item ?? d?.feed?.entry ?? d?.["rdf:RDF"]?.item;
  return liste(bruts)
    .map((x: any): Article => {
      const date = new Date(texte(x.pubDate ?? x.published ?? x.updated ?? x["dc:date"]));
      return {
        titre: nettoyer(texte(x.title), 160),
        url: typeof x.link === "string" ? x.link.trim() : lienAtom(x.link) || texte(x.guid),
        date: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
        resume: nettoyer(texte(x.description ?? x.summary ?? x.content ?? x["content:encoded"])),
        source: s.nom,
        categorie: s.categorie,
        piste: s.piste,
      };
    })
    .filter((a) => a.titre && /^https?:\/\//.test(a.url) && a.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, max);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Fusionne, dédoublonne par URL et trie du plus récent au plus ancien. */
export function fusionner(lots: Article[][]): Article[] {
  const vus = new Set<string>();
  return lots
    .flat()
    .filter((a) => (vus.has(a.url) ? false : (vus.add(a.url), true)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
