# Socle — consignes pour les agents

- Français partout. Commits conventionnels, sans trailer Co-Authored-By. Branche `dev` (par défaut), jamais `main`.
- Le domaine (`src/domaine`) ne change pas sans test rouge d'abord.
- Le contenu (`contenu/`) est public : aucune donnée personnelle, aucun secret, aucune entreprise réelle mise en cause dans un défi (contextes plausibles mais fictifs).
- Toute affirmation technique d'une fiche ou d'un défi est vérifiable dans la documentation officielle citée en `sources`.
- Avant de terminer : `npm test && npm run typecheck && npm run lint && npm run build` (le test d'intégrité du contenu fait partie de `npm test`).
