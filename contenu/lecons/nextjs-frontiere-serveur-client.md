---json
{"titre":"Next.js : la frontière serveur/client, là où fuient les données","piste":"fullstack","module":"architecture-patterns","niveau":2,"duree":20,"prerequis":["architecture-hexagonale-ts"],"objectifs":["Savoir dans quel environnement s'exécute chaque fichier d'une application App Router","Placer \"use client\" au plus bas de l'arbre et passer des Server Components en children","Empêcher qu'un module serveur ou un secret finisse dans le bundle client (server-only, NEXT_PUBLIC_)","Traiter chaque Server Action comme un endpoint public : authentifier, autoriser, filtrer le retour"],"sources":[{"titre":"Next.js — Server and Client Components","url":"https://nextjs.org/docs/app/getting-started/server-and-client-components"},{"titre":"Next.js — How to think about data security","url":"https://nextjs.org/docs/app/guides/data-security"},{"titre":"Next.js — Environment Variables","url":"https://nextjs.org/docs/app/guides/environment-variables"},{"titre":"React — 'use client'","url":"https://react.dev/reference/rsc/use-client"},{"titre":"React — 'use server'","url":"https://react.dev/reference/rsc/use-server"}],"liens":["architecture-hexagonale-ts","validation-aux-frontieres-zod","reseau-diagnostic-ports-dns"]}
---
## Pourquoi c'est important

Audit de sécurité chez un client SaaS RH. En ouvrant les DevTools sur la page « Mon équipe », l'auditeur trouve dans la réponse RSC le **numéro de téléphone, le salaire et le hash de mot de passe** de chaque collègue. Aucun bug apparent : la page n'affiche que les noms et les photos. Mais un Server Component faisait `SELECT * FROM users` et passait les objets entiers à un composant client `<CarteMembre user={user} />`. Tout ce qu'on passe en props à un Client Component est **sérialisé et envoyé au navigateur**, affiché ou non.

Deuxième trouvaille du même audit : une Server Action `supprimerMembre(id)`, appelée depuis une page réservée aux admins. La page vérifiait le rôle ; l'action, non. Or une Server Action est **appelable par une requête POST directe**, sans passer par la page.

Avec l'App Router, la frontière entre serveur et navigateur est devenue invisible dans le code : un même dossier mélange les deux. C'est puissant, et c'est là que se logent les fuites de données les plus fréquentes des applications Next.js modernes.

## Le concept

Analogie : un **restaurant avec une cuisine et une salle**.

- La **cuisine** (Server Components, Server Actions, Route Handlers) a accès au frigo (la base), à la caisse (les secrets) et aux fournisseurs (les API privées). Le client ne la voit jamais.
- La **salle** (Client Components) est ce que le client voit et touche : le bouton, le formulaire, l'animation.
- Le **passe-plat**, ce sont les **props** passées d'un Server Component à un Client Component, et les **valeurs de retour** des Server Actions. Tout ce qui passe par là sort de la cuisine. On ne pose pas le frigo entier sur le passe-plat pour servir une assiette.
- Le **bon de commande** (Server Action) est rempli par le client. N'importe qui peut en glisser un faux par la fenêtre : la cuisine vérifie chaque bon.

Les règles de Next.js :

- Par défaut, `layout` et `page` sont des **Server Components**.
- `"use client"` en haut d'un fichier déclare une **frontière** : ce fichier, **tous ses imports** et les composants qu'il rend directement partent dans le bundle client.
- Un Server Component passé en `children` (ou en prop) à un Client Component reste rendu côté serveur : seul son résultat est transmis.
- Les props vers un Client Component doivent être **sérialisables** par React (pas de fonctions ni d'instances de classe, à l'exception des Server Actions).
- Seules les variables d'environnement préfixées `NEXT_PUBLIC_` sont incluses dans le bundle client, et elles y sont **inscrites en dur au build**.
- `import 'server-only'` en tête d'un module provoque une **erreur de build** s'il est importé côté client.

## Exemple

Une **couche d'accès aux données** (DAL), le modèle recommandé par la documentation Next.js pour un nouveau projet. Elle tourne uniquement sur le serveur, fait les contrôles d'autorisation et renvoie des objets minimaux (DTO) :

```ts
// src/data/membres.ts
import "server-only";
import { obtenirSession } from "./session"; // lit et vérifie le cookie de session
import { sql } from "./db";                  // client SQL avec requêtes paramétrées

export type MembreDTO = { id: string; nom: string; photoUrl: string | null };

export async function listerMembresEquipe(): Promise<MembreDTO[]> {
  const session = await obtenirSession();
  if (!session) throw new Error("Non authentifié");

  const lignes = await sql`
    SELECT id, nom, photo_url
    FROM users
    WHERE equipe_id = ${session.equipeId}
  `;
  // On ne renvoie QUE ce que l'écran affiche.
  return lignes.map((l) => ({ id: l.id, nom: l.nom, photoUrl: l.photo_url }));
}
```

La page (Server Component) et un composant client minimal :

```tsx
// app/equipe/page.tsx — Server Component (aucune directive)
import { listerMembresEquipe } from "@/data/membres";
import CarteMembre from "./carte-membre";

export default async function PageEquipe() {
  const membres = await listerMembresEquipe();
  return (
    <ul>
      {membres.map((m) => (
        <CarteMembre key={m.id} nom={m.nom} photoUrl={m.photoUrl} />
      ))}
    </ul>
  );
}
```

```tsx
// app/equipe/carte-membre.tsx
"use client";
import { useState } from "react";

export default function CarteMembre({ nom, photoUrl }: { nom: string; photoUrl: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <li onClick={() => setOuvert(!ouvert)}>
      {photoUrl && <img src={photoUrl} alt="" width={40} height={40} />}
      {nom} {ouvert && "▾"}
    </li>
  );
}
```

La signature `{ nom, photoUrl }` est volontairement étroite : le composant **ne peut pas** recevoir le salaire, même par erreur.

Une Server Action qui ne fait pas confiance à la page qui l'appelle :

```ts
// app/equipe/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { supprimerMembre } from "@/data/membres-admin"; // module "server-only"

export async function supprimerMembreAction(membreId: string) {
  // Authentification + autorisation (rôle admin ET même équipe) faites DANS la DAL.
  await supprimerMembre(membreId);
  revalidatePath("/equipe");
  return { ok: true }; // pas l'enregistrement supprimé
}
```

```ts
// src/data/membres-admin.ts
import "server-only";
import { obtenirSession } from "./session";
import { sql } from "./db";

export async function supprimerMembre(membreId: string) {
  const session = await obtenirSession();
  if (!session || session.role !== "admin") throw new Error("Interdit");

  const resultat = await sql`
    DELETE FROM users WHERE id = ${membreId} AND equipe_id = ${session.equipeId}
  `;
  if (resultat.count === 0) throw new Error("Introuvable"); // autre équipe = même réponse
}
```

Le `AND equipe_id = …` empêche un admin de l'équipe A de supprimer un membre de l'équipe B en devinant son identifiant (vulnérabilité IDOR).

Vérifier ce qui part réellement au navigateur, après `next build` puis `next start` :

```bash
curl -s http://localhost:3000/equipe | grep -o 'salaire' | head -1    # ne doit rien afficher
grep -rl "SECRET_" .next/static/ || echo "aucun secret dans le bundle client"
```

## À toi de jouer

Dans un projet Next.js existant (ou un `npx create-next-app@latest` neuf) :

1. Fais l'inventaire : `grep -rl '"use client"\|'"'"'use client'"'"'' app src`. Pour chaque fichier, la directive est-elle placée le plus bas possible ? Repère un layout ou une page entière passée en client sans raison.
2. Crée volontairement la fuite : un Server Component passe un objet avec un champ `secret: "ne-doit-pas-sortir"` à un Client Component qui n'affiche que `nom`. Ouvre l'onglet Réseau des DevTools ou affiche la source de la page et retrouve la chaîne. Corrige avec un DTO.
3. Ajoute `import "server-only"` dans ton module d'accès aux données, puis importe-le depuis un fichier `"use client"`. Lis l'erreur de build et note-la.
4. Prends une de tes Server Actions et liste ce qu'un attaquant peut envoyer directement en POST. Ajoute le contrôle d'autorisation manquant, puis la validation des arguments (leçon `validation-aux-frontieres-zod`).

## Pièges courants

- **`"use client"` dans le layout racine** « parce qu'un provider en a besoin » : tout l'arbre importé devient client. Crée un composant `Providers` client qui prend `children`, et garde le layout en Server Component.
- **Passer des objets ORM ou des lignes SQL entières en props** : tout est sérialisé. Utilise des DTO avec seulement les champs affichés.
- **Contrôler l'accès dans la page seulement** : la vérification de la page ne protège pas les Server Actions qu'elle contient. Chaque action ré-authentifie et ré-autorise.
- **Préfixer un secret par `NEXT_PUBLIC_`** pour « que ça marche côté client » : il est alors en clair dans le JavaScript public. Si le client a besoin d'un service à clé secrète, passe par une Server Action ou un Route Handler.
- **Croire qu'une variable sans `NEXT_PUBLIC_` « plante » côté client** : la documentation précise qu'elle est remplacée par une chaîne vide. Le bug est silencieux ; `server-only` le transforme en erreur de build.
- **Renvoyer l'enregistrement complet depuis une Server Action** : la valeur de retour est sérialisée vers le client, comme les props.
- **Mutation pendant le rendu** (déconnexion sur un `searchParams`, écriture en base dans une page) : passe par une Server Action en POST.

## Vérifie-toi

1. Un fichier `"use client"` importe `lib/format.ts`. Où s'exécute `format.ts`, et que se passe-t-il si `format.ts` lit `process.env.STRIPE_SECRET_KEY` ?
2. Pourquoi une vérification de rôle dans `page.tsx` ne protège-t-elle pas une Server Action définie dans la même page ? Que faut-il faire ?
3. En reprenant la leçon `architecture-hexagonale-ts` : la DAL et les Server Actions sont-elles des adaptateurs primaires ou secondaires ? Où mettrais-tu la règle « un admin ne gère que sa propre équipe » ?
