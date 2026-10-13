"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Ressource } from "@/domaine/types";

const PISTES = [["", "Toutes"], ["devops", "DevOps"], ["data", "Data"], ["fullstack", "Full stack"], ["transverse", "Transverse"]] as const;
const TYPES = { doc: "Documentation", cours: "Cours", livre: "Livre", spec: "Spécification", outil: "Outil", labo: "Labo" } as const;

export function Bibliotheque({ ressources }: { ressources: Ressource[] }) {
  const [piste, setPiste] = useState("");
  const [q, setQ] = useState("");
  const n = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const liste = ressources.filter((r) => (!piste || r.piste === piste) && (!q || n(`${r.titre} ${r.description}`).includes(n(q))));
  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {PISTES.map(([id, t]) => (
          <button key={id} onClick={() => setPiste(id)} aria-pressed={piste === id} className={`rounded-full border px-4 py-1.5 text-sm ${piste === id ? "border-ambre text-ambre" : "border-ligne-forte text-discret hover:text-texte"}`}>{t}</button>
        ))}
        <label htmlFor="q" className="sr-only">Rechercher</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="min-w-40 flex-1 rounded-full border border-ligne-forte bg-surface px-4 py-1.5 text-sm outline-none focus:border-ambre" />
      </div>
      <ul className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {liste.map((r) => (
          <li key={r.id}>
            <a href={r.url} target="_blank" rel="noreferrer" className="carte flex h-full flex-col p-5 transition hover:border-ligne-forte">
              <p className="flex items-center justify-between text-xs text-discret">
                <span>{TYPES[r.type]} · {r.langue.toUpperCase()} · {"●".repeat(r.niveau)}</span>
                {r.officiel && <ShieldCheck className="size-4 text-menthe" aria-label="Source officielle" />}
              </p>
              <p className="mt-2 font-medium leading-snug">{r.titre} <ExternalLink className="inline size-3 opacity-60" aria-hidden /></p>
              <p className="mt-1 text-sm text-discret">{r.description}</p>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
