---json
{"titre":"Architecture hexagonale en TypeScript : sortir la logique métier du framework","piste":"fullstack","module":"architecture-patterns","niveau":2,"duree":20,"prerequis":[],"objectifs":["Identifier ce qui relève du domaine, des ports et des adaptateurs dans une application Next.js ou Node","Écrire un cas d'usage qui ne dépend ni de la base ni du framework, par injection de dépendances","Tester la logique métier en quelques millisecondes, sans base de données ni serveur","Savoir quand cette architecture est disproportionnée"],"sources":[{"titre":"Alistair Cockburn — Hexagonal Architecture (article original)","url":"https://alistair.cockburn.us/hexagonal-architecture/"},{"titre":"Node.js — Test runner (node:test)","url":"https://nodejs.org/api/test.html"},{"titre":"Node.js — Modules: TypeScript (exécution native)","url":"https://nodejs.org/api/typescript.html"},{"titre":"TypeScript Handbook — Interfaces et types d'objets","url":"https://www.typescriptlang.org/docs/handbook/2/objects.html"}],"liens":["nextjs-frontiere-serveur-client","validation-aux-frontieres-zod","modelisation-dimensionnelle"]}
---
## Pourquoi c'est important

Une agence reprend l'application de réservation d'un réseau de salles d'escalade. Le code a deux ans : Next.js, Supabase. Les règles métier (« pas de réservation dans le passé », « un créneau ne peut pas être pris deux fois », « les abonnés réservent 7 jours à l'avance, les autres 2 ») sont éparpillées dans des Server Actions, des composants React et un trigger SQL. Le client annonce : « On quitte Supabase pour un PostgreSQL managé chez OVH, et on veut une appli mobile qui réutilise les mêmes règles. » Estimation de l'équipe : trois semaines, parce que personne ne sait où sont toutes les règles. Et il n'y a aucun test, car tester une règle oblige à démarrer Next.js et une base.

L'**architecture hexagonale** (ports et adaptateurs, Alistair Cockburn, 2005) répond exactement à ce problème : la logique métier vit au centre, sans dépendre de rien. La base, le framework, l'envoi de mails sont des **détails branchés de l'extérieur**. Changer de base revient à écrire un nouvel adaptateur ; tester une règle prend quelques millisecondes. C'est aussi un vocabulaire attendu en entretien dès qu'on parle d'architecture backend.

## Le concept

Analogie : un **ordinateur portable et ses ports USB-C**. Le portable (le domaine) définit la forme du port. Il se moque de ce qu'on y branche : un écran Dell, un écran Samsung, ou un adaptateur de test sur ton bureau. Ce sont les périphériques qui s'adaptent à la prise, jamais l'inverse.

Les trois zones :

- **Domaine** (le centre) : les règles et les cas d'usage (`reserverCreneau`). Du TypeScript pur : pas d'import de `next`, de `@supabase/supabase-js` ni de `pg`.
- **Ports** : des interfaces définies **par le domaine**.
  - *Port primaire (entrant)* : ce que le domaine offre, c'est-à-dire le cas d'usage lui-même.
  - *Port secondaire (sortant)* : ce dont le domaine a besoin (`ReservationRepository`, `Horloge`, `Notifieur`).
- **Adaptateurs** (l'extérieur) : le code qui branche le monde réel sur les ports.
  - *Primaires* : une Server Action Next.js, une route d'API, une commande CLI, un test, qui **appellent** le cas d'usage.
  - *Secondaires* : un repository PostgreSQL, un repository en mémoire, un client SMTP, qui **implémentent** les ports sortants.

La règle unique : **les dépendances pointent vers le centre**. Le domaine ne connaît aucun adaptateur. On lui fournit ses dépendances au moment de le construire : c'est l'**injection de dépendances**, ici avec une simple fonction, sans framework.

## Exemple

Structure :

```text
src/
  domaine/
    reservation.ts          ← règles + ports (aucun import externe)
    reservation.test.ts
  adaptateurs/
    reservation-memoire.ts  ← adaptateur secondaire pour les tests
```

`src/domaine/reservation.ts` :

```ts
// Domaine : aucune dépendance vers Next.js, la base ou HTTP.
export type Reservation = { id: string; creneau: string; email: string };

// Port secondaire (sortant) : ce dont le domaine a BESOIN.
export interface ReservationRepository {
  trouverParCreneau(creneau: string): Promise<Reservation | null>;
  enregistrer(r: Reservation): Promise<void>;
}

export interface Horloge { maintenant(): Date }

export class CreneauDejaPris extends Error {}
export class CreneauPasse extends Error {}

// Cas d'usage = port primaire (entrant) : ce que le domaine OFFRE.
export function creerReserverCreneau(deps: {
  repo: ReservationRepository;
  horloge: Horloge;
  genererId: () => string;
}) {
  return async function reserverCreneau(entree: { creneau: string; email: string }): Promise<Reservation> {
    if (new Date(entree.creneau) <= deps.horloge.maintenant()) throw new CreneauPasse(entree.creneau);
    if (await deps.repo.trouverParCreneau(entree.creneau)) throw new CreneauDejaPris(entree.creneau);
    const reservation = { id: deps.genererId(), ...entree };
    await deps.repo.enregistrer(reservation);
    return reservation;
  };
}
```

L'horloge est un port. Ce n'est pas du zèle : sans elle, la règle « pas dans le passé » serait impossible à tester de façon déterministe.

`src/adaptateurs/reservation-memoire.ts` :

```ts
import type { Reservation, ReservationRepository } from "../domaine/reservation.ts";

// Adaptateur secondaire : implémentation en mémoire (tests, prototypes).
export class ReservationRepositoryMemoire implements ReservationRepository {
  #donnees = new Map<string, Reservation>();

  async trouverParCreneau(creneau: string) {
    return this.#donnees.get(creneau) ?? null;
  }
  async enregistrer(r: Reservation) {
    this.#donnees.set(r.creneau, r);
  }
}
```

`src/domaine/reservation.test.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { creerReserverCreneau, CreneauDejaPris, CreneauPasse } from "./reservation.ts";
import { ReservationRepositoryMemoire } from "../adaptateurs/reservation-memoire.ts";

const horlogeFixe = { maintenant: () => new Date("2026-10-13T09:00:00Z") };

function monter() {
  let n = 0;
  return creerReserverCreneau({
    repo: new ReservationRepositoryMemoire(),
    horloge: horlogeFixe,
    genererId: () => `r${++n}`,
  });
}

test("réserve un créneau libre", async () => {
  const reserver = monter();
  const r = await reserver({ creneau: "2026-10-14T10:00:00Z", email: "a@example.com" });
  assert.equal(r.id, "r1");
});

test("refuse un créneau déjà pris", async () => {
  const reserver = monter();
  await reserver({ creneau: "2026-10-14T10:00:00Z", email: "a@example.com" });
  await assert.rejects(
    reserver({ creneau: "2026-10-14T10:00:00Z", email: "b@example.com" }),
    CreneauDejaPris,
  );
});

test("refuse un créneau passé", async () => {
  const reserver = monter();
  await assert.rejects(
    reserver({ creneau: "2026-10-12T10:00:00Z", email: "a@example.com" }),
    CreneauPasse,
  );
});
```

Exécution, sans aucune dépendance (Node 22.18+ ou 24 exécute le TypeScript directement en retirant les types) :

```bash
npm init -y && npm pkg set type=module
node --test 'src/**/*.test.ts'
# ✔ réserve un créneau libre
# ✔ refuse un créneau déjà pris
# ✔ refuse un créneau passé
```

Côté Next.js, l'adaptateur primaire est mince. Il construit le cas d'usage avec les vrais adaptateurs (c'est la **racine de composition**) et traduit les erreurs du domaine en réponse pour l'interface :

```ts
// app/reservations/actions.ts (esquisse)
"use server";
import { creerReserverCreneau, CreneauDejaPris, CreneauPasse } from "@/domaine/reservation";
import { ReservationRepositoryPostgres } from "@/adaptateurs/reservation-postgres";

const reserverCreneau = creerReserverCreneau({
  repo: new ReservationRepositoryPostgres(),
  horloge: { maintenant: () => new Date() },
  genererId: () => crypto.randomUUID(),
});

export async function reserverAction(_etat: unknown, formData: FormData) {
  // validation des entrées : voir la leçon validation-aux-frontieres-zod
  try {
    await reserverCreneau({ creneau: String(formData.get("creneau")), email: String(formData.get("email")) });
    return { ok: true };
  } catch (e) {
    if (e instanceof CreneauDejaPris) return { ok: false, erreur: "Ce créneau vient d'être pris." };
    if (e instanceof CreneauPasse) return { ok: false, erreur: "Ce créneau est déjà passé." };
    throw e;
  }
}
```

## À toi de jouer

1. Reproduis l'exemple dans un dossier vide et fais passer les 3 tests.
2. Ajoute la règle « les abonnés réservent jusqu'à 7 jours à l'avance, les autres jusqu'à 2 ». **Écris d'abord les tests** (abonné à J+6 accepté, non-abonné à J+3 refusé), puis le code. De quel nouveau port as-tu besoin pour savoir si l'email est abonné ?
3. Ajoute un port `Notifieur` (envoi de confirmation) et un adaptateur `NotifieurConsole`. Teste que la notification n'est **pas** envoyée si l'enregistrement échoue.
4. Écris un adaptateur `ReservationRepositoryPostgres` avec le paquet `pg` et une requête paramétrée. Les tests du domaine ne doivent pas changer d'une ligne.
5. Contrôle d'architecture : `grep -rE "from ['\"](next|pg|@supabase)" src/domaine` doit ne rien renvoyer.

## Pièges courants

- **Laisser fuir le framework dans le domaine** : un `import { redirect } from "next/navigation"` ou un type généré par Supabase dans `domaine/` suffit à recoller le tout. Le domaine définit **ses** types ; l'adaptateur traduit.
- **Des interfaces pour tout** : un port n'a de sens que s'il y a (ou s'il y aura) au moins deux implémentations, ne serait-ce que la vraie et celle des tests. Ne crée pas d'abstraction pour une fonction utilitaire pure.
- **Domaine anémique** : si `reserverCreneau` se contente d'appeler `repo.enregistrer` et que les règles restent dans la Server Action, tu as les dossiers de l'hexagone sans ses bénéfices.
- **Condition de course** : vérifier « créneau libre » puis enregistrer ne protège pas contre deux requêtes simultanées. La garantie finale doit venir de l'adaptateur (contrainte `UNIQUE` en base), et le domaine doit traduire l'erreur correspondante.
- **Syntaxe TypeScript non effaçable** : l'exécution native de Node ne fait que retirer les types. Les `enum` et les propriétés de paramètres de constructeur (`constructor(private repo: Repo)`) provoquent l'erreur `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` : il faut alors compiler (`tsc`, un bundler) ou s'en passer, d'où les champs `#prives` et les fonctions dans l'exemple. Autre exigence : les imports relatifs gardent leur extension `.ts`.
- **Sur-architecturer un prototype** : pour une landing page ou un CRUD sans règles, l'hexagone est un coût sans retour. On l'adopte quand les règles métier existent et doivent survivre au framework.

## Vérifie-toi

1. Dans l'application de réservation, classe ces éléments : la Server Action, `ReservationRepository`, la règle des 7 jours, le client SMTP, un test `node:test`. Lesquels sont des ports, des adaptateurs primaires, secondaires, ou du domaine ?
2. Pourquoi l'horloge est-elle injectée au lieu d'appeler `new Date()` dans le cas d'usage ?
3. Où doit se faire la validation du format de l'email : dans le domaine ou dans l'adaptateur primaire ? Argumente, puis compare avec la leçon `validation-aux-frontieres-zod`.
