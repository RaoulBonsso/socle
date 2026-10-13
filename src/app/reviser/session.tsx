"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { reviser } from "@/domaine/progression";
import { aReviser, LIBELLES_NOTE, previsions, type Note } from "@/domaine/srs";
import type { Carte } from "@/domaine/types";
import { aujourdhui, useProgression } from "@/lib/stockage";

const TON: Record<Note, string> = { 1: "border-corail/50 hover:bg-corail/10", 2: "border-ambre/40 hover:bg-ambre-doux", 3: "border-menthe/40 hover:bg-menthe-doux", 4: "border-data/40 hover:bg-data/10" };
const TYPE = { rappel: "Rappel", pourquoi: "Pourquoi ?", code: "Code", piege: "Piège" } as const;

/** Rappel actif : on cherche la réponse avant de la voir, puis on note sa propre mémoire. */
export function Session({ cartes }: { cartes: Carte[] }) {
  const [p, maj] = useProgression();
  const [retournee, setRetournee] = useState(false);
  const [faites, setFaites] = useState(0);
  const reduit = useReducedMotion();
  const jour = aujourdhui();
  const dues = aReviser(p.cartes, jour);
  const index = new Map(cartes.map((c) => [c.id, c]));
  const c = dues.map((id) => index.get(id)).find(Boolean);

  const noter = (n: Note) => {
    if (!c) return;
    maj((x) => reviser(x, c.id, n, jour));
    setRetournee(false);
    setFaites((f) => f + 1);
  };

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === " " && !retournee) { e.preventDefault(); setRetournee(true); }
      else if (retournee && ["1", "2", "3", "4"].includes(e.key)) noter(Number(e.key) as Note);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  if (!c)
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="titre-display text-4xl">{faites ? "Session terminée." : "Rien à réviser."}</h1>
        <p className="mt-3 text-discret">{faites ? `${faites} carte${faites > 1 ? "s" : ""} revue${faites > 1 ? "s" : ""}. Ta mémoire te remercie.` : Object.keys(p.cartes).length ? "Tes prochaines cartes reviendront à la date idéale." : "Termine une fiche pour remplir ta pile de révision."}</p>
        <Link href="/" className="mt-6 inline-block text-ambre hover:underline">Retour au défi du jour</Link>
      </div>
    );

  const prev = previsions(p.cartes[c.id], jour);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="flex justify-between text-sm text-discret"><span>{dues.length} à revoir</span><span className="font-mono">{faites} faite{faites > 1 ? "s" : ""}</span></p>
      <div className="mt-4 [perspective:1400px]">
        <AnimatePresence mode="wait">
          <motion.div key={c.id + String(retournee)} initial={reduit ? false : { rotateY: retournee ? -90 : 0, opacity: retournee ? 1 : 0, y: retournee ? 0 : 12 }} animate={{ rotateY: 0, opacity: 1, y: 0 }} exit={reduit ? undefined : { rotateY: 90, opacity: 0.6 }} transition={{ duration: 0.22 }} className="carte min-h-72 p-8">
            <p className="puce">{TYPE[c.type]}</p>
            <p className="mt-6 text-xl leading-relaxed">{c.question}</p>
            {retournee && <div className="mt-6 whitespace-pre-wrap border-t border-ligne pt-6 font-mono text-[14px] leading-relaxed text-menthe">{c.reponse}</div>}
            <Link href={`/fiches/${c.lecon}`} className="mt-6 inline-block text-xs text-discret hover:text-ambre">Fiche d&apos;origine</Link>
          </motion.div>
        </AnimatePresence>
      </div>
      {!retournee ? (
        <button onClick={() => setRetournee(true)} className="mt-5 w-full rounded-2xl bg-texte py-4 font-medium text-fond hover:bg-ambre">Voir la réponse <kbd className="ml-2 rounded bg-fond/15 px-1.5 font-mono text-xs">espace</kbd></button>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([1, 2, 3, 4] as Note[]).map((n) => (
            <button key={n} onClick={() => noter(n)} className={`rounded-2xl border bg-surface px-3 py-3 text-center transition ${TON[n]}`}>
              <span className="block font-medium">{LIBELLES_NOTE[n]}</span>
              <span className="block font-mono text-xs text-discret">{n === 1 ? "demain" : `${prev[n]} j`} · <kbd>{n}</kbd></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
