"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { marquerLue } from "@/domaine/progression";
import { aujourdhui, useProgression } from "@/lib/stockage";

export function Terminer({ slug, cartes }: { slug: string; cartes: string[] }) {
  const [p, maj] = useProgression();
  const lue = p.lecons[slug];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-ligne-forte p-5">
      {lue ? (
        <p className="flex items-center gap-2 text-menthe"><CheckCircle2 className="size-5" aria-hidden /> Fiche terminée le {new Date(`${lue}T12:00:00Z`).toLocaleDateString("fr-FR")}. Ses {cartes.length} cartes sont dans ta <Link href="/reviser" className="underline">révision</Link>.</p>
      ) : (
        <>
          <button onClick={() => maj((x) => marquerLue(x, slug, cartes, aujourdhui()))} className="rounded-full bg-menthe px-5 py-2.5 font-medium text-[#04130d] hover:brightness-110">J&apos;ai fait la pratique</button>
          <p className="text-sm text-discret">Ajoute {cartes.length} cartes à ta révision espacée : tu les reverras juste avant de les oublier.</p>
        </>
      )}
    </div>
  );
}
