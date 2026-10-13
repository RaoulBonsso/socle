"use client";

import { useSyncExternalStore } from "react";
import { avantMinuit } from "@/domaine/defi";

const deux = (n: number) => String(Math.floor(n)).padStart(2, "0");
export const hms = (ms: number) => `${deux(ms / 3_600_000)}:${deux((ms / 60_000) % 60)}:${deux((ms / 1000) % 60)}`;

const abonnerSeconde = (f: () => void) => {
  const i = setInterval(f, 1000);
  return () => clearInterval(i);
};
const seconde = () => Math.floor(Date.now() / 1000);

/** Re-rend chaque seconde ; null côté serveur pour éviter un écart d'hydratation. */
export function useMaintenant(): Date | null {
  const s = useSyncExternalStore(abonnerSeconde, seconde, () => null);
  return s === null ? null : new Date(s * 1000);
}

/** L'horloge du jour : l'arc ambre est le temps qui reste avant minuit. */
export function HorlogeDuJour({ taille = 132 }: { taille?: number }) {
  const t = useMaintenant();
  const reste = t ? avantMinuit(t) : null;
  const part = reste === null ? 1 : reste / 86_400_000;
  const r = 52;
  const c = 2 * Math.PI * r;
  const urgent = reste !== null && reste < 3 * 3_600_000;
  return (
    <div className="relative grid place-items-center" style={{ width: taille, height: taille }} role="timer" aria-label={reste === null ? "Temps restant aujourd'hui" : `Il reste ${hms(reste)} avant minuit`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--ligne-forte)" strokeWidth="6" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={urgent ? "var(--corail)" : "var(--ambre)"} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * part} ${c}`} style={{ transition: "stroke-dasharray 1s linear" }} />
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1="60" y1="3" x2="60" y2={i % 6 ? 6 : 9} stroke="var(--discret)" strokeWidth="1" transform={`rotate(${i * 15} 60 60)`} opacity=".5" />
        ))}
      </svg>
      <div className="text-center">
        <p className={`font-mono text-lg tabular-nums ${urgent ? "text-corail" : ""}`}>{reste === null ? "--:--:--" : hms(reste)}</p>
        <p className="text-[10px] uppercase tracking-widest text-discret">avant minuit</p>
      </div>
    </div>
  );
}
