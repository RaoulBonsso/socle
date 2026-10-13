---json
{"titre":"Valider aux frontières avec Zod : ne jamais faire confiance à ce qui entre","piste":"fullstack","module":"architecture-patterns","niveau":2,"duree":20,"prerequis":["nextjs-frontiere-serveur-client"],"objectifs":["Identifier toutes les frontières d'une application où entrent des données non fiables","Écrire un schéma Zod qui valide ET convertit (coercion, valeurs par défaut, clés inconnues refusées)","Utiliser safeParse et renvoyer des erreurs exploitables par un formulaire","Valider la configuration (variables d'environnement) au démarrage plutôt qu'au premier crash"],"sources":[{"titre":"Zod — Documentation officielle","url":"https://zod.dev/"},{"titre":"Zod — Defining schemas (API)","url":"https://zod.dev/api"},{"titre":"Zod — Formatting errors","url":"https://zod.dev/error-formatting"},{"titre":"OWASP Cheat Sheet — Input Validation","url":"https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html"},{"titre":"OWASP Cheat Sheet — Mass Assignment","url":"https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html"}],"liens":["nextjs-frontiere-serveur-client","architecture-hexagonale-ts","sql-explain-index"]}
---
## Pourquoi c'est important

Vendredi 18 h, une plateforme de réservation de salles de réunion. Un client a réservé une salle pour **-3 personnes** : le calcul de tarif a produit un montant négatif, et la facture a crédité son compte. Le même week-end, un utilisateur curieux ajoute `"role": "admin"` au JSON envoyé par le formulaire de profil. Le handler faisait `db.user.update({ data: body })` : il est devenu administrateur. Enfin, lundi matin, le déploiement plante en production avec `TypeError: Cannot read properties of undefined` : quelqu'un a renommé `DATABASE_URL` en `DB_URL` dans le gestionnaire de secrets.

Trois incidents, une même cause : des données venues de l'extérieur sont entrées dans le système **sans contrôle de forme**. TypeScript n'y peut rien : les types disparaissent à l'exécution, et `req.json()` renvoie ce que le client a bien voulu envoyer. OWASP classe les défauts de validation d'entrée parmi les causes racines de la plupart des vulnérabilités web. La parade : **valider à chaque frontière**, une fois, avec un schéma qui sert aussi de type.

## Le concept

Analogie : le **contrôle aux frontières d'un aéroport**. À l'intérieur de la zone internationale, on ne revérifie pas les passeports à chaque porte d'embarquement : on fait confiance, *parce que* le contrôle a eu lieu à l'entrée. Et ce contrôle est strict : liste blanche de documents acceptés, refus de ce qui n'est pas prévu.

Les **frontières** d'une application full stack :

- corps de requête, `FormData` des Server Actions, paramètres d'URL, `searchParams`, en-têtes, cookies ;
- réponses d'API tierces et webhooks (elles changent sans prévenir) ;
- variables d'environnement et fichiers de configuration ;
- messages de file d'attente, fichiers CSV importés, `localStorage`.

Le principe **« parse, don't validate »** : on ne se contente pas de répondre « valide / invalide », on **transforme** une donnée `unknown` en valeur typée et normalisée (texte nettoyé, nombre converti, défauts appliqués). Après la frontière, le code manipule des types sûrs.

Zod fait les deux d'un coup : un schéma décrit la forme attendue, `safeParse` vérifie et convertit, et `z.infer` en déduit le type TypeScript. Il n'y a qu'**une seule source de vérité**.

## Exemple

```bash
npm install zod   # Zod 4
```

```ts
// src/schemas/reservation.ts
import * as z from "zod";

export const ReservationEntree = z.strictObject({        // clés inconnues refusées
  email: z.email().max(254),
  creneau: z.iso.datetime(),                             // ISO 8601, ex. 2026-10-14T10:00:00Z
  personnes: z.coerce.number().int().min(1).max(8),      // "2" (FormData) → 2
  commentaire: z.string().trim().max(500).optional(),
});

export type ReservationEntree = z.infer<typeof ReservationEntree>;
```

Ce que produit le schéma (sortie réelle avec Zod 4) :

```ts
ReservationEntree.safeParse({ email: "a@example.com", creneau: "2026-10-14T10:00:00Z", personnes: "2" });
// { success: true, data: { email: "a@example.com", creneau: "2026-10-14T10:00:00Z", personnes: 2 } }

const r = ReservationEntree.safeParse({ email: "pas-un-email", creneau: "demain", personnes: 0, role: "admin" });
// r.success === false
z.flattenError(r.error);
// { formErrors: ['Unrecognized key: "role"'],
//   fieldErrors: { email: ["Invalid email address"],
//                  creneau: ["Invalid ISO datetime"],
//                  personnes: ["Too small: expected number to be >=1"] } }
```

Branché dans une Server Action (l'adaptateur primaire de la leçon `architecture-hexagonale-ts`) :

```ts
// app/reservations/actions.ts
"use server";
import * as z from "zod";
import { ReservationEntree } from "@/schemas/reservation";
import { reserverCreneau } from "@/application"; // cas d'usage déjà assemblé

export type EtatFormulaire = { ok: boolean; erreurs?: Record<string, string[] | undefined> };

export async function reserverAction(_prec: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  // On construit l'objet champ par champ : Object.fromEntries(formData) contiendrait
  // aussi des clés techniques préfixées par $ACTION_, refusées par strictObject.
  const resultat = ReservationEntree.safeParse({
    email: formData.get("email"),
    creneau: formData.get("creneau"),
    personnes: formData.get("personnes"),
    commentaire: formData.get("commentaire") ?? undefined, // get() renvoie null si absent
  });
  if (!resultat.success) {
    return { ok: false, erreurs: z.flattenError(resultat.error).fieldErrors };
  }
  await reserverCreneau(resultat.data); // ici, data est typé ET sûr
  return { ok: true };
}
```

Côté client, `useActionState(reserverAction, { ok: false })` donne accès à `etat.erreurs.email` pour afficher l'erreur sous le bon champ.

Valider la configuration **au démarrage**, pour que l'application refuse de démarrer plutôt que de planter à la première requête :

```ts
// src/config.ts
import "server-only";
import * as z from "zod";

const Env = z.object({
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
});

const resultat = Env.safeParse(process.env);
if (!resultat.success) {
  console.error("Configuration invalide :\n" + z.prettifyError(resultat.error));
  throw new Error("Configuration invalide");
}
export const config = resultat.data;
```

`z.prettifyError` affiche un message lisible (un `✖` par problème, avec le chemin du champ). Le message contient les noms des variables, jamais leurs valeurs, mais vérifie-le avant de journaliser des erreurs de validation sur des données sensibles.

## À toi de jouer

1. Dans un dossier vide (`npm init -y && npm pkg set type=module && npm i zod`), crée `schema.ts` avec `ReservationEntree` et exécute-le avec `node schema.ts` (Node 22.18+). Essaie au moins 6 entrées piégées : nombre en chaîne, `personnes: 2.5`, email avec espaces, date sans fuseau (`2026-10-14T10:00:00`), champ en trop, commentaire de 501 caractères. Prédis le résultat **avant** d'exécuter.
2. Ajoute une règle qui dépend de deux champs : `personnes > 4` exige un `commentaire`. Cherche dans la documentation Zod la méthode adaptée (`.refine` ou `.check`) et fais en sorte que l'erreur soit rattachée au champ `commentaire`.
3. Reprends une de tes routes d'API ou Server Actions existantes. Liste ses entrées, écris le schéma, et remplace tout `as MonType` appliqué à des données externes par un `safeParse`.
4. Valide les variables d'environnement d'un de tes projets avec le modèle `config.ts`. Supprime une variable dans `.env.local` et vérifie que l'application refuse de démarrer avec un message clair.

## Pièges courants

- **`as MonType` sur une donnée externe** : c'est un mensonge au compilateur, pas une vérification. `const body = (await req.json()) as Reservation` ne vérifie rien.
- **Valider côté client seulement** : la validation du navigateur est du confort pour l'utilisateur. Un attaquant envoie sa requête directement (voir la leçon `nextjs-frontiere-serveur-client`). La validation qui protège est côté serveur.
- **Passer l'objet entier à l'ORM** (`update({ data: body })`) : c'est l'**assignation de masse**. Un objet strict ou une sélection explicite des champs (liste blanche) l'empêche.
- **`z.object` laisse passer les clés inconnues en les retirant silencieusement** : c'est sûr pour l'assignation de masse, mais tu ne vois pas qu'un client envoie des champs inattendus. `z.strictObject` les refuse explicitement.
- **Confondre validation et échappement** : un texte valide peut contenir `'; DROP TABLE` ou `<script>`. La validation réduit la surface d'attaque, mais les **requêtes paramétrées** contre l'injection SQL et l'échappement à l'affichage contre le XSS restent obligatoires.
- **`Object.fromEntries(formData)` dans une Server Action** : la documentation Next.js prévient que l'objet contient des propriétés supplémentaires préfixées par `$ACTION_`. Avec `z.strictObject`, la validation échoue sur ces clés. Lis les champs un par un avec `formData.get()`.
- **`formData.get()` renvoie `null` pour un champ absent**, pas `undefined` : `.optional()` refuse `null`. Convertis (`?? undefined`) ou utilise `.nullish()`.
- **`z.coerce.number()` sur une chaîne vide** : `Number("")` vaut `0`. Un champ laissé vide devient 0, puis échoue sur `min(1)`. Le message d'erreur est alors déroutant pour l'utilisateur : prévois le cas.
- **Dupliquer les types** : si tu écris l'interface à la main ET le schéma, ils divergeront. Dérive le type avec `z.infer`.

## Vérifie-toi

1. Cite quatre frontières d'une application Next.js où des données non fiables entrent, autres que le corps d'une requête POST.
2. Quelle est la différence entre `parse` et `safeParse`, et lequel utiliser dans une Server Action qui alimente un formulaire ?
3. Une donnée validée par Zod peut-elle être concaténée sans risque dans une requête SQL ? Justifie, puis indique quelle protection reste indispensable (pense aux requêtes paramétrées de la couche d'accès aux données dans la leçon `nextjs-frontiere-serveur-client`, et à ce qu'elles changent pour PostgreSQL vu dans `sql-explain-index`).
