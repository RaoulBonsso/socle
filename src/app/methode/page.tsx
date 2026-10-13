import { Apparition } from "@/components/apparition";

export const metadata = { title: "La méthode" };

const PRINCIPES = [
  { t: "Apprendre en résolvant", d: "Chaque défi est une situation d'entreprise : un incident, une donnée qui ment, une faille. On formule des hypothèses avant de chercher, comme en astreinte. C'est l'apprentissage par problème : la connaissance s'accroche au contexte où elle a servi.", s: "Hmelo-Silver, 2004 — Problem-Based Learning" },
  { t: "Se tester plutôt que relire", d: "Chercher la réponse avant de la voir (rappel actif) ancre bien mieux que relire. Les cartes posent des questions ouvertes, jamais oui/non.", s: "Roediger & Karpicke, 2006 — The testing effect" },
  { t: "Revoir juste avant d'oublier", d: "La révision espacée (SM-2) programme chaque carte au moment où tu allais l'oublier : 1 jour, 6 jours, puis de plus en plus loin. Cinq minutes par jour suffisent.", s: "Cepeda et al., 2006 — Distributed practice" },
  { t: "Alterner les sujets", d: "Un jour DevOps, un jour data, un jour full stack. Mélanger oblige à reconnaître le type de problème, ce que le travail réel exige.", s: "Rohrer & Taylor, 2007 — Interleaved practice" },
  { t: "Expliquer simplement", d: "Une notion qu'on ne sait pas expliquer simplement n'est pas comprise. Les fiches commencent par une analogie, la correction par un diagnostic en une phrase.", s: "Méthode Feynman" },
  { t: "Une contrainte de temps", d: "Le chrono et l'échéance de minuit imitent la pression d'une vraie intervention, sans la panique : la durée visée est un repère, pas une sanction.", s: "Pratique délibérée — Ericsson, 1993" },
];

export default function Methode() {
  return (
    <div className="mx-auto max-w-3xl">
      <Apparition>
        <h1 className="titre-display text-4xl sm:text-5xl">La méthode</h1>
        <p className="mt-3 text-discret">Socle n&apos;invente rien : il assemble six techniques dont l&apos;efficacité est établie par la recherche en sciences de l&apos;apprentissage.</p>
      </Apparition>
      <ol className="mt-8 space-y-4">
        {PRINCIPES.map((p, i) => (
          <Apparition key={p.t} delai={i * 0.04}>
            <li className="carte p-6">
              <p className="font-mono text-sm text-ambre">0{i + 1}</p>
              <h2 className="mt-1 text-xl font-medium">{p.t}</h2>
              <p className="mt-2 leading-relaxed text-discret">{p.d}</p>
              <p className="mt-3 text-xs text-discret">{p.s}</p>
            </li>
          </Apparition>
        ))}
      </ol>
    </div>
  );
}
