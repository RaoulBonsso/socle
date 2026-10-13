---json
{"titre":"L'export du plus gros client tombe en timeout : pagination OFFSET et index","date":"2026-10-17","piste":"data","difficulte":3,"duree":75,"contexte":"Un éditeur de logiciel de support client (SaaS multi-tenant, 300 clients, PostgreSQL 17) expose une API de tickets paginée. Son plus gros client, un réseau d'agences immobilières, représente 40 % des lignes.","competences":["Lire un plan EXPLAIN (ANALYZE, BUFFERS) et repérer un tri sur disque","Comprendre pourquoi OFFSET coûte plus cher à chaque page","Concevoir un index composite adapté à un filtre et un tri","Mettre en place une pagination par curseur (keyset) avec comparaison de lignes"],"livrable":"Ce qu'il faut soumettre : 1) ton analyse des deux plans fournis, 2) l'explication de la croissance du temps d'export, 3) l'index et la requête corrigés avec leur plan, 4) le nouveau contrat de l'API (paramètres de pagination), 5) une estimation du gain sur un export complet.","indices":["Regarde la ligne « rows » du nœud Sort dans les deux plans : combien de lignes sont triées pour en renvoyer 50 ?","Un OFFSET de 100 000 oblige le serveur à produire puis jeter 100 000 lignes. Un index ne change rien à cela : il change seulement la manière de les produire.","Mémorise la dernière ligne renvoyée (cree_le, id) et demande « les 50 suivantes » avec WHERE (cree_le, id) < ($1, $2), en triant sur exactement les mêmes colonnes que l'index."],"criteres":["L'analyse cite le Sort Method: external merge et le nombre de lignes triées pour 50 renvoyées","L'explication montre que le coût d'une page croît avec son numéro et que l'export complet est quadratique","L'index composite suit l'ordre égalités puis tri et inclut id pour un ordre total","La requête keyset utilise une comparaison de lignes (cree_le, id) < (…, …) et le plan obtenu est un Index Scan sans Sort","Le contrat d'API remplace page/offset par un curseur opaque et précise le comportement en cas d'insertion concurrente","Le défi a été reproduit localement et les temps mesurés sont rapportés"],"lecons":["sql-explain-index","sql-cte-fonctions-fenetre"],"sources":[{"titre":"PostgreSQL — LIMIT and OFFSET","url":"https://www.postgresql.org/docs/current/queries-limit.html"},{"titre":"PostgreSQL — Row and Array Comparisons (comparaison de lignes)","url":"https://www.postgresql.org/docs/current/functions-comparisons.html"},{"titre":"PostgreSQL — Using EXPLAIN","url":"https://www.postgresql.org/docs/current/using-explain.html"},{"titre":"PostgreSQL — Indexes and ORDER BY","url":"https://www.postgresql.org/docs/current/indexes-ordering.html"}]}
---
## La situation

Vendredi, 17 h 30. Le responsable du support de l'éditeur t'écrit : « Notre plus gros client lance chaque vendredi un export complet de ses tickets ouverts via l'API, pour ses tableaux de bord. Depuis trois semaines, l'export échoue après 45 minutes avec des 504. Et pendant ce temps, toute l'application rame pour les autres clients. Il menace de ne pas renouveler son contrat. »

L'équipe a déjà ajouté un index la semaine dernière, sans amélioration. Un développeur propose de « passer sur un plus gros serveur de base ».

## Ce que tu as sous la main

L'endpoint `GET /api/tickets?statut=ouvert&page=N` (50 tickets par page) exécute :

```sql
SELECT id, sujet, statut, cree_le
FROM tickets
WHERE tenant_id = $1 AND statut = $2
ORDER BY cree_le DESC
OFFSET ($3 - 1) * 50 LIMIT 50;
```

Le script d'export du client appelle `page=1`, `page=2`, … jusqu'à obtenir une page vide.

Pour reproduire (copie réduite : 2 millions de lignes au lieu de 40) :

```sql
CREATE TABLE tickets (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  int         NOT NULL,
  statut     text        NOT NULL,
  sujet      text        NOT NULL,
  cree_le    timestamptz NOT NULL
);
CREATE INDEX idx_tickets_tenant ON tickets (tenant_id);

INSERT INTO tickets (tenant_id, statut, sujet, cree_le)
SELECT CASE WHEN random() < 0.4 THEN 42 ELSE floor(random() * 300)::int + 1 END,
       CASE WHEN random() < 0.15 THEN 'ouvert' ELSE 'ferme' END,
       'Sujet ' || g,
       timestamptz '2024-01-01' + random() * interval '1000 days'
FROM generate_series(1, 2000000) AS g;
ANALYZE tickets;
```

Plan de la page 2 001 (OFFSET 100 000) pour le tenant 42, **avant** l'index de la semaine dernière :

```text
Limit  (actual time=76.841..84.163 rows=50 loops=1)
  Buffers: shared hit=11412 read=5540 written=96, temp read=276 written=298
  ->  Gather Merge  (actual time=62.574..81.523 rows=100050 loops=1)
        Workers Launched: 2
        ->  Sort  (actual time=51.757..54.781 rows=33936 loops=3)
              Sort Key: cree_le DESC
              Sort Method: external merge  Disk: 2376kB
              ->  Parallel Seq Scan on tickets  (actual time=0.048..41.690 rows=40050 loops=3)
                    Filter: ((tenant_id = 42) AND (statut = 'ouvert'::text))
                    Rows Removed by Filter: 626616
Execution Time: 84.813 ms
```

L'index ajouté la semaine dernière :

```sql
CREATE INDEX idx_tickets_tenant_statut_date ON tickets (tenant_id, statut, cree_le DESC, id DESC);
```

Plan de la même page **après** cet index (requête triée par `cree_le DESC, id DESC`) :

```text
Limit  (actual time=140.874..140.881 rows=50 loops=1)
  Buffers: shared hit=3845 read=13710 written=9845, temp read=736 written=738
  ->  Sort  (actual time=131.535..138.331 rows=100050 loops=1)
        Sort Key: cree_le DESC, id DESC
        Sort Method: external merge  Disk: 5888kB
        ->  Bitmap Heap Scan on tickets  (actual time=10.545..100.590 rows=120151 loops=1)
              Recheck Cond: ((tenant_id = 42) AND (statut = 'ouvert'::text))
              ->  Bitmap Index Scan on idx_tickets_tenant_statut_date
                    Index Cond: ((tenant_id = 42) AND (statut = 'ouvert'::text))
Execution Time: 141.681 ms
```

En production, le tenant 42 a environ 2,4 millions de tickets ouverts, soit 48 000 pages.

## Ta mission

1. Analyse les deux plans. Que fait réellement PostgreSQL pour renvoyer 50 lignes ? Pourquoi l'index n'a-t-il rien amélioré ici, voire empiré les choses ?
2. Explique pourquoi le temps de l'export complet explose avec la croissance des données, au-delà de la lenteur d'une page isolée. Un plus gros serveur réglerait-il le problème ?
3. Propose la requête corrigée et prouve son efficacité avec `EXPLAIN (ANALYZE, BUFFERS)` sur ta copie locale.
4. Définis le nouveau contrat de l'API : quels paramètres, que renvoie-t-on, que se passe-t-il si un ticket est créé pendant l'export ?
5. Estime le gain sur l'export complet.

===CORRECTION===
## Diagnostic

Plan 1 : un **Seq Scan** parallèle lit toute la table (plus de 600 000 lignes jetées par process), puis **trie** les lignes du tenant, en partie **sur disque** (`external merge`, `temp written`), pour garder les 100 050 premières et en renvoyer 50.

Plan 2 : l'index sert au filtre (`Bitmap Index Scan`), mais PostgreSQL ramène alors les 120 151 tickets ouverts du tenant, les **trie entièrement** (`Sort rows=100050`, sur disque) puis en jette 100 000. Le planificateur estime que lire 120 000 lignes dans l'ordre de l'index, une par une, coûterait plus cher qu'un accès bitmap suivi d'un tri. C'est raisonnable quand on doit de toute façon **produire** 100 050 lignes. Le vrai problème, c'est donc l'`OFFSET`, pas l'index. La documentation PostgreSQL le dit explicitement : les lignes sautées par un `OFFSET` doivent quand même être calculées par le serveur, donc un grand `OFFSET` peut être inefficace.

Pourquoi l'export explose : la page *k* coûte environ *k × 50* lignes à produire. L'export complet de *N* pages coûte donc 50 × (1 + 2 + … + N) ≈ 25 × N² lignes. Avec 48 000 pages, cela fait des dizaines de milliards de lignes produites puis jetées. Quand le volume double, l'export coûte **quatre fois** plus. Un serveur deux fois plus puissant ne fait que repousser l'échéance de quelques mois, et chaque export dégrade la base pour tous les clients (CPU, disque temporaire, cache).

## Solution

**Pagination par curseur (keyset)** : au lieu de « saute 100 000 lignes », on demande « les 50 lignes qui viennent **après** la dernière que j'ai reçue ». L'index `(tenant_id, statut, cree_le DESC, id DESC)` est alors parfaitement adapté : PostgreSQL se positionne directement dans l'index et lit 50 entrées.

```sql
-- Première page
SELECT id, sujet, statut, cree_le
FROM tickets
WHERE tenant_id = $1 AND statut = $2
ORDER BY cree_le DESC, id DESC
LIMIT 50;

-- Pages suivantes : ($3, $4) = (cree_le, id) de la dernière ligne reçue
SELECT id, sujet, statut, cree_le
FROM tickets
WHERE tenant_id = $1 AND statut = $2
  AND (cree_le, id) < ($3, $4)
ORDER BY cree_le DESC, id DESC
LIMIT 50;
```

Pour tester dans `psql` sur la copie locale :

```sql
SELECT cree_le, id FROM tickets
WHERE tenant_id = 42 AND statut = 'ouvert'
ORDER BY cree_le DESC, id DESC
OFFSET 99999 LIMIT 1 \gset

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sujet, statut, cree_le
FROM tickets
WHERE tenant_id = 42 AND statut = 'ouvert'
  AND (cree_le, id) < (:'cree_le', :id)
ORDER BY cree_le DESC, id DESC
LIMIT 50;
```

```text
Limit  (actual time=0.022..0.062 rows=50 loops=1)
  Buffers: shared hit=49 read=5
  ->  Index Scan using idx_tickets_tenant_statut_date on tickets
        Index Cond: ((tenant_id = 42) AND (statut = 'ouvert'::text)
                     AND (ROW(cree_le, id) < ROW('2024-06-14 08:27:33.782059+00'::timestamp with time zone, 985380)))
Execution Time: 0.091 ms
```

Plus de tri, environ 54 pages lues au lieu de 17 000 : environ 1 500 fois plus rapide sur cette page, et surtout un **coût constant** quelle que soit la profondeur.

Points clés :

- `id` dans le tri garantit un **ordre total** : deux tickets créés à la même microseconde ne seront ni dupliqués ni sautés entre deux pages.
- La comparaison de lignes `(cree_le, id) < (x, y)` signifie « `cree_le < x`, ou `cree_le = x` et `id < y` ». Le sens doit correspondre à l'ordre du tri, ici décroissant sur les deux colonnes, comme l'index.

**Contrat d'API** :

```text
GET /api/tickets?statut=ouvert&limite=50
GET /api/tickets?statut=ouvert&limite=50&apres=<curseur>

200 { "donnees": [ … ], "suivant": "<curseur>" | null }
```

Le curseur est **opaque** pour le client : par exemple `(cree_le, id)` encodé en base64url, idéalement signé (HMAC) pour qu'il ne puisse pas être fabriqué. Le serveur le valide (Zod) avant usage. `suivant: null` signale la fin.

Insertion concurrente : un ticket créé pendant l'export a une date plus récente que le curseur, il n'apparaîtra pas dans un export qui descend vers le passé. C'est le comportement attendu pour un export « instantané ». Avec `OFFSET`, au contraire, chaque insertion décalait toutes les pages suivantes, ce qui produisait doublons et trous.

**Gain estimé** : environ 48 000 requêtes à coût constant (moins d'une milliseconde côté base) au lieu d'un coût cumulé quadratique. L'export passe de « ne termine jamais » à quelques minutes, dominées par le réseau et la sérialisation JSON.

## Pourquoi ça arrive en vrai

- `OFFSET` est la pagination enseignée partout et proposée par défaut par les ORM et les composants de tableau. Elle fonctionne parfaitement… tant que les tables sont petites.
- Les tests se font sur des jeux de données minuscules, et sur la première page.
- Les clients multi-tenant ne grossissent pas uniformément : un seul gros client suffit à faire basculer un plan.
- On ajoute un index « parce que c'est lent » sans lire le plan : ici, il ne pouvait rien changer seul.

## Ce qu'un senior ferait en plus

- Proposer au client un **export asynchrone** (job qui produit un fichier CSV ou Parquet et envoie un lien) plutôt qu'un export par l'API paginée.
- Fixer une **limite maximale** à `limite` et un `statement_timeout` sur le rôle de l'API, pour qu'une requête pathologique ne puisse pas monopoliser la base.
- Surveiller les requêtes lentes avec l'extension `pg_stat_statements` pour détecter la dérive **avant** l'appel du client.
- Garder `OFFSET` pour l'interface humaine (« page 3 sur 12 » sur de petits résultats), et le keyset pour les parcours profonds et les API.
- Vérifier l'**utilité** de l'index ajouté (`pg_stat_user_indexes.idx_scan`) et supprimer ceux qui ne servent à rien.
