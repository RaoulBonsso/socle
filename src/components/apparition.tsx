"use client";

import { motion, useReducedMotion } from "motion/react";

/** Apparition douce au défilement, neutralisée si l'utilisateur réduit les animations. */
export function Apparition({ children, delai = 0, className = "" }: { children: React.ReactNode; delai?: number; className?: string }) {
  const reduit = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduit ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: delai, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
