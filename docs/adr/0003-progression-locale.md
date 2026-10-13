# ADR 0003 — Progression locale d'abord

- **Statut :** accepté — 2026-10-13
- **Contexte :** commencer à apprendre ne doit demander ni compte ni mot de passe.
- **Décision :** la progression (fiches, cartes SM-2, défis, journal) tient dans un objet versionné stocké dans le navigateur, avec export/import JSON (v0.2). La synchronisation entre appareils est prévue en option (v0.4).
- **Conséquences :** + zéro friction, zéro donnée personnelle côté serveur. − vider son navigateur efface la progression tant que l'export n'est pas fait.
