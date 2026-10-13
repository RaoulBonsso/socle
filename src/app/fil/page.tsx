import { ExternalLink } from "lucide-react";
import { Apparition } from "@/components/apparition";
import { BadgePiste } from "@/components/piste";
import { CATEGORIES, SOURCES, type Categorie } from "@/domaine/flux";
import { fil } from "@/lib/fil";
import Link from "next/link";

export const revalidate = 3600;
export const metadata = { title: "Le fil" };

export default async function Fil({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const cat = CATEGORIES.find((x) => x.id === c)?.id as Categorie | undefined;
  const { articles, enPanne } = await fil();
  const visibles = articles.filter((a) => !cat || a.categorie === cat).slice(0, 80);
  return (
    <div>
      <Apparition>
        <h1 className="titre-display text-4xl sm:text-5xl">Le fil</h1>
        <p className="mt-2 max-w-2xl text-discret">Uniquement des sources officielles : les éditeurs eux-mêmes (Kubernetes, AWS, PostgreSQL, GitHub…) et les autorités françaises (CERT-FR, CNIL). Relu toutes les heures.</p>
      </Apparition>
      <nav aria-label="Catégories" className="mt-6 flex flex-wrap gap-2">
        <Link href="/fil" aria-current={!cat ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm ${!cat ? "border-ambre text-ambre" : "border-ligne-forte text-discret hover:text-texte"}`}>Tout</Link>
        {CATEGORIES.map((x) => (
          <Link key={x.id} href={`/fil?c=${x.id}`} aria-current={cat === x.id ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm ${cat === x.id ? "border-ambre text-ambre" : "border-ligne-forte text-discret hover:text-texte"}`}>
            {x.titre} <span className="font-mono text-xs opacity-60">{articles.filter((a) => a.categorie === x.id).length}</span>
          </Link>
        ))}
      </nav>
      <ul className="mt-6 divide-y divide-ligne">
        {visibles.map((a) => (
          <li key={a.url} className="grid gap-1 py-4 sm:grid-cols-[110px_1fr] sm:gap-6">
            <p className="font-mono text-xs text-discret">{new Date(a.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-xs text-discret">{a.source}{a.piste && <BadgePiste piste={a.piste} />}</p>
              <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block font-medium leading-snug hover:text-ambre">{a.titre} <ExternalLink className="inline size-3 opacity-60" aria-hidden /></a>
              {a.resume && <p className="mt-1 text-sm text-discret">{a.resume}</p>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs text-discret">{SOURCES.length} sources{enPanne.length ? ` · momentanément injoignables : ${enPanne.join(", ")}` : ""}.</p>
    </div>
  );
}
