---json
{"titre":"Des emails clients dans les résultats de recherche : injection SQL dans une route Next.js","date":"2026-10-15","piste":"fullstack","difficulte":2,"duree":75,"contexte":"Une boutique en ligne de café (un développeur freelance, 3 000 clients) tourne sur Next.js avec PostgreSQL via le paquet pg. La recherche de produits a été codée vite, juste avant les soldes.","competences":["Reconnaître une injection SQL dans du code et dans des logs d'accès","Corriger avec des requêtes paramétrées","Traiter les identifiants SQL (ORDER BY) par liste blanche","Valider les paramètres d'URL avec Zod","Réagir à une fuite de données (RGPD)"],"livrable":"Ce qu'il faut soumettre : 1) l'explication de l'attaque visible dans les logs, 2) la route corrigée, 3) trois requêtes curl qui prouvent la correction, 4) la liste des actions à mener dans les 72 heures.","indices":["Décode les URL des logs (les %27, %20…) : que devient la requête SQL une fois la chaîne insérée dans le template ?","Le paramètre q se corrige avec $1. Pour tri, ça ne suffit pas : PostgreSQL n'accepte pas de paramètre à la place d'un nom de colonne.","Un z.enum des tris autorisés, associé à un objet qui donne le fragment SQL de chaque tri. Et des emails ont fuité : regarde ce que la CNIL demande."],"criteres":["L'attaque UNION et l'exfiltration d'emails sont expliquées à partir des lignes de log","Toute valeur venant de l'utilisateur passe en paramètre ($1), aucune concaténation de q","Le tri est choisi dans une liste blanche fermée et une valeur inconnue renvoie 400","Les caractères % et _ saisis par l'utilisateur sont échappés dans le motif ILIKE","La réponse inclut la limitation des droits du rôle PostgreSQL utilisé par l'application","Le plan de réponse mentionne l'évaluation de la notification à la CNIL sous 72 heures"],"lecons":["validation-aux-frontieres-zod","nextjs-frontiere-serveur-client","sql-explain-index"],"sources":[{"titre":"OWASP — SQL Injection Prevention Cheat Sheet","url":"https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html"},{"titre":"node-postgres — Queries (requêtes paramétrées)","url":"https://node-postgres.com/features/queries"},{"titre":"PostgreSQL — Pattern Matching (LIKE, ESCAPE)","url":"https://www.postgresql.org/docs/current/functions-matching.html"},{"titre":"Next.js — route.js (Route Handlers)","url":"https://nextjs.org/docs/app/api-reference/file-conventions/route"},{"titre":"CNIL — Notifier une violation de données personnelles","url":"https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles"}]}
---
## La situation

Jeudi, 22 h 10. Une cliente écrit au support de la boutique : « En cherchant "moka", j'ai vu apparaître dans les résultats l'adresse email d'une autre personne à la place d'un nom de produit. C'est normal ? » Le freelance qui maintient le site te transfère le message avec un seul mot : « Help. »

Le lendemain commencent les soldes. Le gérant veut savoir si on peut garder le site ouvert, et s'il doit prévenir quelqu'un.

## Ce que tu as sous la main

`app/api/produits/route.ts` :

```ts
import type { NextRequest } from "next/server";
import { pool } from "@/lib/db"; // new pg.Pool({ connectionString: process.env.DATABASE_URL })

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const tri = req.nextUrl.searchParams.get("tri") ?? "nom";

  const { rows } = await pool.query(
    `SELECT id, nom, prix_ht FROM produits WHERE nom ILIKE '%${q}%' ORDER BY ${tri} LIMIT 50`
  );
  return Response.json(rows);
}
```

Extrait du log d'accès Nginx de la nuit :

```text
203.0.113.77 - - [15/Oct/2026:03:12:09 +0200] "GET /api/produits?q=%27 HTTP/1.1" 500 21 "-" "sqlmap/1.8"
203.0.113.77 - - [15/Oct/2026:03:12:41 +0200] "GET /api/produits?q=%27%20UNION%20SELECT%20id%2C%20email%2C%200%20FROM%20utilisateurs%20--%20 HTTP/1.1" 200 48211 "-" "sqlmap/1.8"
203.0.113.77 - - [15/Oct/2026:03:13:02 +0200] "GET /api/produits?tri=(SELECT%20CASE%20WHEN%20substr(password_hash%2C1%2C1)%3D%27%24%27%20THEN%20nom%20ELSE%20prix_ht%3A%3Atext%20END%20FROM%20utilisateurs%20LIMIT%201) HTTP/1.1" 200 3120 "-" "sqlmap/1.8"
```

Le schéma, pour reproduire (`docker run --rm -d --name pg-defi -e POSTGRES_PASSWORD=dev postgres:17`) :

```sql
CREATE TABLE produits (id int PRIMARY KEY, nom text NOT NULL, prix_ht numeric(10,2) NOT NULL);
INSERT INTO produits VALUES
  (1, 'Moka 250g', 9.90), (2, 'Éthiopie 250g', 12.00),
  (3, 'Moulin manuel', 45.00), (4, 'Filtre 100% coton', 6.50);

CREATE TABLE utilisateurs (id int PRIMARY KEY, email text, password_hash text);
INSERT INTO utilisateurs VALUES (1, 'admin@example.com', '$argon2id$v=19$m=65536,t=3,p=4$exemple');
```

L'application se connecte avec l'utilisateur `postgres`, propriétaire de toutes les tables.

## Ta mission

1. Décode les trois lignes de log. Pour chacune, écris la requête SQL réellement exécutée et ce que l'attaquant a appris.
2. Quelles données ont probablement fuité ? Quelles autres attaques le même code rendait-il possibles, vu les droits de l'utilisateur de connexion ?
3. Corrige la route. Attention : la correction de `q` et celle de `tri` ne sont pas de même nature.
4. Écris trois requêtes `curl` qui prouvent la correction : une recherche normale, une tentative d'injection sur `q`, une sur `tri`.
5. Que dois-tu faire dans les 72 heures, techniquement et réglementairement ? Le site peut-il ouvrir pour les soldes ?

===CORRECTION===
## Diagnostic

Décodage :

1. `q='` donne `… ILIKE '%'%' ORDER BY nom …` : erreur de syntaxe, donc **500**. L'attaquant (l'outil `sqlmap`) vient de confirmer que l'entrée est injectée telle quelle.
2. `q=' UNION SELECT id, email, 0 FROM utilisateurs -- ` donne :
   ```sql
   SELECT id, nom, prix_ht FROM produits WHERE nom ILIKE '%' UNION SELECT id, email, 0 FROM utilisateurs -- %' ORDER BY nom LIMIT 50
   ```
   Le `'` ferme la chaîne, `UNION` ajoute les lignes d'une autre table avec le même nombre de colonnes, `--` commente la fin (y compris le `LIMIT`). La réponse de 48 Ko contient **tous les emails** de la table. C'est exactement ce qu'a vu la cliente.
3. `tri=(SELECT CASE WHEN … THEN nom ELSE prix_ht::text END …)` : injection **en aveugle** par l'ordre de tri. Selon que la condition sur le hash est vraie ou fausse, les produits sont triés par nom ou par prix. En répétant la question caractère par caractère, l'attaquant reconstitue les hachés de mots de passe.

Ce qui a probablement fui : emails et hachés de mots de passe de tous les utilisateurs. Avec l'utilisateur `postgres`, le même trou permettait bien pire : lire toutes les tables, modifier des prix, supprimer des données, voire exécuter des commandes sur le serveur via des fonctionnalités réservées au superutilisateur.

## Solution

```ts
// app/api/produits/route.ts
import type { NextRequest } from "next/server";
import * as z from "zod";
import { pool } from "@/lib/db";

// Liste blanche : la clé publique → le fragment SQL écrit par NOUS.
const TRIS = {
  nom: "nom ASC, id",
  "prix-asc": "prix_ht ASC, id",
  "prix-desc": "prix_ht DESC, id",
} as const;

const Recherche = z.object({
  q: z.string().trim().max(100).default(""),
  tri: z.enum(["nom", "prix-asc", "prix-desc"]).default("nom"),
});

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const r = Recherche.safeParse({ q: p.get("q") ?? undefined, tri: p.get("tri") ?? undefined });
  if (!r.success) {
    return Response.json({ erreurs: z.flattenError(r.error).fieldErrors }, { status: 400 });
  }

  // Les caractères spéciaux de LIKE saisis par l'utilisateur sont pris littéralement.
  const motif = "%" + r.data.q.replace(/[\\%_]/g, "\\$&") + "%";

  const { rows } = await pool.query(
    `SELECT id, nom, prix_ht FROM produits WHERE nom ILIKE $1 ORDER BY ${TRIS[r.data.tri]} LIMIT 50`,
    [motif],
  );
  return Response.json(rows);
}
```

Pourquoi deux traitements différents :

- `q` est une **valeur** : elle passe en paramètre `$1`. Le serveur la reçoit séparément du texte SQL, elle ne peut plus en changer la structure.
- `tri` désigne un **identifiant** (une colonne et un sens). La documentation de node-postgres le rappelle : PostgreSQL n'accepte pas de paramètres pour les identifiants. On ne laisse donc l'utilisateur choisir qu'une **clé** parmi une liste fermée, et c'est notre code qui fournit le fragment SQL.

Preuves (en local, avec `next dev`) :

```bash
curl -s 'http://localhost:3000/api/produits?q=moka'
# [{"id":1,"nom":"Moka 250g","prix_ht":"9.90"}]

curl -s --get 'http://localhost:3000/api/produits' \
  --data-urlencode "q=' UNION SELECT id, email, 0 FROM utilisateurs -- "
# []   ← la chaîne est cherchée telle quelle dans les noms de produits

curl -s -o /dev/null -w '%{http_code}\n' --get 'http://localhost:3000/api/produits' \
  --data-urlencode 'tri=(SELECT 1)'
# 400
```

Moindre privilège pour l'application :

```sql
CREATE ROLE boutique_app LOGIN PASSWORD '…';   -- mot de passe dans le gestionnaire de secrets
GRANT SELECT ON produits TO boutique_app;
GRANT SELECT, INSERT, UPDATE ON commandes TO boutique_app;
-- aucun droit sur utilisateurs pour le rôle qui sert la recherche publique
```

**Plan des 72 heures** :

1. Déployer le correctif tout de suite, et vérifier qu'aucune autre requête du code n'utilise de template avec des valeurs externes : `grep -rn "query(" app src`, puis relire chaque appel.
2. Changer le mot de passe de la base, passer l'application sur un rôle à droits limités, et faire tourner les secrets qui étaient accessibles au même utilisateur.
3. Forcer la réinitialisation des mots de passe clients au prochain login. Les hachés argon2id résistent bien, mais ils ont fuité.
4. Conserver les logs (preuves), établir le périmètre exact : quelles requêtes, à quelles heures, quel volume.
5. **RGPD** : des emails et hachés de mots de passe ont fuité, il s'agit d'une violation de données personnelles. Le responsable de traitement (le gérant) doit la documenter en interne et, sauf si elle est peu susceptible d'engendrer un risque pour les personnes, la notifier à la CNIL dans les 72 heures après en avoir pris connaissance. Selon le niveau de risque, il faut aussi informer les clients concernés.

Le site peut ouvrir pour les soldes une fois le correctif déployé et vérifié : le garder fermé n'efface pas la fuite. Décider de notifier n'a rien à voir avec l'ouverture.

## Pourquoi ça arrive en vrai

- Les templates littéraux de JavaScript rendent la concaténation **jolie** : `${q}` dans une chaîne SQL ressemble à une syntaxe de paramètre, mais ce n'est que du collage de texte.
- Le tri et les filtres dynamiques sont l'angle mort classique : même les développeurs qui paramètrent leurs valeurs concatènent les noms de colonnes.
- On utilise le compte `postgres` parce que « ça marche du premier coup ».
- La recherche est publique et non authentifiée : c'est la première chose que testent les scanners automatiques.

## Ce qu'un senior ferait en plus

- Une **règle de lint** ou une revue systématique qui interdit les templates dans `pool.query(...)` hors fragments d'une liste blanche, ou un constructeur de requêtes qui paramètre par défaut.
- Un **index trigramme** (extension `pg_trgm`) pour que `ILIKE '%…%'` reste rapide quand le catalogue grossit. Un `ILIKE` avec `%` en tête ne peut pas utiliser un B-tree classique (voir la leçon `sql-explain-index`).
- Des **erreurs génériques** côté client : la 500 de la première ligne de log a renseigné l'attaquant. On journalise le détail côté serveur seulement.
- De la **limitation de débit** et une détection des user-agents d'outils d'attaque connus (un signal, pas une protection).
- Un test automatisé de non-régression qui envoie les charges de l'incident et vérifie le 400 ou le résultat vide.
