"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpenText, Flame, Layers, Library, Newspaper, Sun } from "lucide-react";

const LIENS = [
  { href: "/", label: "Aujourd'hui", icone: Sun },
  { href: "/defis", label: "Défis", icone: Flame },
  { href: "/fiches", label: "Fiches", icone: BookOpenText },
  { href: "/reviser", label: "Réviser", icone: Layers },
  { href: "/fil", label: "Fil", icone: Newspaper },
  { href: "/ressources", label: "Ressources", icone: Library },
];

export function Nav() {
  const chemin = usePathname();
  const actif = (h: string) => (h === "/" ? chemin === "/" : chemin.startsWith(h));
  return (
    <nav aria-label="Principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-ligne bg-fond/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:static md:border-0 md:bg-transparent md:p-0">
      <ul className="flex gap-1 py-1.5 md:py-0">
        {LIENS.map(({ href, label, icone: Icone }) => (
          <li key={href} className="min-w-0 flex-1 md:flex-none">
            <Link href={href} aria-current={actif(href) ? "page" : undefined} className={`relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] transition md:flex-row md:gap-2 md:px-3 md:py-1.5 md:text-sm ${actif(href) ? "text-texte" : "text-discret hover:text-texte"}`}>
              {actif(href) && <motion.span layoutId="nav" className="absolute inset-0 rounded-xl bg-surface-2 ring-1 ring-ligne-forte" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icone className="relative size-5 md:size-4" aria-hidden />
              <span className="relative max-w-full truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
