"use client";

import Link from "next/link";
import { ArrowRight, BookOpenText, Flame, Layers } from "lucide-react";
import { defiDuJour } from "@/domaine/defi";
import { leconDuJour } from "@/domaine/programme";
import { joursActifs, serie } from "@/domaine/progression";
import { aReviser } from "@/domaine/srs";
import type { Parcours, Piste } from "@/domaine/types";
import { HorlogeDuJour } from "@/components/chrono";
import { BadgePiste } from "@/components/piste";
import { aujourdhui, useProgression } from "@/lib/stockage";

interface DefiResume { id: string; titre: string; date: string; piste: Piste; contexte: string; duree: number; difficulte: number }
interface LeconResume { slug: string; titre: string; piste: Piste; duree: number }

export function Tableau({ defis, lecons, parcours, prerequis }: { defis: DefiResume[]; lecons: LeconResume[]; parcours: Parcours; prerequis: Record<string, string[]> }) {
  const [p] = useProgression();
  const jour = aujourdhui();
  const soumis = new Set(Object.entries(p.defis).filter(([, e]) => e.soumisLe).map(([id]) => id));
  // defiDuJour n'utilise que date et id : le résumé suffit.
  const d = defiDuJour(defis as never, jour, soumis) as DefiResume | null;
  const etat = d ? p.defis[d.id] : undefined;
  const slug = leconDuJour(parcours, new Set(Object.keys(p.lecons)), jour, prerequis);
  const l = lecons.find((x) => x.slug === slug);
  const dues = aReviser(p.cartes, jour).length;
  const s = serie(p, jour);
  const actifs = joursActifs(p);
  const semaines = Array.from({ length: 12 * 7 }, (_, i) => {
    const x = new Date(`${jour}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() - (12 * 7 - 1 - i));
    return x.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-5">
      {d ? (
        <section className="carte relative overflow-hidden p-6 sm:p-8" aria-labelledby="defi-jour">
          <div className="quadrillage pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_80%_at_80%_50%,black,transparent)]" aria-hidden />
          <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-ambre">
                <Flame className="size-4" aria-hidden /> {d.date === jour ? "Défi du jour" : "Défi à rattraper"} <BadgePiste piste={d.piste} />
              </p>
              <h2 id="defi-jour" className="titre-display mt-3 text-3xl sm:text-5xl">{d.titre}</h2>
              <p className="mt-3 max-w-2xl text-discret">{d.contexte}</p>
              <Link href={`/defis/${d.id}`} className="group mt-6 inline-flex items-center gap-2 rounded-full bg-ambre px-6 py-3 font-medium text-[#1a1205] transition hover:brightness-110">
                {etat?.soumisLe ? "Revoir la correction" : etat ? "Reprendre" : "Relever le défi"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <span className="ml-3 font-mono text-sm text-discret">~{d.duree} min</span>
            </div>
            <HorlogeDuJour taille={150} />
          </div>
        </section>
      ) : (
        <p className="carte p-6 text-discret">Le premier défi arrive bientôt.</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Link href={l ? `/fiches/${l.slug}` : "/fiches"} className="carte group p-5 transition hover:border-ligne-forte">
          <p className="flex items-center gap-2 text-sm text-discret"><BookOpenText className="size-4" aria-hidden /> Fiche du jour</p>
          {l ? (<><p className="mt-2 font-medium leading-snug group-hover:text-ambre">{l.titre}</p><p className="mt-2 flex items-center gap-2 text-xs text-discret"><BadgePiste piste={l.piste} /> {l.duree} min</p></>) : <p className="mt-2 text-sm">Toutes les fiches sont lues. Les prochaines arrivent.</p>}
        </Link>
        <Link href="/reviser" className="carte group p-5 transition hover:border-ligne-forte">
          <p className="flex items-center gap-2 text-sm text-discret"><Layers className="size-4" aria-hidden /> À réviser</p>
          <p className={`mt-2 font-mono text-4xl tabular-nums ${dues ? "text-ambre" : ""}`}>{dues}</p>
          <p className="text-xs text-discret">{dues ? "cartes — 5 minutes suffisent" : "rien d'urgent, reviens demain"}</p>
        </Link>
        <div className="carte p-5">
          <p className="flex items-center gap-2 text-sm text-discret"><Flame className="size-4" aria-hidden /> Série</p>
          <p className="mt-2 font-mono text-4xl tabular-nums">{s}<span className="text-base text-discret"> j</span></p>
          <div className="mt-3 grid grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label="Activité des 12 dernières semaines">
            {semaines.map((j) => {
              const n = actifs[j] ?? 0;
              return <span key={j} title={`${j} : ${n}`} className="size-2.5 rounded-[3px]" style={{ background: n ? `color-mix(in srgb, var(--menthe) ${Math.min(100, 25 + n * 15)}%, transparent)` : "var(--ligne)" }} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
