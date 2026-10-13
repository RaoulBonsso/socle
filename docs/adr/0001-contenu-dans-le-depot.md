# ADR 0001 — Le contenu vit dans le dépôt

- **Statut :** accepté — 2026-10-13
- **Contexte :** le contenu (défis, fiches, cartes, ressources) grandit chaque jour, écrit en partie par des agents. Il faut pouvoir le relire, le tester, revenir en arrière.
- **Décision :** fichiers markdown (en-tête JSON validé par Zod) et JSON dans `contenu/`, rendus au build (SSG). Un test d'intégrité tourne sur le contenu réel.
- **Conséquences :** + historique, revue, CI, coût d'hébergement nul, chaque ajout est un commit utile. − la correction d'un défi est lisible dans le dépôt public : Socle repose sur l'honnêteté de l'apprenant, ce qui est assumé (on ne triche qu'avec soi-même).
