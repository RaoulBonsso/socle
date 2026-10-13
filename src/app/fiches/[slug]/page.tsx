import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Target } from "lucide-react";
import { BadgePiste } from "@/components/piste";
import { cartes, lecon, lecons } from "@/lib/contenu";
import { enHtml } from "@/lib/markdown";
import { Terminer } from "./terminer";

export function generateStaticParams() {
  return lecons().map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = lecon((await params).slug);
  return l ? { title: l.titre, description: l.objectifs.join(" · ") } : {};
}

export default async function Fiche({ params }: { params: Promise<{ slug: string }> }) {
  const l = lecon((await params).slug);
  if (!l) notFound();
  const html = await enHtml(l.corps);
  const ids = cartes().filter((c) => c.lecon === l.slug).map((c) => c.id);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/fiches" className="inline-flex items-center gap-1.5 text-sm text-discret hover:text-texte"><ArrowLeft className="size-4" aria-hidden /> Fiches</Link>
      <p className="mt-4 flex flex-wrap items-center gap-2"><BadgePiste piste={l.piste} /><span className="puce">{l.duree} min</span><span className="puce">{["", "Débutant", "Intermédiaire", "Avancé"][l.niveau]}</span></p>
      <h1 className="titre-display mt-4 text-4xl sm:text-5xl">{l.titre}</h1>
      <div className="carte mt-6 p-5">
        <p className="flex items-center gap-2 text-sm font-medium"><Target className="size-4 text-ambre" aria-hidden /> À la fin, tu sauras</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-discret">{l.objectifs.map((o) => <li key={o}>{o}</li>)}</ul>
      </div>
      <article className="prose-socle mt-4" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="carte mt-10 p-5">
        <h2 className="text-sm font-medium">Sources officielles</h2>
        <ul className="mt-2 space-y-1 text-sm">{l.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-discret hover:text-ambre">{s.titre} <ExternalLink className="size-3" aria-hidden /></a></li>)}</ul>
      </div>
      <Terminer slug={l.slug} cartes={ids} />
    </div>
  );
}
