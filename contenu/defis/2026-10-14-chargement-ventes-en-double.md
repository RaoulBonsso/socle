---json
{"titre":"Le CA de dimanche a doublé : un chargement qui n'est pas idempotent","date":"2026-10-14","piste":"data","difficulte":2,"duree":60,"contexte":"Une chaîne de 6 boutiques de vélos alimente chaque nuit un petit entrepôt PostgreSQL à partir de l'export CSV de sa caisse. Le directeur financier pilote les commandes fournisseurs avec le tableau de bord qui en sort.","competences":["Détecter des doublons avec GROUP BY / HAVING et les fonctions de fenêtre","Faire respecter le grain d'une table de faits par une contrainte","Écrire un chargement idempotent (INSERT … ON CONFLICT) dans une transaction","Rendre un script de chargement robuste aux relances"],"livrable":"Ce qu'il faut soumettre : 1) tes hypothèses sur l'origine des doublons, 2) la requête qui les met en évidence, 3) le script SQL de nettoyage, 4) le nouveau script de chargement, que l'on peut relancer N fois sans changer le résultat, 5) une phrase pour le directeur financier.","indices":["Compare le nombre de lignes chargées dimanche avec le nombre de lignes distinctes sur le couple (commande_id, ligne).","Lis le script ligne par ligne en te demandant : que se passe-t-il si le process est tué entre deux commandes ? Et si quelqu'un le relance à la main ?","Une contrainte UNIQUE sur le grain, un INSERT … ON CONFLICT (commande_id, ligne) DO UPDATE et une transaction unique autour du chargement et du vidage de la table de transit."],"criteres":["Les hypothèses citent au moins la relance manuelle et l'absence de transaction","La requête de détection renvoie les couples (commande_id, ligne) en double avec leur nombre","Le nettoyage garde exactement une ligne par couple et s'exécute dans une transaction","Une contrainte UNIQUE matérialise le grain de la table de faits","Le nouveau chargement donne le même résultat après 1, 2 ou 3 exécutions (prouvé par une requête)","Le script shell s'arrête à la première erreur (ON_ERROR_STOP, set -e)"],"lecons":["modelisation-dimensionnelle","sql-cte-fonctions-fenetre","bash-scripts-robustes-timers"],"sources":[{"titre":"PostgreSQL — INSERT (clause ON CONFLICT)","url":"https://www.postgresql.org/docs/current/sql-insert.html"},{"titre":"PostgreSQL — psql (ON_ERROR_STOP, --single-transaction)","url":"https://www.postgresql.org/docs/current/app-psql.html"},{"titre":"PostgreSQL — Window Functions","url":"https://www.postgresql.org/docs/current/functions-window.html"},{"titre":"Kimball Group — Grain","url":"https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/grain/"}]}
---
## La situation

Lundi, 9 h 15, message du directeur financier : « Le tableau de bord indique que dimanche est notre meilleure journée de l'année, avec le double du CA habituel. Les boutiques me disent que c'était calme. J'ai passé deux commandes fournisseurs ce matin en me basant sur ces chiffres. Qu'est-ce qui se passe ? »

En creusant, tu apprends que dans la nuit de dimanche à lundi, le serveur a été redémarré par l'hébergeur pendant le chargement. Lundi à 7 h, un collègue a vu que le tableau de bord n'était pas à jour et a « relancé le script à la main, comme d'habitude ».

## Ce que tu as sous la main

Le script lancé chaque nuit à 2 h par cron :

```bash
#!/bin/bash
# charger_ventes.sh
cd /opt/entrepot
psql "$DWH_URL" -c "\copy staging_ventes FROM 'exports/ventes_$(date -d yesterday +%F).csv' CSV HEADER"
psql "$DWH_URL" -f charger_ventes.sql
```

Et `charger_ventes.sql` :

```sql
INSERT INTO fait_ventes (commande_id, ligne, vendu_le, sku, quantite, montant_ht)
SELECT commande_id, ligne, vendu_le, sku, quantite, montant_ht
FROM staging_ventes;

TRUNCATE staging_ventes;
```

Les tables, pour reproduire chez toi (`docker run --rm -d --name pg-defi -e POSTGRES_PASSWORD=dev postgres:17`, puis `docker exec -it pg-defi psql -U postgres`) :

```sql
CREATE TABLE staging_ventes (
  commande_id bigint, ligne int, vendu_le timestamptz, sku text, quantite int, montant_ht numeric(10,2)
);
CREATE TABLE fait_ventes (
  commande_id bigint NOT NULL,
  ligne       int    NOT NULL,
  vendu_le    timestamptz NOT NULL,
  sku         text   NOT NULL,
  quantite    int    NOT NULL,
  montant_ht  numeric(10,2) NOT NULL,
  charge_le   timestamptz NOT NULL DEFAULT now()
);

-- Nuit de dimanche à lundi : l'INSERT passe, le serveur redémarre avant le TRUNCATE
INSERT INTO staging_ventes VALUES
  (5001, 1, '2026-10-11 10:12+02', 'CAF-001', 2, 19.80),
  (5001, 2, '2026-10-11 10:12+02', 'ACC-001', 1, 45.00),
  (5002, 1, '2026-10-11 18:40+02', 'CAF-002', 1, 12.00);
INSERT INTO fait_ventes (commande_id, ligne, vendu_le, sku, quantite, montant_ht)
SELECT commande_id, ligne, vendu_le, sku, quantite, montant_ht FROM staging_ventes;

-- Lundi 7 h : relance manuelle, avec en plus la seule vente du lundi matin déjà exportée
INSERT INTO staging_ventes VALUES (5003, 1, '2026-10-12 09:05+02', 'CAF-001', 1, 9.90);
INSERT INTO fait_ventes (commande_id, ligne, vendu_le, sku, quantite, montant_ht)
SELECT commande_id, ligne, vendu_le, sku, quantite, montant_ht FROM staging_ventes;
TRUNCATE staging_ventes;
```

Le tableau de bord exécute :

```sql
SELECT (vendu_le AT TIME ZONE 'Europe/Paris')::date AS jour,
       count(*) AS lignes, sum(montant_ht) AS ca_ht
FROM fait_ventes
GROUP BY 1
ORDER BY 1;
--     jour    | lignes | ca_ht
--  2026-10-11 |      6 | 153.60
--  2026-10-12 |      1 |   9.90
```

## Ta mission

1. Formule tes hypothèses : par quel enchaînement exact les lignes de dimanche se retrouvent-elles en double ? Quels autres scénarios produiraient le même symptôme ?
2. Écris la requête qui prouve les doublons et les compte.
3. Nettoie `fait_ventes` sans perdre de vente légitime, puis empêche définitivement les doublons au niveau de la base.
4. Réécris `charger_ventes.sql` et `charger_ventes.sh` pour que le chargement soit **idempotent** : le relancer une, deux ou dix fois donne le même résultat. Prouve-le.
5. Rédige la phrase que tu envoies au directeur financier : ce qui s'est passé, l'impact, ce qui est corrigé.

===CORRECTION===
## Diagnostic

Enchaînement : l'`INSERT` de la nuit a réussi, mais le redémarrage a empêché le `TRUNCATE`. La table de transit contenait donc encore les ventes de dimanche. La relance de 7 h a ajouté la vente du lundi à ces lignes et **tout réinséré**. Résultat : chaque ligne de dimanche est présente deux fois (153,60 € au lieu de 76,80 €).

Deux défauts de conception rendent cela possible :

- **aucune contrainte** sur le grain « une ligne de commande » : la base accepte les doublons sans broncher ;
- **aucune transaction** : l'insertion et le vidage de la table de transit ne sont pas atomiques.

Autres scénarios donnant le même symptôme : export CSV relivré deux fois par la caisse, cron lancé deux fois (deux serveurs, ou un timer plus un cron), `\copy` d'un fichier qui a déjà été chargé.

Preuve :

```sql
SELECT commande_id, ligne, count(*) AS occurrences
FROM fait_ventes
GROUP BY commande_id, ligne
HAVING count(*) > 1
ORDER BY commande_id, ligne;
--  commande_id | ligne | occurrences
--         5001 |     1 |           2
--         5001 |     2 |           2
--         5002 |     1 |           2
```

## Solution

Nettoyage + contrainte, dans une transaction (on garde la première ligne chargée) :

```sql
BEGIN;
DELETE FROM fait_ventes f
USING (
  SELECT ctid,
         row_number() OVER (PARTITION BY commande_id, ligne ORDER BY charge_le, ctid) AS rn
  FROM fait_ventes
) d
WHERE f.ctid = d.ctid
  AND d.rn > 1;

ALTER TABLE fait_ventes ADD CONSTRAINT fait_ventes_grain UNIQUE (commande_id, ligne);
COMMIT;
```

`ctid` est l'adresse physique de la ligne : il permet de distinguer des lignes strictement identiques. On ne l'utilise que dans une opération ponctuelle comme celle-ci, jamais comme identifiant applicatif.

Nouveau `charger_ventes.sql` : un *upsert* sur le grain. Une ligne déjà présente est mise à jour (correction de caisse), une nouvelle est insérée.

```sql
INSERT INTO fait_ventes (commande_id, ligne, vendu_le, sku, quantite, montant_ht)
SELECT commande_id, ligne, vendu_le, sku, quantite, montant_ht
FROM staging_ventes
ON CONFLICT (commande_id, ligne) DO UPDATE
SET vendu_le   = EXCLUDED.vendu_le,
    sku        = EXCLUDED.sku,
    quantite   = EXCLUDED.quantite,
    montant_ht = EXCLUDED.montant_ht,
    charge_le  = now();

TRUNCATE staging_ventes;
```

Nouveau `charger_ventes.sh` : tout dans **une seule transaction**, arrêt à la première erreur.

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/entrepot

fichier="exports/ventes_$(date -d yesterday +%F).csv"
[[ -s "$fichier" ]] || { echo "export absent ou vide : $fichier" >&2; exit 1; }

psql "$DWH_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -c "TRUNCATE staging_ventes" \
  -c "\\copy staging_ventes FROM '$fichier' CSV HEADER" \
  -f charger_ventes.sql
```

- `TRUNCATE` en tête : on repart toujours d'une table de transit vide, quel que soit l'état laissé par une exécution interrompue.
- `--single-transaction` : psql entoure l'ensemble des `-c` et `-f` d'un `BEGIN`/`COMMIT`. Si le serveur redémarre au milieu, rien n'est validé.
- `ON_ERROR_STOP=1` : sans lui, psql continue après une erreur SQL et renvoie 0.

Preuve d'idempotence : lance le chargement trois fois de suite, puis la requête du tableau de bord. Les totaux ne bougent pas après la première exécution (76,80 € pour dimanche).

Message au directeur financier : « Les ventes de dimanche ont été comptées deux fois à cause d'une relance du chargement nocturne après un redémarrage du serveur. Le vrai CA de dimanche est la moitié du chiffre affiché. Les données sont corrigées, et le chargement est désormais protégé contre ce cas : vérifie les deux commandes fournisseurs de ce matin. »

## Pourquoi ça arrive en vrai

- Les scripts de chargement sont écrits pour le cas nominal, où tout s'exécute une fois et en entier. La réalité, ce sont les redémarrages, les relances manuelles, les fichiers relivrés.
- « Relancer le script » est le réflexe de tout le monde. Un pipeline qui ne supporte pas d'être relancé est un pipeline cassé, même s'il n'a jamais planté.
- Les tables analytiques sont souvent créées sans contraintes « pour aller vite ». C'est précisément là que la base aurait refusé le doublon.

## Ce qu'un senior ferait en plus

- **Dédoublonner la table de transit avant l'upsert** : si le même CSV contient deux fois la même ligne, `ON CONFLICT DO UPDATE` échoue (`command cannot affect row a second time`). Un `SELECT DISTINCT ON (commande_id, ligne) … ORDER BY commande_id, ligne, …` règle le cas.
- **Journaliser les chargements** dans une table `chargements(fichier, sha256, lignes, charge_le)` et refuser un fichier déjà chargé avec le même hash.
- Remplacer le cron par un **timer systemd** (journal, code de retour, `Persistent=true`), ou par un orchestrateur (Airflow, Dagster) quand les chargements se multiplient. Le principe d'idempotence par intervalle de données y est central.
- Ajouter un **test de qualité** après chaque chargement : nombre de lignes chargées comparé à celui du CSV, unicité du grain, CA du jour dans une fourchette plausible par rapport à la moyenne des 4 mêmes jours de semaine précédents. Une alerte aurait fait gagner une matinée.
- Tracer chaque correction (date, cause, impact) dans un journal des incidents de données, partagé avec les métiers.
