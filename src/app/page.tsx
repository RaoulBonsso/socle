import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Apparition } from "@/components/apparition";
import { CATEGORIES } from "@/domaine/flux";
import { defis, lecons, parcours, prerequis } from "@/lib/contenu";
import { fil } from "@/lib/fil";
import { Tableau } from "./tableau";

export const revalidate = 3600;

export default async function Accueil() {
  const { articles } = await fil();
  const recents = CATEGORIES.map((c) => articles.find((a) => a.categorie === c.id)).filter((a) => a !== undefined);
  return (
    <div className="space-y-10">
      <Apparition>
        <h1 className="titre-display max-w-3xl text-5xl sm:text-6xl">On progresse <em className="text-ambre">en résolvant.</em></h1>
        <p className="mt-4 max-w-2xl text-discret">Chaque jour, un vrai problème de DevOps, de data ou de full stack à résoudre avant minuit. Des fiches terrain pour s&apos;appuyer, la révision espacée pour retenir, l&apos;actualité officielle pour rester à jour.</p>
      </Apparition>
      <Tableau
        defis={defis().map(({ id, titre, date, piste, contexte, duree, difficulte }) => ({ id, titre, date, piste, contexte, duree, difficulte }))}
        lecons={lecons().map(({ slug, titre, piste, duree }) => ({ slug, titre, piste, duree }))}
        parcours={parcours()}
        prerequis={prerequis()}
      />
      <section aria-labelledby="fil-jour">
        <div className="flex items-end justify-between">
          <h2 id="fil-jour" className="titre-display text-3xl">Le fil, en bref</h2>
          <Link href="/fil" className="text-sm text-ambre hover:underline">Tout le fil</Link>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {recents.map((a) => (
            <li key={a.url} className="carte p-4">
              <p className="text-xs text-discret">{CATEGORIES.find((c) => c.id === a.categorie)?.titre} · {a.source}</p>
              <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block font-medium leading-snug hover:text-ambre">{a.titre} <ExternalLink className="inline size-3 opacity-60" aria-hidden /></a>
              <p className="mt-1 font-mono text-xs text-discret">{new Date(a.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
