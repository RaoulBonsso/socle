import { Apparition } from "@/components/apparition";
import { lecons, parcours } from "@/lib/contenu";
import { Carte } from "./carte";

export const metadata = { title: "Fiches terrain" };

export default function Fiches() {
  const ls = new Map(lecons().map((l) => [l.slug, l]));
  return (
    <div>
      <Apparition>
        <h1 className="titre-display text-4xl sm:text-5xl">Fiches terrain</h1>
        <p className="mt-2 max-w-2xl text-discret">Trois parcours, du niveau actuel au niveau senior. Chaque fiche part d&apos;une situation d&apos;entreprise et finit par une pratique sur ta machine.</p>
      </Apparition>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {parcours().pistes.map((p) => (
          <section key={p.id} aria-labelledby={`p-${p.id}`} className="min-w-0">
            <h2 id={`p-${p.id}`} className="titre-display text-2xl" style={{ color: `var(--${p.id})` }}>{p.titre}</h2>
            <p className="mt-1 text-sm text-discret">{p.description}</p>
            <ol className="mt-4 space-y-4">
              {p.modules.map((m, i) => (
                <li key={m.id} className="relative border-l border-ligne-forte pl-5">
                  <span className="absolute -left-[7px] top-1 size-3 rounded-full border-2 bg-fond" style={{ borderColor: `var(--${p.id})` }} aria-hidden />
                  <p className="text-xs uppercase tracking-widest text-discret">Module {i + 1}</p>
                  <p className="font-medium">{m.titre}</p>
                  <ul className="mt-2 space-y-1.5">
                    {m.lecons.map((s) => ls.get(s)).filter((l) => l !== undefined).map((l) => <Carte key={l.slug} slug={l.slug} titre={l.titre} duree={l.duree} niveau={l.niveau} />)}
                    {m.aVenir.map((t) => <li key={t} className="rounded-lg border border-dashed border-ligne px-3 py-2 text-sm text-discret">{t} <span className="text-xs">· bientôt</span></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
