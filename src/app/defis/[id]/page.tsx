import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { defi, defis, lecon } from "@/lib/contenu";
import { enHtml } from "@/lib/markdown";
import { Atelier, Correction } from "./atelier";
import { BadgePiste } from "@/components/piste";

export function generateStaticParams() {
  return defis().map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const d = defi((await params).id);
  return d ? { title: d.titre, description: d.contexte } : {};
}

const NIVEAU = ["", "Accessible", "Costaud", "Senior"];

export default async function PageDefi({ params }: { params: Promise<{ id: string }> }) {
  const d = defi((await params).id);
  if (!d) notFound();
  const [enonce, correction] = await Promise.all([enHtml(d.enonce), enHtml(d.correction)]);
  return (
    <div>
      <Link href="/defis" className="inline-flex items-center gap-1.5 text-sm text-discret hover:text-texte"><ArrowLeft className="size-4" aria-hidden /> Tous les défis</Link>
      <header className="mt-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <BadgePiste piste={d.piste} />
          <span className="puce">{NIVEAU[d.difficulte]}</span>
          <span className="puce font-mono">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <h1 className="titre-display mt-4 text-4xl sm:text-5xl">{d.titre}</h1>
        <p className="mt-3 text-lg text-discret">{d.contexte}</p>
        <p className="mt-3 flex flex-wrap gap-1.5">{d.competences.map((c) => <span key={c} className="puce !text-texte">{c}</span>)}</p>
      </header>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <article className="prose-socle" dangerouslySetInnerHTML={{ __html: enonce }} />
          <Correction id={d.id} html={correction} />
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Atelier id={d.id} duree={d.duree} indices={d.indices} criteres={d.criteres} livrable={d.livrable} />
          {d.lecons.length > 0 && (
            <div className="carte p-5 text-sm">
              <h2 className="font-medium">Fiches utiles</h2>
              <ul className="mt-2 space-y-1">{d.lecons.map((s) => <li key={s}><Link className="text-ambre hover:underline" href={`/fiches/${s}`}>{lecon(s)?.titre ?? s}</Link></li>)}</ul>
            </div>
          )}
          <div className="carte p-5 text-sm">
            <h2 className="font-medium">Documentation officielle</h2>
            <ul className="mt-2 space-y-1">{d.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-discret hover:text-ambre">{s.titre} <ExternalLink className="size-3" aria-hidden /></a></li>)}</ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
