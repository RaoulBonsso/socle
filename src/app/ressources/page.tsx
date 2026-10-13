import { Apparition } from "@/components/apparition";
import { ressources } from "@/lib/contenu";
import { Bibliotheque } from "./bibliotheque";

export const metadata = { title: "Ressources" };

export default function Ressources() {
  const rs = [...ressources()].sort((a, b) => (a.ajouteLe < b.ajouteLe ? 1 : a.niveau - b.niveau));
  return (
    <div>
      <Apparition>
        <h1 className="titre-display text-4xl sm:text-5xl">Ressources</h1>
        <p className="mt-2 max-w-2xl text-discret">{rs.length} ressources gratuites, officielles d&apos;abord, choisies une à une — et la liste grandit avec les défis.</p>
      </Apparition>
      <Bibliotheque ressources={rs} />
    </div>
  );
}
