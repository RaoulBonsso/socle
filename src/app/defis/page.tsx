import { Apparition } from "@/components/apparition";
import { defis } from "@/lib/contenu";
import { ListeDefis } from "./liste";

export const metadata = { title: "Défis" };

export default function Defis() {
  const ds = [...defis()].reverse().map(({ id, titre, date, piste, difficulte, duree, criteres }) => ({ id, titre, date, piste, difficulte, duree, nbCriteres: criteres.length }));
  return (
    <div>
      <Apparition>
        <h1 className="titre-display text-4xl sm:text-5xl">Les défis</h1>
        <p className="mt-2 max-w-2xl text-discret">Un incident, une donnée cassée, une faille : des situations comme on en vit en entreprise. Un par jour, à résoudre avant minuit — les défis passés restent ouverts au rattrapage.</p>
      </Apparition>
      <ListeDefis defis={ds} />
    </div>
  );
}
