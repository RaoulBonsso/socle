---json
{"titre":"Les rendez-vous de 0 h 30 affichés la veille : erreur d'hydratation et fuseaux horaires","date":"2026-10-18","piste":"fullstack","difficulte":2,"duree":60,"contexte":"Un centre de téléconsultation vétérinaire (8 vétérinaires, gardes de nuit) utilise un agenda en Next.js 16, déployé dans un conteneur Docker sur un VPS. Les rendez-vous sont stockés en timestamptz dans PostgreSQL.","competences":["Comprendre l'hydratation et ce qui la fait échouer","Formater des dates de façon déterministe avec Intl.DateTimeFormat et timeZone","Choisir où calculer une valeur dépendant du temps (serveur, client après montage)","Raisonner en UTC pour le stockage et en fuseau métier pour l'affichage"],"livrable":"Ce qu'il faut soumettre : 1) l'explication des deux symptômes, 2) le composant corrigé, 3) le test qui prouve que le formatage ne dépend plus du fuseau de la machine, 4) la règle d'équipe sur les dates en une phrase.","indices":["Le même composant est rendu deux fois : une fois sur le serveur (dans le conteneur), une fois dans le navigateur. Dans quel fuseau tourne chacun ?","toLocaleString sans option timeZone utilise le fuseau de la machine qui exécute le code. Lance node avec TZ=UTC puis TZ=Europe/Paris sur la même date.","Formate avec Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', … }) partout, y compris pour la clé de regroupement par jour. Pour « il y a 3 min », calcule après le montage."],"criteres":["Les deux symptômes (erreur d'hydratation et mauvais jour) sont reliés à la même cause : le fuseau implicite","Toutes les dates affichées et la clé de regroupement utilisent un fuseau explicite Europe/Paris","La durée relative n'est plus calculée pendant le rendu initial","Un test exécuté avec TZ=UTC et TZ=America/Montreal donne le même affichage","suppressHydrationWarning n'est utilisé, si besoin, que sur l'élément <time> de la durée relative, avec une justification"],"lecons":["nextjs-frontiere-serveur-client","sql-cte-fonctions-fenetre"],"sources":[{"titre":"Next.js — Text content does not match server-rendered HTML","url":"https://nextjs.org/docs/messages/react-hydration-error"},{"titre":"React — hydrateRoot","url":"https://react.dev/reference/react-dom/client/hydrateRoot"},{"titre":"MDN — Intl.DateTimeFormat","url":"https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat"},{"titre":"PostgreSQL — Date/Time Types (timestamptz)","url":"https://www.postgresql.org/docs/current/datatype-datetime.html"}]}
---
## La situation

Lundi, 9 h. La responsable des gardes de nuit t'appelle : « Cette nuit, une propriétaire de chien s'est connectée en téléconsultation à 0 h 30, mais personne ne l'attendait. Dans l'agenda, son rendez-vous apparaissait dans la colonne de la veille ! Et quand j'ouvre la page, les heures "clignotent" une fraction de seconde. »

Le développeur qui a écrit l'agenda a remarqué des erreurs rouges dans la console du navigateur en développement, mais « ça s'affichait quand même, donc il a laissé ».

## Ce que tu as sous la main

`app/agenda/liste-rdv.tsx` :

```tsx
"use client";

type Rdv = { id: string; debut: string; creeLe: string; patient: string };

export default function ListeRdv({ rdvs }: { rdvs: Rdv[] }) {
  const parJour = new Map<string, Rdv[]>();
  for (const r of rdvs) {
    const jour = new Date(r.debut).toLocaleDateString("fr-FR");
    parJour.set(jour, [...(parJour.get(jour) ?? []), r]);
  }

  return (
    <div>
      {[...parJour].map(([jour, liste]) => (
        <section key={jour}>
          <h2>{jour}</h2>
          <ul>
            {liste.map((r) => (
              <li key={r.id}>
                {new Date(r.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                {" — "}{r.patient}
                <small> (ajouté il y a {Math.round((Date.now() - Date.parse(r.creeLe)) / 60000)} min)</small>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

La page parente (Server Component) lit les rendez-vous en base et passe `debut` et `creeLe` en chaînes ISO, par exemple `"2026-10-18T21:30:00.000Z"`.

Le conteneur de production n'a pas de variable `TZ`. Sur le VPS :

```console
$ docker exec agenda node -e 'console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)'
UTC
```

Console du navigateur (extrait) :

```text
Uncaught Error: Hydration failed because the server rendered text didn't match the client.
As a result this tree will be regenerated on the client. …
-  18/10/2026
+  19/10/2026
```

Reproduction du formatage, sans Next.js :

```bash
cat > tz.mjs <<'EOF'
const d = new Date("2026-10-19T22:30:00Z");
console.log(d.toLocaleString("fr-FR"));
EOF
TZ=UTC node tz.mjs              # 19/10/2026 22:30:00
TZ=Europe/Paris node tz.mjs     # 20/10/2026 00:30:00
TZ=America/Montreal node tz.mjs # 19/10/2026 18:30:00
```

## Ta mission

1. Explique le mécanisme de l'erreur d'hydratation : qui rend quoi, où, et pourquoi le texte diffère.
2. Pourquoi un rendez-vous à 0 h 30 (heure de Paris) a-t-il pu être affiché la veille ? Qui voyait juste, et dans quel cas même le navigateur se tromperait-il ?
3. Corrige le composant pour que l'affichage soit identique sur le serveur et dans le navigateur, et juste pour le métier.
4. Que faire de « ajouté il y a N min », qui ne peut par nature pas être identique entre le serveur et le navigateur ?
5. Écris le test qui empêchera la régression.

===CORRECTION===
## Diagnostic

Un Client Component est **rendu deux fois** : sur le serveur, pour produire le HTML initial, puis dans le navigateur, où React « hydrate » ce HTML (il attache les gestionnaires d'événements) en s'attendant à produire exactement le même arbre. La documentation Next.js cite parmi les causes classiques les API dépendant du temps, comme le constructeur `Date()`, utilisées pendant le rendu.

Ici, deux sources de différence :

1. **Le fuseau implicite.** `toLocaleDateString("fr-FR")` sans `timeZone` utilise le fuseau de la machine. Le serveur tourne en UTC, le navigateur en `Europe/Paris`. En octobre, Paris est à UTC+2. Un rendez-vous le 19 à 0 h 30, heure de Paris, est stocké `2026-10-18T22:30:00Z` : le serveur écrit **18/10 à 22:30**, le navigateur **19/10 à 00:30**. Entre minuit et 2 h du matin (1 h en hiver), le jour lui-même change. Le texte diffère, React lève l'erreur et régénère l'arbre côté client : c'est le « clignotement ».
2. **`Date.now()` pendant le rendu** : quelques centaines de millisecondes séparent les deux rendus. Une minute peut basculer entre les deux.

Le mauvais jour : selon l'appareil, une partie du personnel voyait la version du serveur (HTML initial, page mise en cache, prérendu) ou celle d'un navigateur réglé sur un autre fuseau. Et même un navigateur « juste » se trompe dès qu'un vétérinaire consulte l'agenda en déplacement à Montréal : il verrait les rendez-vous à l'heure de Montréal, alors que le cabinet travaille à l'heure de Paris. L'heure à afficher est celle **du métier**, pas celle de la machine.

## Solution

Un formateur partagé, au fuseau explicite, utilisable côté serveur comme côté client :

```ts
// src/lib/dates.ts
const FUSEAU_METIER = "Europe/Paris";

const formatJour = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_METIER, weekday: "long", day: "numeric", month: "long",
});
const formatHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_METIER, hour: "2-digit", minute: "2-digit",
});
// Clé de regroupement triable AAAA-MM-JJ, calculée dans le fuseau métier
const formatCle = new Intl.DateTimeFormat("fr-CA", {
  timeZone: FUSEAU_METIER, year: "numeric", month: "2-digit", day: "2-digit",
});

export const jourAffiche = (iso: string) => formatJour.format(new Date(iso));
export const heureAffichee = (iso: string) => formatHeure.format(new Date(iso));
export const cleJour = (iso: string) => formatCle.format(new Date(iso));
```

La locale `fr-CA` produit le format `AAAA-MM-JJ` : on s'en sert uniquement comme clé technique.

Le composant corrigé :

```tsx
"use client";
import { useEffect, useState } from "react";
import { cleJour, heureAffichee, jourAffiche } from "@/lib/dates";

type Rdv = { id: string; debut: string; creeLe: string; patient: string };

function IlYA({ iso }: { iso: string }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const maj = () => setMinutes(Math.round((Date.now() - Date.parse(iso)) / 60000));
    maj();
    const t = setInterval(maj, 60_000);
    return () => clearInterval(t);
  }, [iso]);
  // Rendu initial identique serveur/client : rien tant que le composant n'est pas monté
  return minutes === null ? null : <small> (ajouté il y a {minutes} min)</small>;
}

export default function ListeRdv({ rdvs }: { rdvs: Rdv[] }) {
  const parJour = new Map<string, Rdv[]>();
  for (const r of rdvs) {
    const cle = cleJour(r.debut);
    parJour.set(cle, [...(parJour.get(cle) ?? []), r]);
  }

  return (
    <div>
      {[...parJour].map(([cle, liste]) => (
        <section key={cle}>
          <h2>{jourAffiche(liste[0].debut)}</h2>
          <ul>
            {liste.map((r) => (
              <li key={r.id}>
                <time dateTime={r.debut}>{heureAffichee(r.debut)}</time>
                {" — "}{r.patient}
                <IlYA iso={r.creeLe} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

Le test qui verrouille le comportement, exécuté sous plusieurs fuseaux :

```ts
// src/lib/dates.test.ts (Vitest)
import { describe, expect, it } from "vitest";
import { cleJour, heureAffichee } from "./dates";

describe("dates métier", () => {
  it("affiche 00:30 le 20 octobre pour 22:30 UTC le 19, quel que soit le fuseau de la machine", () => {
    expect(cleJour("2026-10-19T22:30:00Z")).toBe("2026-10-20");
    expect(heureAffichee("2026-10-19T22:30:00Z")).toBe("00:30");
  });
});
```

```bash
TZ=UTC npx vitest run src/lib/dates.test.ts
TZ=America/Montreal npx vitest run src/lib/dates.test.ts
```

Le test doit passer dans les deux cas. Avant la correction, il échouait sous `TZ=UTC`.

`suppressHydrationWarning` aurait masqué l'erreur sans corriger le mauvais jour. La documentation le présente comme une échappatoire, pour un seul niveau d'élément, et React ne corrige alors pas le texte divergent. On peut le réserver à un `<time>` purement relatif, jamais à une donnée métier.

Règle d'équipe : **on stocke en UTC (`timestamptz`), on transporte en ISO 8601, et on n'affiche jamais une date sans fuseau explicite.**

## Pourquoi ça arrive en vrai

- En développement, serveur et navigateur sont sur la même machine, dans le même fuseau : le bug est invisible. Il n'apparaît qu'une fois en production, dans un conteneur en UTC.
- Les bugs de fuseau ne touchent que les heures proches de minuit : ils passent les tests manuels faits en journée.
- Les avertissements d'hydratation sont pris pour du bruit de développement, alors qu'ils signalent un affichage potentiellement faux.

## Ce qu'un senior ferait en plus

- Fixer `TZ=UTC` **explicitement** dans l'image Docker et la CI : le comportement par défaut devient connu et reproductible, et les tests tournent aussi sous un autre fuseau.
- Faire les regroupements par jour **en SQL** quand c'est possible, avec un fuseau explicite (`(debut AT TIME ZONE 'Europe/Paris')::date`), comme dans la leçon `sql-cte-fonctions-fenetre`.
- Si le centre ouvre une antenne dans un autre fuseau, stocker le fuseau **du lieu** avec le rendez-vous (`'America/Montreal'`) plutôt qu'une constante globale.
- Tester les cas limites : changement d'heure (la nuit du dernier dimanche d'octobre a deux fois 2 h 30 à Paris), rendez-vous à cheval sur minuit, 29 février.
- Ajouter une règle de lint interdisant `toLocaleString`, `toLocaleDateString` et `toLocaleTimeString` sans option `timeZone` dans le code de rendu.
