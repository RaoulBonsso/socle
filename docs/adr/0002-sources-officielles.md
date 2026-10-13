# ADR 0002 — Fil : uniquement des sources officielles

- **Statut :** accepté — 2026-10-13
- **Décision :** le fil ne lit que des flux publiés par l'éditeur d'une technologie ou par une autorité (CERT-FR/ANSSI, CNIL). Pas d'agrégateur, pas de média tiers.
- **Vérification (2026-10-13) :** chaque flux a répondu en HTTP 200 avec des articles récents. Écartés : Apache Spark (`/news/index.xml` : 404), Anthropic (`/rss.xml` : 404), data.gouv.fr (`/fr/posts.atom` : 404), numerique.gouv.fr (`/feed/` : 404), python.org (`/blogs/rss/` : 404).
- **Robustesse :** délai de 8 s par flux, une source en panne n'empêche pas les autres et est signalée en bas du fil ; relecture au plus une fois par heure (ISR).
