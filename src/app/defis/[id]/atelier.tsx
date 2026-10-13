"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Circle, Lightbulb, Lock, Send, Timer } from "lucide-react";
import { useState } from "react";
import { ajouterHypothese, commencerDefi, evaluer, score, soumettre, voirIndice } from "@/domaine/progression";
import { hms, HorlogeDuJour, useMaintenant } from "@/components/chrono";
import { useProgression } from "@/lib/stockage";

interface Props {
  id: string;
  duree: number;
  indices: string[];
  criteres: string[];
  livrable: string;
}

/** L'établi du défi : chrono, hypothèses, indices, soumission, correction, auto-évaluation. */
export function Atelier({ id, duree, indices, criteres, livrable }: Props) {
  const [p, maj] = useProgression();
  const e = p.defis[id];
  const t = useMaintenant();
  const reduit = useReducedMotion();
  const [hyp, setHyp] = useState("");
  const [solution, setSolution] = useState("");
  const [confirmer, setConfirmer] = useState(false);
  const iso = () => new Date().toISOString();
  const ecoule = e && t ? (e.soumisLe ? Date.parse(e.soumisLe) : t.getTime()) - Date.parse(e.debut) : 0;
  const depasse = ecoule > duree * 60_000;

  if (!e)
    return (
      <div className="carte p-6 text-center">
        <HorlogeDuJour />
        <p className="mt-4 text-sm text-discret">Durée visée : <span className="font-mono text-texte">{duree} min</span>. Le chrono démarre quand tu commences.</p>
        <button onClick={() => maj((x) => commencerDefi(x, id, iso()))} className="mt-4 inline-flex items-center gap-2 rounded-full bg-ambre px-6 py-3 font-medium text-[#1a1205] transition hover:brightness-110">
          <Timer className="size-4" aria-hidden /> Lancer le chrono
        </button>
      </div>
    );

  const sc = score(e, criteres.length, duree);
  return (
    <div className="space-y-4">
      <div className="carte flex items-center gap-5 p-5">
        <HorlogeDuJour taille={104} />
        <div>
          <p className="text-xs uppercase tracking-widest text-discret">{e.soumisLe ? "Résolu en" : "En cours depuis"}</p>
          <p className={`font-mono text-3xl tabular-nums ${depasse && !e.soumisLe ? "text-corail" : ""}`}>{t ? hms(Math.max(0, ecoule)) : "--:--:--"}</p>
          <p className="text-xs text-discret">objectif {duree} min {depasse ? "· dépassé" : ""}</p>
        </div>
      </div>

      <section className="carte p-5" aria-labelledby="h-hyp">
        <h2 id="h-hyp" className="font-medium">Hypothèses <span className="text-xs text-discret">— écris ce que tu soupçonnes avant de chercher</span></h2>
        {!e.soumisLe && (
          <form onSubmit={(ev) => { ev.preventDefault(); maj((x) => ajouterHypothese(x, id, hyp, iso())); setHyp(""); }} className="mt-3 flex gap-2">
            <label htmlFor="hyp" className="sr-only">Nouvelle hypothèse</label>
            <input id="hyp" value={hyp} onChange={(ev) => setHyp(ev.target.value)} placeholder="Je pense que…" className="min-w-0 flex-1 rounded-xl border border-ligne-forte bg-fond px-3 py-2 text-sm outline-none focus:border-ambre" />
            <button className="rounded-xl border border-ligne-forte px-4 text-sm hover:border-ambre hover:text-ambre">Noter</button>
          </form>
        )}
        <ol className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {e.hypotheses.map((h, i) => (
              <motion.li key={h.t} initial={reduit ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 text-sm">
                <span className="font-mono text-xs text-discret">H{i + 1} · {new Date(h.t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span>{h.texte}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {e.hypotheses.length === 0 && <li className="text-sm text-discret">Aucune pour l&apos;instant. Un bon diagnostic commence par deux ou trois pistes.</li>}
        </ol>
      </section>

      <section className="carte p-5" aria-labelledby="h-ind">
        <h2 id="h-ind" className="flex items-center gap-2 font-medium"><Lightbulb className="size-4 text-ambre" aria-hidden /> Indices <span className="text-xs text-discret">— −10 points chacun</span></h2>
        <ol className="mt-3 space-y-2 text-sm">
          {indices.slice(0, e.indices).map((x, i) => <li key={i} className="rounded-lg bg-ambre-doux px-3 py-2"><span className="font-mono text-xs text-ambre">#{i + 1}</span> {x}</li>)}
        </ol>
        {e.indices < indices.length && !e.soumisLe && (
          <button onClick={() => maj((x) => voirIndice(x, id, indices.length, iso()))} className="mt-3 text-sm text-ambre hover:underline">
            Révéler l&apos;indice {e.indices + 1} sur {indices.length}
          </button>
        )}
      </section>

      {!e.soumisLe ? (
        <section className="carte p-5" aria-labelledby="h-sol">
          <h2 id="h-sol" className="font-medium">Ta solution</h2>
          <p className="mt-1 text-xs text-discret">Attendu : {livrable}</p>
          <label htmlFor="sol" className="sr-only">Solution</label>
          <textarea id="sol" value={solution} onChange={(ev) => setSolution(ev.target.value)} rows={10} placeholder="Diagnostic, correctif (code, commandes), et comment éviter que ça revienne." className="mt-3 w-full resize-y rounded-xl border border-ligne-forte bg-fond p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-ambre" />
          {!confirmer ? (
            <button disabled={!solution.trim()} onClick={() => setConfirmer(true)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-ambre px-5 py-2.5 font-medium text-[#1a1205] disabled:opacity-40">
              <Send className="size-4" aria-hidden /> Soumettre
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-ambre-doux p-3 text-sm">
              <Lock className="size-4 text-ambre" aria-hidden /> Une fois soumise, ta réponse est figée et la correction s&apos;affiche.
              <button onClick={() => maj((x) => soumettre(x, id, solution, iso()))} className="rounded-full bg-ambre px-4 py-1.5 font-medium text-[#1a1205]">Je soumets</button>
              <button onClick={() => setConfirmer(false)} className="text-discret hover:text-texte">Pas encore</button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="carte p-5" aria-labelledby="h-auto">
            <h2 id="h-auto" className="flex items-center justify-between font-medium">
              Auto-évaluation <span className="font-mono text-2xl text-menthe tabular-nums">{sc}<span className="text-sm text-discret">/100</span></span>
            </h2>
            <p className="mt-1 text-xs text-discret">Coche honnêtement ce que ta solution couvrait, en la comparant à la correction.</p>
            <ul className="mt-3 space-y-2">
              {criteres.map((c, i) => {
                const ok = e.criteres.includes(i);
                return (
                  <li key={i}>
                    <button onClick={() => maj((x) => evaluer(x, id, ok ? e.criteres.filter((k) => k !== i) : [...e.criteres, i]))} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2" aria-pressed={ok}>
                      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-menthe" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-discret" aria-hidden />} {c}
                    </button>
                  </li>
                );
              })}
            </ul>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-discret">Ma réponse soumise</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-fond p-3 font-mono text-xs">{e.solution}</pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}

/** La correction n'apparaît qu'une fois la solution soumise, en pleine largeur sous l'énoncé. */
export function Correction({ id, html }: { id: string; html: string }) {
  const [p] = useProgression();
  const reduit = useReducedMotion();
  if (!p.defis[id]?.soumisLe) return null;
  return (
    <motion.section id="correction" initial={reduit ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="carte mt-10 border-menthe/30 p-6 sm:p-8" aria-labelledby="h-cor">
      <h2 id="h-cor" className="titre-display text-3xl text-menthe">Correction</h2>
      <div className="prose-socle mt-2" dangerouslySetInnerHTML={{ __html: html }} />
    </motion.section>
  );
}
