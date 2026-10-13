"use client";

import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { score } from "@/domaine/progression";
import type { Piste } from "@/domaine/types";
import { BadgePiste } from "@/components/piste";
import { aujourdhui, useProgression } from "@/lib/stockage";

export function ListeDefis({ defis }: { defis: { id: string; titre: string; date: string; piste: Piste; difficulte: number; duree: number; nbCriteres: number }[] }) {
  const [p] = useProgression();
  const jour = aujourdhui();
  const resolus = defis.filter((d) => p.defis[d.id]?.soumisLe);
  const moyenne = resolus.length ? Math.round(resolus.reduce((s, d) => s + score(p.defis[d.id], d.nbCriteres, d.duree), 0) / resolus.length) : null;
  return (
    <>
      <p className="mt-6 text-sm text-discret">{resolus.length} résolu{resolus.length > 1 ? "s" : ""}{moyenne !== null && <> · score moyen <span className="font-mono text-menthe">{moyenne}</span></>}</p>
      <ul className="mt-4 space-y-2">
        {defis.map((d) => {
          const e = p.defis[d.id];
          const futur = d.date > jour;
          const contenu = (
            <>
              <span className="w-24 shrink-0 font-mono text-xs text-discret">{d.date}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{futur ? "Défi à venir" : d.titre}</span>
              <span className="hidden sm:inline"><BadgePiste piste={d.piste} /></span>
              <span className="w-20 shrink-0 text-right text-sm">
                {futur ? <Lock className="ml-auto size-4 text-discret" aria-label="à venir" /> : e?.soumisLe ? <span className="inline-flex items-center gap-1 font-mono text-menthe"><CheckCircle2 className="size-4" aria-hidden />{score(e, d.nbCriteres, d.duree)}</span> : e ? <span className="text-ambre">en cours</span> : <span className="text-discret">à faire</span>}
              </span>
            </>
          );
          return (
            <li key={d.id}>
              {futur ? <div className="carte flex items-center gap-3 p-4 opacity-50">{contenu}</div> : <Link href={`/defis/${d.id}`} className="carte flex items-center gap-3 p-4 transition hover:border-ligne-forte">{contenu}</Link>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
