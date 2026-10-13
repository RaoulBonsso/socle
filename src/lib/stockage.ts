"use client";

import { useCallback, useSyncExternalStore } from "react";
import { lireProgression, VIDE, type Progression } from "@/domaine/progression";

/**
 * Progression locale à l'appareil (aucun compte requis). Export / import JSON
 * pour la sauvegarder ou la passer d'un appareil à l'autre.
 */
const CLE = "socle:progression:v1";
const abonnes = new Set<() => void>();
let instantane: Progression | null = null;

function lire(): Progression {
  if (instantane) return instantane;
  try {
    instantane = lireProgression(JSON.parse(localStorage.getItem(CLE) ?? "null"));
  } catch {
    instantane = VIDE;
  }
  return instantane;
}

export function ecrire(p: Progression) {
  instantane = p;
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    /* navigation privée : la progression vit le temps de la session */
  }
  abonnes.forEach((f) => f());
}

function abonner(f: () => void) {
  abonnes.add(f);
  const ailleurs = (e: StorageEvent) => {
    if (e.key === CLE) {
      instantane = null;
      f();
    }
  };
  window.addEventListener("storage", ailleurs);
  return () => {
    abonnes.delete(f);
    window.removeEventListener("storage", ailleurs);
  };
}

export function useProgression() {
  const p = useSyncExternalStore(abonner, lire, () => VIDE);
  const maj = useCallback((f: (p: Progression) => Progression) => ecrire(f(lire())), []);
  return [p, maj] as const;
}

export const aujourdhui = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
