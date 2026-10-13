import type { Piste } from "@/domaine/types";

export const NOM_PISTE: Record<Piste, string> = { devops: "DevOps", data: "Data", fullstack: "Full stack" };

export function BadgePiste({ piste }: { piste: Piste }) {
  return (
    <span className="puce" style={{ borderColor: `color-mix(in srgb, var(--${piste}) 45%, transparent)`, color: `var(--${piste})` }}>
      <span className="size-1.5 rounded-full" style={{ background: `var(--${piste})` }} aria-hidden /> {NOM_PISTE[piste]}
    </span>
  );
}
