---json
{"titre":"9 minutes de CI à chaque virgule changée : le cache Docker ne sert jamais","date":"2026-10-19","piste":"devops","difficulte":2,"duree":75,"contexte":"Une agence web de 12 personnes déploie l'application de réservation d'un client (Next.js 16) en image Docker poussée sur un registre privé par GitHub Actions, puis tirée sur un VPS.","competences":["Comprendre l'invalidation du cache de build Docker couche par couche","Écrire un Dockerfile multi-étapes pour Next.js (sortie standalone, utilisateur non-root)","Utiliser .dockerignore pour la vitesse et la sécurité","Activer un cache de build persistant en CI (GitHub Actions)"],"livrable":"Ce qu'il faut soumettre : 1) l'explication de l'absence de cache, 2) le Dockerfile et le .dockerignore corrigés, 3) le workflow corrigé, 4) les mesures avant/après (durée de build après un changement d'une ligne, taille de l'image), 5) ce que tu fais de la découverte faite en route.","indices":["Une instruction invalide le cache dès que ses entrées changent, et toutes les instructions suivantes sont reconstruites. Que copie COPY . . ?","Sur un runner GitHub Actions hébergé, chaque job démarre sur une machine neuve : sans cache exporté quelque part, il n'y a rien à réutiliser.","Copie d'abord package.json et package-lock.json, installe, puis copie le reste. Ajoute un .dockerignore, une étape finale basée sur .next/standalone, et cache-from/cache-to type=gha. Puis regarde ce que contient vraiment l'image actuelle."],"criteres":["L'explication cite l'ordre des couches et l'absence de cache persistant entre jobs CI","Le Dockerfile installe les dépendances avant de copier le code et utilise npm ci","L'image finale part de .next/standalone, tourne avec un utilisateur non-root et pèse moins de 400 Mo","Le .dockerignore exclut au minimum .git, node_modules, .next et les fichiers .env","Le workflow utilise docker/build-push-action avec cache-from et cache-to type=gha","La présence de .env.local dans l'image publiée est détectée et traitée comme un incident (rotation des secrets)"],"lecons":["bash-scripts-robustes-timers","nextjs-frontiere-serveur-client"],"sources":[{"titre":"Docker — Optimize cache usage in builds","url":"https://docs.docker.com/build/cache/optimize/"},{"titre":"Docker — Build cache invalidation et fonctionnement","url":"https://docs.docker.com/build/cache/"},{"titre":"Docker — GitHub Actions cache backend","url":"https://docs.docker.com/build/cache/backends/gha/"},{"titre":"Docker — Build context et .dockerignore","url":"https://docs.docker.com/build/concepts/context/"},{"titre":"Next.js — output: standalone","url":"https://nextjs.org/docs/app/api-reference/config/next-config-js/output"}]}
---
## La situation

Lundi, réunion d'équipe. La lead développeuse est agacée : « Chaque push sur `main` déclenche 9 minutes de build, même pour corriger une faute d'orthographe. On a fait 31 déploiements la semaine dernière : plus de 4 heures de runner. On a dépassé le quota gratuit de minutes GitHub Actions, et le client attend ses correctifs. » En prime, le VPS met plusieurs minutes à tirer chaque nouvelle image.

Quelqu'un a lu qu'« il suffit d'activer le cache Docker », mais personne ne sait où.

## Ce que tu as sous la main

Le `Dockerfile` :

```dockerfile
FROM node:24
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Il n'y a pas de `.dockerignore`. `next.config.ts` ne définit pas d'option `output`.

Le workflow `.github/workflows/deploy.yml` :

```yaml
name: deploy
on:
  push:
    branches: [main]

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Build
        run: docker build -t registry.example.com/agence/reservation:${{ github.sha }} .
      - name: Push
        run: |
          echo "${{ secrets.REGISTRY_PASSWORD }}" | docker login registry.example.com -u ci --password-stdin
          docker push registry.example.com/agence/reservation:${{ github.sha }}
```

Les mesures, sur un poste de dev, en modifiant une seule ligne de `app/page.tsx` entre deux builds :

```console
$ docker build -t reservation:avant .
…
=> [3/5] COPY . .                       2.1s
=> [4/5] RUN npm install               71.4s
=> [5/5] RUN npm run build             48.9s
$ docker images reservation:avant --format '{{.Size}}'
2.37GB
```

Le dépôt local de la développeuse contient un `.env.local` (non commité, il est dans `.gitignore`) avec les clés de l'API de paiement en mode test. Le dossier `node_modules` local fait 600 Mo.

## Ta mission

1. Explique pourquoi `npm install` est rejoué intégralement alors qu'aucune dépendance n'a changé, en local comme en CI. Il y a deux raisons distinctes.
2. Réécris le `Dockerfile` (multi-étapes) et écris le `.dockerignore`. Justifie l'ordre des instructions.
3. Corrige le workflow pour que le cache survive d'un job à l'autre.
4. Mesure avant/après : durée d'un build après une modification d'une ligne, taille de l'image. Reproduis-le sur un `npx create-next-app@latest` si tu n'as pas de projet sous la main.
5. En inspectant l'image actuelle, tu vas trouver quelque chose de grave. Quoi, et que fais-tu dans l'heure ?

===CORRECTION===
## Diagnostic

**Raison 1 : l'ordre des couches.** Chaque instruction produit une couche, réutilisée seulement si l'instruction et ses entrées n'ont pas changé. Dès qu'une couche est invalidée, **toutes les suivantes** sont reconstruites. `COPY . .` copie tout le projet : la moindre modification d'un fichier source invalide cette couche, donc `npm install` et `npm run build` sont rejoués à chaque fois.

**Raison 2 : la CI n'a pas de mémoire.** Un runner hébergé démarre sur une machine vierge à chaque job. Même avec un Dockerfile bien ordonné, il n'y a aucun cache local à réutiliser si on ne l'exporte pas (cache GitHub Actions ou registre).

Facteurs aggravants : sans `.dockerignore`, le **contexte de build** envoie aussi `.git`, `node_modules` (600 Mo) et `.next`. L'image finale embarque toute la chaîne de build (image `node:24` complète, dépendances de développement, sources) : 2,37 Go à tirer sur le VPS à chaque déploiement.

**La découverte grave** :

```console
$ docker run --rm reservation:avant cat .env.local
STRIPE_SECRET_KEY=sk_test_…
```

`COPY . .` sans `.dockerignore` a copié `.env.local` dans l'image. Toute image construite depuis un poste qui possède ce fichier, puis poussée, contient le secret, lisible par quiconque peut tirer l'image. Le `.gitignore` ne protège que Git, pas le contexte de build Docker.

## Solution

`.dockerignore` :

```text
.git
node_modules
.next
.env*
!.env.example
npm-debug.log*
coverage
Dockerfile
.dockerignore
```

`next.config.ts` : ajouter `output: "standalone"`, qui produit dans `.next/standalone` un serveur minimal avec seulement les fichiers nécessaires.

`Dockerfile` :

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Pourquoi cet ordre :

- `package.json` et `package-lock.json` d'abord : la couche `npm ci` n'est invalidée **que** si les dépendances changent.
- `npm ci` plutôt que `npm install` : installation exacte depuis le lockfile, reproductible.
- `--mount=type=cache,target=/root/.npm` : même quand les dépendances changent, npm ne retélécharge que les paquets nouveaux.
- L'étape `runtime` ne contient que la sortie `standalone`, plus `public` et `.next/static`, que le serveur minimal ne copie pas de lui-même. Pas de sources, pas de dépendances de développement, utilisateur `node` non-root.

Workflow avec cache persistant :

```yaml
name: deploy
on:
  push:
    branches: [main]

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: registry.example.com
          username: ci
          password: ${{ secrets.REGISTRY_PASSWORD }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: registry.example.com/agence/reservation:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`mode=max` exporte aussi les couches des étapes intermédiaires (`deps`, `build`), indispensables pour qu'un build ultérieur les réutilise.

Mesures obtenues en reproduisant sur une application Next.js minimale : image de **295 Mo** au lieu de 2,37 Go, et après modification d'un fichier source, l'étape `npm ci` apparaît `CACHED` (`docker build --progress=plain` l'affiche) : seul `next build` est rejoué. Sur le projet réel, attends-toi à passer de 9 minutes à environ la durée de `next build` seule.

**Dans l'heure, pour le secret** :

1. Considérer la clé comme compromise : la **révoquer et la régénérer** dans le tableau de bord du fournisseur de paiement, même en mode test. Supprimer le tag de l'image ne suffit pas : quiconque l'a tirée la garde.
2. Lister les images publiées depuis des postes de développement et vérifier ce qu'elles contiennent (`docker run --rm IMAGE ls -a`, ou un scanner de secrets).
3. Corriger le `.dockerignore`, reconstruire, republier, et ne plus construire d'image publiée que depuis la CI, avec un dépôt propre.
4. Prévenir le client si des secrets de production étaient concernés.

## Pourquoi ça arrive en vrai

- Le Dockerfile « qui marche » est souvent le premier écrit, copié d'un tutoriel, et personne n'y retouche tant que la CI passe.
- Le cache Docker fonctionne en local (la machine garde ses couches), donc le problème n'apparaît qu'en CI, où les minutes sont facturées.
- Tout le monde pense que `.gitignore` protège aussi Docker. Le contexte de build, c'est le dossier sur le disque, pas le dépôt Git.

## Ce qu'un senior ferait en plus

- Passer les secrets nécessaires **au build** par `RUN --mount=type=secret`, jamais par `COPY`, `ARG` ou `ENV`, qui laissent des traces dans l'image ou son historique.
- Ajouter dans la CI un **scan** de l'image (vulnérabilités et secrets) qui bloque la publication.
- Épingler l'image de base par **digest** (`node:24-alpine@sha256:…`) pour des builds reproductibles, avec un outil de mise à jour automatique des dépendances pour la faire évoluer.
- Ajouter un `HEALTHCHECK` ou une sonde côté orchestrateur, et des `LABEL` OCI (source, commit) pour savoir ce qui tourne en production.
- Suivre la durée de la CI comme une métrique d'équipe : un build qui passe de 2 à 9 minutes se repère et se corrige dès la semaine où il dérive.
