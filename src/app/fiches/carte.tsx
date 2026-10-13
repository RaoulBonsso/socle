"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useProgression } from "@/lib/stockage";

export function Carte({ slug, titre, duree, niveau }: { slug: string; titre: string; duree: number; niveau: number }) {
  const [p] = useProgression();
  const lue = !!p.lecons[slug];
  return (
    <li>
      <Link href={`/fiches/${slug}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition hover:border-ligne-forte ${lue ? "border-menthe/30" : "border-ligne bg-surface"}`}>
        {lue && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-menthe" aria-label="lue" />}
        <span className="min-w-0 flex-1">{titre}</span>
        <span className="shrink-0 font-mono text-xs text-discret">{"●".repeat(niveau)} {duree}′</span>
      </Link>
    </li>
  );
}
