---json
{"titre":"Lire un EXPLAIN ANALYZE et poser le bon index","piste":"data","module":"sql-modelisation","niveau":2,"duree":20,"prerequis":["sql-cte-fonctions-fenetre"],"objectifs":["Lire un plan d'exécution PostgreSQL : nœuds, coûts estimés, temps réels, buffers","Distinguer Seq Scan, Index Scan et Bitmap Heap Scan et savoir quand chacun est normal","Concevoir un index composite dans le bon ordre de colonnes, ou un index partiel","Repérer les requêtes qui rendent un index inutilisable"],"sources":[{"titre":"PostgreSQL — Using EXPLAIN","url":"https://www.postgresql.org/docs/current/using-explain.html"},{"titre":"PostgreSQL — Multicolumn Indexes","url":"https://www.postgresql.org/docs/current/indexes-multicolumn.html"},{"titre":"PostgreSQL — Partial Indexes","url":"https://www.postgresql.org/docs/current/indexes-partial.html"},{"titre":"PostgreSQL — CREATE INDEX (dont CONCURRENTLY)","url":"https://www.postgresql.org/docs/current/sql-createindex.html"},{"titre":"PostgreSQL — Indexes on Expressions","url":"https://www.postgresql.org/docs/current/indexes-expressional.html"}],"liens":["sql-cte-fonctions-fenetre","reseau-diagnostic-ports-dns"]}
---
## Pourquoi c'est important

Une start-up d'analytics produit t'appelle : « La page "Activité récente" d'un utilisateur mettait 50 ms au lancement. Un an plus tard, avec un million d'événements, elle met 3 secondes, et sous charge, l'API tombe en timeout. On a doublé la taille du serveur, ça n'a rien changé. »

Ce scénario est le plus fréquent de toute la vie d'une application : **la requête n'a pas changé, les données ont grossi**. Doubler la machine coûte de l'argent et ne règle rien. Ce qui règle le problème, c'est lire le **plan d'exécution** et poser *un* index bien pensé. Tu passeras souvent de secondes à fractions de milliseconde. En entretien Data comme Full stack, « comment tu diagnostiques une requête lente ? » est une question quasi systématique.

## Le concept

Quand tu envoies une requête, le **planificateur** de PostgreSQL choisit *comment* la résoudre (quel accès aux tables, quel ordre de jointure) en estimant un coût à partir de statistiques sur les données. `EXPLAIN` montre ce plan. `EXPLAIN ANALYZE` **exécute** la requête et ajoute les temps et volumes réels.

Analogie : chercher toutes les occurrences de « Nantes » dans un livre de 800 pages.

- **Seq Scan** : tu lis le livre de la première à la dernière page. Parfait si tu cherches un mot présent sur une page sur deux, désastreux pour un mot rare.
- **Index Scan** : tu vas à l'index alphabétique en fin de livre, qui te donne les numéros de pages, et tu n'ouvres que celles-là.
- **Bitmap Heap Scan** : tu relèves d'abord *tous* les numéros de pages dans l'index, tu les tries, puis tu ouvres les pages dans l'ordre. Bon compromis quand il y a « pas mal » de résultats.

Un index B-tree est trié. Un index sur `(user_id, cree_le)` est trié par `user_id`, puis par `cree_le` à l'intérieur de chaque `user_id`, comme un annuaire trié par nom puis prénom. D'où la règle : **colonnes filtrées par égalité d'abord, puis la colonne de tri ou de plage**.

Ce qu'il faut lire dans un plan :

- `cost=0.42..44.24` : coût estimé (unités arbitraires) de démarrage, puis total. À comparer entre plans, pas à convertir en millisecondes.
- `rows=10` (estimé) vs `actual … rows=7` (réel) : un gros écart signale des statistiques périmées → `ANALYZE nom_table`.
- `loops=3` : le nœud a tourné 3 fois. Les temps affichés sont **par boucle**.
- `Rows Removed by Filter` : lignes lues pour rien. Un gros chiffre ici est le symptôme typique d'un index manquant.
- `Buffers: shared hit=7156` (avec l'option `BUFFERS`) : pages lues en mémoire (`hit`) ou sur disque (`read`). C'est la mesure la plus honnête du travail effectué.

## Exemple

```bash
docker run --rm -d --name pg-socle -e POSTGRES_PASSWORD=dev postgres:17
docker exec -it pg-socle psql -U postgres
```

Un million d'événements :

```sql
CREATE TABLE evenements (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  int         NOT NULL,
  type     text        NOT NULL,
  cree_le  timestamptz NOT NULL
);

INSERT INTO evenements (user_id, type, cree_le)
SELECT floor(random() * 100000)::int + 1,
       (ARRAY['vue','clic','achat'])[floor(random() * 3)::int + 1],
       timestamptz '2026-01-01' + random() * interval '270 days'
FROM generate_series(1, 1000000);

ANALYZE evenements;
```

La requête de la page « Activité récente » :

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM evenements
WHERE user_id = 4242
ORDER BY cree_le DESC
LIMIT 10;
```

Plan obtenu (extrait, tes chiffres varieront) :

```text
Limit  (actual time=18.651..22.613 rows=7 loops=1)
  ->  Gather Merge
        Workers Planned: 2
        ->  Sort  Sort Key: cree_le DESC
              ->  Parallel Seq Scan on evenements  (actual time=6.783..15.822 rows=2 loops=3)
                    Filter: (user_id = 4242)
                    Rows Removed by Filter: 333331
                    Buffers: shared hit=7042
Execution Time: 22.627 ms
```

Lecture : trois process (le principal + 2 workers) lisent **toute** la table, jettent environ un million de lignes pour en garder 7, puis trient. 22 ms aujourd'hui, mais ça croît linéairement avec la table, et ça consomme du CPU à chaque appel.

L'index qui colle à la requête : égalité sur `user_id`, puis tri sur `cree_le` décroissant.

```sql
CREATE INDEX idx_evenements_user_date ON evenements (user_id, cree_le DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM evenements WHERE user_id = 4242 ORDER BY cree_le DESC LIMIT 10;
```

```text
Limit  (actual time=0.031..0.045 rows=7 loops=1)
  ->  Index Scan using idx_evenements_user_date on evenements
        Index Cond: (user_id = 4242)
        Buffers: shared hit=7 read=3
Execution Time: 0.053 ms
```

Plus de tri (l'index rend les lignes déjà ordonnées), 10 pages lues au lieu de plus de 7 000 : environ 400 fois plus rapide.

**Index rendu inutilisable par une fonction** :

```sql
CREATE INDEX idx_evenements_date ON evenements (cree_le);

-- Seq Scan : la fonction appliquée à la colonne empêche d'utiliser l'index
EXPLAIN SELECT count(*) FROM evenements
WHERE date(cree_le AT TIME ZONE 'UTC') = '2026-03-01';

-- Bitmap Index Scan : même résultat, écrit comme une plage sur la colonne brute
EXPLAIN SELECT count(*) FROM evenements
WHERE cree_le >= '2026-03-01' AND cree_le < '2026-03-02';
```

**Index partiel** : si l'écran « achats de la semaine » ne concerne qu'un tiers des lignes, indexe seulement celles-là.

```sql
CREATE INDEX idx_achats_date ON evenements (cree_le) WHERE type = 'achat';
```

En production, sur une table utilisée, crée les index **sans bloquer les écritures** :

```sql
CREATE INDEX CONCURRENTLY idx_evenements_user_date ON evenements (user_id, cree_le DESC);
```

Vérifier qu'un index sert vraiment (compteur cumulé depuis la dernière remise à zéro des statistiques) :

```sql
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS taille
FROM pg_stat_user_indexes
WHERE relname = 'evenements';
```

## À toi de jouer

1. Reproduis l'exemple et note les `Buffers` avant et après l'index.
2. Crée l'index dans le **mauvais** ordre : `(cree_le, user_id)`. Relance la requête. Quel plan obtiens-tu, et pourquoi est-il moins bon ? Supprime-le ensuite (`DROP INDEX`).
3. Écris la requête « nombre d'achats par jour sur les 7 derniers jours du jeu de données » et fais-la utiliser l'index partiel. Prouve-le avec `EXPLAIN`.
4. Requête piège : `SELECT count(*) FROM evenements WHERE type = 'vue';` Crée un index sur `type`. PostgreSQL l'utilise-t-il ? Explique pourquoi un Seq Scan est ici le **bon** choix.
5. Sur un de tes vrais projets (PostgreSQL, Supabase…), active `\timing` dans `psql`, prends la requête la plus fréquente de ton application et lis son plan.

## Pièges courants

- **`EXPLAIN ANALYZE` exécute vraiment la requête** : sur un `DELETE` ou un `UPDATE`, entoure-le de `BEGIN; … ROLLBACK;`.
- **Indexer chaque colonne « au cas où »** : chaque index ralentit les `INSERT`/`UPDATE` et occupe de l'espace disque et du cache (l'index composite de l'exemple fait environ 30 Mo). Un index qui n'est jamais utilisé (`idx_scan = 0` depuis longtemps) est à supprimer.
- **Ordre des colonnes d'un index composite** : un index `(a, b)` sert pour `WHERE a = …` et `WHERE a = … AND b = …`, beaucoup moins pour `WHERE b = …` seul.
- **Fonctions ou casts sur la colonne indexée** (`lower(email)`, `date(cree_le)`, `id::text`) : l'index n'est pas utilisé. Réécris la condition, ou crée un index sur l'expression : `CREATE INDEX ON users (lower(email));`.
- **Faible sélectivité** : un index sur une colonne à 3 valeurs n'aide presque jamais. Le planificateur préfère lire la table entière, et il a raison.
- **Statistiques périmées après un gros import** : estimations fausses, mauvais plan. Lance `ANALYZE` (l'autovacuum finit par le faire, mais pas forcément avant ta prochaine requête).
- **Tester sur 100 lignes** : sur une petite table, PostgreSQL choisit un Seq Scan parce que c'est réellement moins cher. Teste toujours avec un volume réaliste.

## Vérifie-toi

1. Dans un plan, tu vois `rows=5` estimé et `actual rows=48000`. Quel est le problème probable, et quelle commande lances-tu d'abord ?
2. La requête est `WHERE tenant_id = $1 AND statut = 'ouvert' ORDER BY cree_le DESC LIMIT 20`. Propose un index et justifie l'ordre des colonnes.
3. Pourquoi faut-il `CREATE INDEX CONCURRENTLY` en production, et qu'est-ce que ça coûte en échange ? Relie-le au temps de réponse mesuré avec `curl -w` dans la leçon `reseau-diagnostic-ports-dns` : que verrait un utilisateur pendant un `CREATE INDEX` classique sur une table très sollicitée ?
