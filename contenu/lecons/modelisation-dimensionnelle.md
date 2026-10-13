---json
{"titre":"Modélisation dimensionnelle : schéma en étoile, grain et historisation (SCD 2)","piste":"data","module":"sql-modelisation","niveau":2,"duree":20,"prerequis":["sql-cte-fonctions-fenetre"],"objectifs":["Déclarer le grain d'une table de faits avant d'écrire la moindre colonne","Séparer faits (mesures) et dimensions (contexte) dans un schéma en étoile","Utiliser des clés de substitution et une dimension date","Historiser un changement d'attribut avec une dimension à évolution lente de type 2"],"sources":[{"titre":"Kimball Group — Dimensional Modeling Techniques","url":"https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/"},{"titre":"Kimball Group — Four-Step Dimensional Design Process","url":"https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/"},{"titre":"Kimball Group — Type 2: Add New Row","url":"https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/"},{"titre":"dbt — Building a Kimball dimensional model with dbt","url":"https://docs.getdbt.com/blog/kimball-dimensional-model"},{"titre":"PostgreSQL — Partial Indexes (unicité de la version courante)","url":"https://www.postgresql.org/docs/current/indexes-partial.html"}],"liens":["sql-cte-fonctions-fenetre","sql-explain-index","architecture-hexagonale-ts"]}
---
## Pourquoi c'est important

Un torréfacteur qui vend en ligne te demande : « Quel est notre chiffre d'affaires par ville et par catégorie, mois par mois ? » Tu requêtes la base de l'application et tu obtiens un résultat. Le gérant s'étonne : « Lyon a fait 9,90 € en mars ? On n'avait aucun client à Lyon en mars ! » Explication : la cliente n° 42 habitait Nantes en mars, puis elle a déménagé à Lyon en juin et mis à jour son adresse. La base applicative ne garde que l'état **actuel** : toutes ses commandes passées ont « déménagé » avec elle. Le rapport réécrit l'histoire.

La base d'une application (OLTP) est conçue pour **écrire** vite et rester cohérente : tables normalisées, état courant. L'analyse (OLAP) a besoin de **lire** des millions de lignes, de regrouper selon des axes métier et de garder l'historique. La **modélisation dimensionnelle** (méthode de Ralph Kimball) est le standard pour ça. On la retrouve dans les modèles dbt, les entrepôts BigQuery, Snowflake ou DuckDB, et dans les questions d'entretien Data Engineer (« explique-moi le grain de cette table »).

## Le concept

Analogie : un **ticket de caisse** et le **registre** du magasin.

- Chaque ligne du ticket est un **fait** : un événement mesurable (quantité, montant).
- Autour, le contexte qui répond à *qui, quoi, quand, où* : ce sont les **dimensions** (client, produit, date, magasin).

Le **schéma en étoile** place une table de faits au centre, reliée à des tables de dimensions par des clés. On le requête toujours de la même façon : on joint, on filtre sur les dimensions, on agrège les faits.

La méthode Kimball en 4 étapes :

1. **Choisir le processus métier** : les ventes (pas « toute l'entreprise »).
2. **Déclarer le grain** : que représente **une** ligne de faits ? Ici : *une ligne de produit dans une commande*. C'est la décision la plus importante. Un grain flou produit des doubles comptages.
3. **Identifier les dimensions** : date, produit, client.
4. **Identifier les faits** : quantité, montant HT, cohérents avec le grain.

Trois outils indispensables :

- **Clé de substitution** (`client_key`) : un entier propre à l'entrepôt, distinct de l'identifiant de l'application (`client_id`, la clé *naturelle*). C'est elle qui permet d'avoir plusieurs versions du même client.
- **Dimension date** : une ligne par jour, avec ses attributs précalculés (mois, jour de la semaine, week-end, jour férié…). Les analystes filtrent dessus sans manipuler de fonctions de date.
- **SCD type 2** (*slowly changing dimension*) : quand un attribut suivi change, on **ferme** la ligne courante (date de fin) et on **insère** une nouvelle version. Les faits passés restent liés à l'ancienne version, et l'histoire est préservée.

## Exemple

```bash
docker run --rm -d --name pg-socle -e POSTGRES_PASSWORD=dev postgres:17
docker exec -it pg-socle psql -U postgres
```

Les dimensions :

```sql
CREATE TABLE dim_date (
  date_key    int     PRIMARY KEY,          -- 20261013 : lisible et triable
  jour        date    NOT NULL UNIQUE,
  annee       int     NOT NULL,
  mois        int     NOT NULL,
  est_weekend boolean NOT NULL
);

INSERT INTO dim_date
SELECT to_char(d, 'YYYYMMDD')::int, d,
       extract(year FROM d), extract(month FROM d),
       extract(isodow FROM d) IN (6, 7)
FROM generate_series(date '2026-01-01', date '2026-12-31', interval '1 day') AS g(d);

CREATE TABLE dim_produit (
  produit_key int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku         text NOT NULL UNIQUE,
  nom         text NOT NULL,
  categorie   text NOT NULL
);

CREATE TABLE dim_client (
  client_key  int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id   int     NOT NULL,                 -- clé naturelle (application)
  ville       text    NOT NULL,                 -- attribut historisé (SCD 2)
  valide_du   date    NOT NULL,
  valide_au   date    NOT NULL DEFAULT '9999-12-31',
  est_courant boolean NOT NULL DEFAULT true
);
-- une seule version courante par client
CREATE UNIQUE INDEX ON dim_client (client_id) WHERE est_courant;
```

La table de faits, au grain « une ligne de produit par commande » :

```sql
CREATE TABLE fait_ventes (
  date_key    int    NOT NULL REFERENCES dim_date,
  produit_key int    NOT NULL REFERENCES dim_produit,
  client_key  int    NOT NULL REFERENCES dim_client,
  commande_id bigint NOT NULL,          -- dimension dégénérée : pas de table dédiée
  quantite    int    NOT NULL,
  montant_ht  numeric(10,2) NOT NULL,
  PRIMARY KEY (commande_id, produit_key) -- le grain, garanti par une contrainte
);
```

Chargement initial :

```sql
INSERT INTO dim_produit (sku, nom, categorie) VALUES
  ('CAF-001', 'Moka 250g', 'café'),
  ('CAF-002', 'Éthiopie 250g', 'café'),
  ('ACC-001', 'Moulin manuel', 'accessoire');

INSERT INTO dim_client (client_id, ville, valide_du) VALUES
  (42, 'Nantes', '2026-01-01'),
  (43, 'Rennes', '2026-01-01');

INSERT INTO fait_ventes VALUES
  (20260310, 1, 1, 1001, 2, 19.80),
  (20260310, 3, 1, 1001, 1, 45.00),
  (20260415, 2, 2, 1002, 3, 36.00);
```

La cliente 42 déménage à Lyon le 1er juin : **SCD 2**, dans une transaction.

```sql
BEGIN;
UPDATE dim_client
SET valide_au = date '2026-05-31', est_courant = false
WHERE client_id = 42 AND est_courant;

INSERT INTO dim_client (client_id, ville, valide_du)
VALUES (42, 'Lyon', date '2026-06-01');
COMMIT;
```

Lors du chargement d'une vente, on cherche la version **valide à la date de la vente** :

```sql
SELECT client_key
FROM dim_client
WHERE client_id = 42
  AND date '2026-07-02' BETWEEN valide_du AND valide_au;   -- renvoie 3 (version Lyon)

INSERT INTO fait_ventes VALUES (20260702, 1, 3, 1003, 1, 9.90);
```

Le rapport du gérant, désormais juste :

```sql
SELECT d.annee, d.mois, p.categorie, c.ville,
       sum(f.quantite)   AS unites,
       sum(f.montant_ht) AS ca_ht
FROM fait_ventes f
JOIN dim_date d    USING (date_key)
JOIN dim_produit p USING (produit_key)
JOIN dim_client c  USING (client_key)
GROUP BY d.annee, d.mois, p.categorie, c.ville
ORDER BY d.mois, p.categorie;
--  annee | mois | categorie  | ville  | unites | ca_ht
--   2026 |    3 | accessoire | Nantes |      1 | 45.00
--   2026 |    3 | café       | Nantes |      2 | 19.80
--   2026 |    4 | café       | Rennes |      3 | 36.00
--   2026 |    7 | café       | Lyon   |      1 |  9.90
```

Mars reste à Nantes, juillet est à Lyon : l'histoire est préservée.

## À toi de jouer

1. Le gérant veut aussi analyser par **canal** (site, marché, boutique). Ajoute une dimension `dim_canal` et modifie la table de faits. Quel impact sur le grain ?
2. Le produit `CAF-001` change de catégorie (« café » devient « café de spécialité ») au 1er septembre. Le gérant veut garder l'ancienne catégorie pour les ventes passées. Transforme `dim_produit` en SCD 2 et rejoue le changement.
3. Écris une requête de **contrôle qualité** qui vérifie qu'aucun client n'a deux versions dont les périodes de validité se chevauchent (indice : auto-jointure sur `client_id`, ou `lead(valide_du) OVER (PARTITION BY client_id ORDER BY valide_du)` vu dans la leçon `sql-cte-fonctions-fenetre`).
4. Sur papier : modélise un processus que tu connais (réservations d'une appli, commandes d'une boutique démo). Écris le grain en **une phrase**, puis liste les dimensions et les faits.

## Pièges courants

- **Grain mélangé** : mettre dans la même table des lignes « par commande » (frais de port) et « par produit » (montant ligne). Le `sum` additionne alors des choses incomparables. Un grain par table de faits ; les frais de port vont dans une autre table ou sont répartis explicitement.
- **Joindre les faits sur la clé naturelle** (`client_id`) au lieu de la clé de substitution : chaque vente est multipliée par le nombre de versions du client. C'est le doublon le plus fréquent dans les entrepôts.
- **Historiser tout en SCD 2** : chaque attribut historisé multiplie les versions. Ne suis en type 2 que ce que le métier veut réellement analyser dans le temps. Pour une simple correction de faute de frappe, on écrase la valeur (type 1).
- **Bornes de validité incohérentes** : choisis une convention (`valide_au` inclusif ici, avec `BETWEEN`) et tiens-t'y partout. Mélanger inclusif et exclusif crée des trous ou des doublons d'un jour.
- **Faits non additifs** : un prix unitaire ou un pourcentage ne se somme pas. Stocke les composantes additives (montant, quantité) et calcule le ratio au moment de la requête.

## Vérifie-toi

1. Énonce le grain de `fait_ventes` en une phrase, et explique ce qui se passerait si on le changeait en « une ligne par commande ».
2. Pourquoi la dimension client a-t-elle besoin d'une clé de substitution en plus de `client_id` ? Comment ce découplage entre identifiant interne et identifiant externe rappelle-t-il la séparation domaine / adaptateurs de la leçon `architecture-hexagonale-ts` ?
3. Décris les deux opérations SQL d'un changement SCD 2, et pourquoi elles doivent être dans une même transaction.
