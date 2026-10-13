---json
{"titre":"CTE et fonctions de fenêtre : le rapport mensuel en une seule requête","piste":"data","module":"sql-modelisation","niveau":2,"duree":20,"prerequis":[],"objectifs":["Découper une requête complexe en étapes lisibles avec WITH","Calculer évolutions, cumuls, classements et moyennes mobiles avec OVER (PARTITION BY … ORDER BY …)","Choisir entre row_number, rank et dense_rank","Éviter le piège du cadre (frame) par défaut"],"sources":[{"titre":"PostgreSQL — Tutoriel : Window Functions","url":"https://www.postgresql.org/docs/current/tutorial-window.html"},{"titre":"PostgreSQL — Window Functions (référence)","url":"https://www.postgresql.org/docs/current/functions-window.html"},{"titre":"PostgreSQL — Syntaxe des appels de fonctions de fenêtre","url":"https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS"},{"titre":"PostgreSQL — WITH Queries (Common Table Expressions)","url":"https://www.postgresql.org/docs/current/queries-with.html"}],"liens":["sql-explain-index","modelisation-dimensionnelle"]}
---
## Pourquoi c'est important

Jeudi, la directrice commerciale d'un e-commerçant de café t'envoie un message : « Pour le comité de lundi, il me faut le chiffre d'affaires mensuel, l'évolution en % par rapport au mois précédent, le cumul depuis janvier, et les 3 plus grosses commandes de chaque client. Le stagiaire le fait à la main dans Excel, il y passe une journée et il se trompe. »

Les développeurs qui ne connaissent que `GROUP BY` écrivent ce genre de rapport en rapatriant toutes les lignes dans Node ou Python, avec des boucles. C'est lent, ça plante quand la table grossit, et c'est plein de bugs aux bords (premier mois, égalités). Avec les **CTE** et les **fonctions de fenêtre**, c'est une requête SQL de 15 lignes qui s'exécute là où sont les données. C'est aussi la base de tout le travail de Data Engineer : les modèles dbt, les tableaux de bord et les contrôles de qualité en sont remplis.

## Le concept

**CTE (`WITH`)** : une requête nommée, utilisable comme une table temporaire dans la suite de la requête. Elle sert à découper un calcul en étapes, comme des variables intermédiaires dans du code.

**Fonction de fenêtre** : un calcul qui regarde **les lignes voisines sans les fusionner**. `GROUP BY` écrase 1 000 lignes en 1 ligne. Une fenêtre garde les 1 000 lignes et ajoute à chacune une colonne calculée à partir de ses voisines.

Analogie : un **classement de course**. `GROUP BY`, c'est le podium seul. La fenêtre, c'est la feuille de résultats complète, où chaque coureur garde sa ligne et voit à côté son rang, l'écart avec le coureur précédent et le temps moyen de sa catégorie.

La syntaxe : `fonction() OVER (PARTITION BY groupe ORDER BY tri cadre)`

- `PARTITION BY` : découpe en groupes indépendants (par client, par pays…). Facultatif.
- `ORDER BY` : l'ordre dans le groupe (nécessaire pour `lag`, les cumuls, les rangs).
- **cadre** (`ROWS BETWEEN …`) : quelles lignes autour de la ligne courante entrent dans le calcul.

Les fonctions les plus utiles : `row_number()`, `rank()`, `dense_rank()`, `lag()` / `lead()` (ligne précédente / suivante), `first_value()` / `last_value()`, et **n'importe quel agrégat** (`sum`, `avg`, `count`) suivi de `OVER`.

## Exemple

Lance un PostgreSQL jetable et ouvre `psql` :

```bash
docker run --rm -d --name pg-socle -e POSTGRES_PASSWORD=dev postgres:17
docker exec -it pg-socle psql -U postgres
```

Données de test (5 000 commandes sur 9 mois) :

```sql
CREATE TABLE commandes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id  int           NOT NULL,
  montant    numeric(10,2) NOT NULL,
  cree_le    timestamptz   NOT NULL
);

INSERT INTO commandes (client_id, montant, cree_le)
SELECT floor(random() * 50)::int + 1,
       round((random() * 200 + 5)::numeric, 2),
       timestamptz '2026-01-01' + random() * interval '270 days'
FROM generate_series(1, 5000);
```

**Le rapport de la directrice**, partie 1 : CA mensuel, évolution, cumul.

```sql
WITH ca_mensuel AS (
  SELECT date_trunc('month', cree_le) AS mois,
         sum(montant)                 AS ca
  FROM commandes
  GROUP BY 1
)
SELECT mois::date,
       ca,
       round(100 * (ca - lag(ca) OVER w) / lag(ca) OVER w, 1) AS evolution_pct,
       sum(ca) OVER w                                         AS ca_cumule
FROM ca_mensuel
WINDOW w AS (ORDER BY mois)
ORDER BY mois;
```

`WINDOW w AS (...)` nomme la fenêtre pour ne pas la répéter. `lag(ca)` vaut `NULL` sur le premier mois, donc l'évolution aussi : c'est le comportement voulu (pas de mois précédent).

Partie 2 : les 3 plus grosses commandes **de chaque client**.

```sql
SELECT client_id, id, montant, rang
FROM (
  SELECT client_id, id, montant,
         row_number() OVER (PARTITION BY client_id ORDER BY montant DESC) AS rang
  FROM commandes
) t
WHERE rang <= 3
ORDER BY client_id, rang;
```

On passe par une sous-requête parce que **les fonctions de fenêtre sont calculées après le `WHERE`** : `WHERE row_number() OVER (...) <= 3` est refusé par PostgreSQL (`window functions are not allowed in WHERE`).

Partie 3 : moyenne mobile sur 7 jours, et part de chaque client dans le CA total.

```sql
WITH ca_jour AS (
  SELECT cree_le::date AS jour, sum(montant) AS ca
  FROM commandes
  GROUP BY 1
)
SELECT jour, ca,
       round(avg(ca) OVER (ORDER BY jour ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS moyenne_7j
FROM ca_jour
ORDER BY jour;

SELECT client_id,
       sum(montant) AS ca_client,
       round(100 * sum(montant) / sum(sum(montant)) OVER (), 2) AS part_pct
FROM commandes
GROUP BY client_id
ORDER BY ca_client DESC
LIMIT 5;
```

`sum(sum(montant)) OVER ()` : l'agrégat interne est celui du `GROUP BY`, l'externe est une fenêtre sur **toutes** les lignes groupées (`OVER ()` vide = une seule partition).

Les trois classements, côte à côte :

```sql
SELECT v,
       row_number() OVER (ORDER BY v DESC) AS rn,
       rank()       OVER (ORDER BY v DESC) AS rk,
       dense_rank() OVER (ORDER BY v DESC) AS drk
FROM (VALUES (100), (90), (90), (80)) AS t(v);
--  v  | rn | rk | drk
-- 100 |  1 |  1 |   1
--  90 |  2 |  2 |   2
--  90 |  3 |  2 |   2
--  80 |  4 |  4 |   3
```

## À toi de jouer

Sur la même table :

1. Pour chaque client, calcule le **délai en jours entre deux commandes consécutives** (`lag` sur `cree_le`, partitionné par client), puis le délai moyen par client. Indice : soustraire deux `timestamptz` donne un `interval`, `extract(epoch FROM …) / 86400` le convertit en jours.
2. Trouve, pour chaque mois, le client qui a dépensé le plus. En cas d'égalité, garde-les tous : quelle fonction de rang choisis-tu ?
3. Ajoute une colonne « le client est-il en progression ? » : vrai si son CA du mois est supérieur à celui de son mois précédent.
4. Réécris la partie 1 **sans** CTE, avec des sous-requêtes imbriquées. Compare la lisibilité, puis supprime l'ancienne version.

Nettoyage : `docker stop pg-socle` (le conteneur est supprimé grâce à `--rm`).

## Pièges courants

- **Le cadre par défaut** : avec un `ORDER BY` dans `OVER`, le cadre par défaut va du début de la partition jusqu'à la ligne courante (et ses ex æquo). Résultat : `last_value(x) OVER (ORDER BY d)` renvoie la valeur de la ligne courante, pas la dernière de la partition. Précise `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.
- **`RANGE` vs `ROWS`** : `RANGE` regroupe les lignes de même valeur de tri. Avec des dates en double, un cumul « par ligne » saute d'un coup. Utilise `ROWS` quand tu veux un comportement ligne à ligne.
- **Filtrer sur une fenêtre dans le `WHERE`** : interdit, passe par une sous-requête ou une CTE. `QUALIFY` n'existe pas dans PostgreSQL (il existe dans DuckDB ou Snowflake).
- **`row_number()` sans tri déterministe** : en cas d'égalité sur `montant`, l'ordre peut changer d'une exécution à l'autre. Ajoute un critère de départage (`ORDER BY montant DESC, id`).
- **Fuseaux horaires** : `date_trunc('month', cree_le)` sur un `timestamptz` utilise le fuseau de la session. Une commande du 31 à 23 h 30 à Paris peut tomber dans le mois suivant en UTC. Fixe le fuseau explicitement pour un rapport métier : `date_trunc('month', cree_le AT TIME ZONE 'Europe/Paris')` donne un `timestamp` (sans fuseau) du début de mois à l'heure de Paris. Attention : `date_trunc('month', cree_le, 'Europe/Paris')` existe aussi mais renvoie un `timestamptz`, et un `::date` dans une session en UTC affiche alors… le 31 du mois précédent.

## Vérifie-toi

1. Quelle est la différence fondamentale entre `sum(montant)` avec `GROUP BY client_id` et `sum(montant) OVER (PARTITION BY client_id)` sur le nombre de lignes renvoyées ?
2. Tu veux le top 3 des produits par catégorie en gardant les ex æquo, sans « trous » dans la numérotation. Quelle fonction, et pourquoi pas les deux autres ?
3. Pourquoi une CTE ne rend-elle pas automatiquement une requête plus rapide ? Pour le vérifier, tu utiliseras `EXPLAIN ANALYZE` dans la leçon `sql-explain-index`.
