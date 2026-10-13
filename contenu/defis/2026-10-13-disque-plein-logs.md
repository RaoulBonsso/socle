---json
{"titre":"Disque plein un mardi matin : les logs ont mangé le serveur","date":"2026-10-13","piste":"devops","difficulte":2,"duree":60,"contexte":"Une PME de transport (40 salariés) fait tourner son API de suivi de livraisons sur un unique VPS (Docker Compose : API Node, PostgreSQL, Nginx). Pas d'équipe ops : c'est toi.","competences":["Diagnostiquer l'occupation disque (df, du, docker system df)","Configurer la rotation des logs Docker (driver json-file)","Limiter la taille du journal systemd","Prévenir la récidive par une alerte"],"livrable":"Ce qu'il faut soumettre : 1) tes hypothèses classées avant toute commande, 2) la liste ordonnée des commandes de diagnostic, 3) le docker-compose.yml corrigé et la modification de journald.conf, 4) le script ou l'unité qui alertera la prochaine fois avant 85 % d'occupation.","indices":["Le disque n'est pas plein de données métier : regarde qui écrit le plus, et depuis quand.","Le driver de logs par défaut de Docker (json-file) ne fait aucune rotation tant que max-size n'est pas défini.","Il faut agir à deux niveaux : la clé logging du service dans docker-compose.yml (puis recréer le conteneur) et SystemMaxUse dans journald.conf."],"criteres":["Les hypothèses sont formulées avant la première commande et au moins une est éliminée par une mesure","Le diagnostic identifie le fichier *-json.log du conteneur api comme principal consommateur","Le compose corrigé définit max-size et max-file sous forme de chaînes pour chaque service","La correction précise que le conteneur doit être recréé (la config de logs ne s'applique pas à un conteneur existant)","La taille du journal systemd est plafonnée et la commande de vérification est donnée","Un mécanisme d'alerte sur le taux d'occupation est proposé et testable"],"lecons":["bash-scripts-robustes-timers","linux-services-systemd"],"sources":[{"titre":"Docker — JSON File logging driver","url":"https://docs.docker.com/engine/logging/drivers/json-file/"},{"titre":"Compose file reference — services (logging)","url":"https://docs.docker.com/reference/compose-file/services/"},{"titre":"docker system df","url":"https://docs.docker.com/reference/cli/docker/system/df/"},{"titre":"journald.conf — page de manuel officielle","url":"https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html"},{"titre":"journalctl — page de manuel officielle","url":"https://www.freedesktop.org/software/systemd/man/latest/journalctl.html"}]}
---
## La situation

Mardi, 7 h 52. Le responsable d'exploitation de la PME t'appelle : « Les chauffeurs ne peuvent plus valider leurs livraisons dans l'appli, ça tourne dans le vide. On a 120 tournées qui partent à 8 h 30. » Les clients de la PME reçoivent normalement un SMS de suivi à chaque étape. Ce matin, rien ne part. Chaque heure de panne, ce sont des appels au service client et des pénalités de retard prévues dans deux contrats.

Tu te connectes en SSH. La connexion est lente, et l'autocomplétion de la touche Tab affiche une erreur bizarre.

## Ce que tu as sous la main

Le message à la connexion :

```text
-bash: cannot create temp file for here-document: No space left on device
```

```console
$ df -h /
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        78G   78G     0 100% /
```

Les logs de l'API (vus par `docker compose logs --tail 5 api`) :

```text
api-1  | {"level":"error","msg":"could not write to file","err":"ENOSPC: no space left on device, write"}
api-1  | {"level":"debug","msg":"GET /health 200 1ms"}
api-1  | {"level":"debug","msg":"GET /health 200 1ms"}
api-1  | {"level":"debug","msg":"position update","vehicule":"VH-114","lat":47.2181,"lon":-1.5528}
api-1  | {"level":"debug","msg":"position update","vehicule":"VH-087","lat":47.2049,"lon":-1.5719}
```

Le `docker-compose.yml` en production :

```yaml
services:
  api:
    image: registry.example.com/livraisons/api:2.8.1
    restart: unless-stopped
    environment:
      LOG_LEVEL: debug        # « temporaire », ajouté lors d'un incident en juin
      DATABASE_URL: ${DATABASE_URL}
    ports:
      - "127.0.0.1:3000:3000"
    depends_on: [db]

  db:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  nginx:
    image: nginx:1.29
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro

volumes:
  pgdata:
```

Le fichier `/etc/docker/daemon.json` n'existe pas. Le serveur a été installé il y a 14 mois. Les véhicules envoient leur position toutes les 5 secondes.

## Ta mission

1. **Avant de taper la moindre commande**, écris trois hypothèses sur ce qui remplit le disque, classées par probabilité, avec pour chacune l'élément du dossier qui te la suggère.
2. Donne la séquence de commandes de diagnostic, dans l'ordre, pour confirmer ou éliminer chaque hypothèse. Précise ce que tu t'attends à voir.
3. Remets le service en marche **sans perdre de données métier**. Qu'as-tu le droit de supprimer en urgence, et qu'est-ce que tu ne touches surtout pas ?
4. Corrige durablement : `docker-compose.yml`, configuration de journald, et niveau de logs.
5. Comment éviter la récidive ? Propose un mécanisme d'alerte simple, sans outil payant, qui t'aurait prévenu deux semaines avant.

===CORRECTION===
## Diagnostic

Hypothèses raisonnables : (1) les logs des conteneurs, puisque l'API est en `debug` depuis juin et logue chaque position toutes les 5 s ; (2) le journal systemd ; (3) des images Docker et un cache de build jamais nettoyés ; (4) le volume PostgreSQL. La (4) est la seule qui serait de la donnée métier, donc la dernière à toucher.

Commandes, du général au particulier :

```bash
df -h /                                    # confirme 100 %
sudo du -xh --max-depth=1 / 2>/dev/null | sort -h | tail -5
# → /var occupe presque tout
sudo du -xh --max-depth=2 /var 2>/dev/null | sort -h | tail -5
# → /var/lib/docker
docker system df                           # images, conteneurs, volumes, cache de build
sudo sh -c 'du -h /var/lib/docker/containers/*/*-json.log' | sort -h | tail -3
# → un fichier de plusieurs dizaines de Go
docker inspect --format '{{.Name}} {{.LogPath}}' $(docker ps -q)   # quel conteneur ?
journalctl --disk-usage                    # taille du journal systemd
```

Calcul de vraisemblance : 2 véhicules par seconde en moyenne × ~150 octets par ligne JSON avec les métadonnées du driver, plus les health checks, sur quatre mois de mode `debug`… on atteint vite plusieurs dizaines de gigaoctets. Le driver `json-file` a `max-size` à `-1` par défaut (illimité) : **aucune rotation**.

## Solution

**Urgence (5 minutes)** : libérer de la place sans toucher aux données métier.

```bash
# 1. Repasser l'API en niveau info, ce qui arrête l'hémorragie
#    (dans docker-compose.yml : LOG_LEVEL: info)

# 2. Purger le journal systemd au-delà de 500 Mo
sudo journalctl --vacuum-size=500M

# 3. Supprimer images et cache de build inutilisés (ne touche PAS aux volumes)
docker image prune -a
docker builder prune
```

Ne lance **pas** `docker system prune --volumes` : `pgdata` contient la base. Pour le fichier de logs géant, la vraie solution est de recréer le conteneur avec la rotation (étape suivante) : à la suppression de l'ancien conteneur, son fichier `*-json.log` disparaît avec lui.

**Correction durable**, `docker-compose.yml` :

```yaml
x-logging: &logging-defaut
  driver: json-file
  options:
    max-size: "10m"   # les valeurs sont des chaînes
    max-file: "5"

services:
  api:
    image: registry.example.com/livraisons/api:2.8.1
    restart: unless-stopped
    logging: *logging-defaut
    environment:
      LOG_LEVEL: info
      DATABASE_URL: ${DATABASE_URL}
    ports:
      - "127.0.0.1:3000:3000"
    depends_on: [db]

  db:
    image: postgres:17
    restart: unless-stopped
    logging: *logging-defaut
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  nginx:
    image: nginx:1.29
    restart: unless-stopped
    logging: *logging-defaut
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro

volumes:
  pgdata:
```

```bash
docker compose up -d --force-recreate     # la config de logs ne s'applique qu'aux conteneurs (re)créés
docker inspect --format '{{.HostConfig.LogConfig}}' $(docker compose ps -q api)
```

En complément, un défaut global pour tous les futurs conteneurs, dans `/etc/docker/daemon.json` :

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
```

```bash
sudo systemctl restart docker   # coupe tous les conteneurs : à faire dans une fenêtre calme
```

Journal systemd plafonné, dans `/etc/systemd/journald.conf` (section `[Journal]`) :

```ini
[Journal]
SystemMaxUse=1G
```

```bash
sudo systemctl restart systemd-journald
journalctl --disk-usage
```

**Alerte** : un script + un timer systemd (méthode de la leçon `bash-scripts-robustes-timers`).

```bash
#!/usr/bin/env bash
# /usr/local/bin/alerte-disque.sh — sort en erreur au-delà du seuil
set -Eeuo pipefail
SEUIL="${SEUIL:-85}"
utilise="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if (( utilise >= SEUIL )); then
  echo "ALERTE disque / à ${utilise}% (seuil ${SEUIL}%)" >&2
  # envoi : webhook n8n, mail, Telegram… via une URL lue dans un EnvironmentFile
  exit 1
fi
```

Planifié toutes les heures (`OnCalendar=hourly`), l'échec apparaît dans `systemctl --failed` et dans le journal, et le script peut appeler un webhook d'alerte.

## Pourquoi ça arrive en vrai

- Le comportement par défaut de Docker est « pas de rotation ». Tant que le disque est grand, personne ne s'en rend compte : la panne arrive des mois après l'installation.
- Le « `debug` temporaire » pendant un incident n'est jamais retiré, faute de ticket de suivi.
- Personne ne surveille le disque, parce qu'il n'y a pas d'équipe ops dans une PME de 40 personnes.

## Ce qu'un senior ferait en plus

- **Fichier supprimé mais encore ouvert** : si `df` dit 100 % mais que `du` ne trouve rien, un process garde ouvert un fichier supprimé. `sudo lsof +L1` le montre. L'espace n'est libéré qu'au redémarrage du process.
- Des logs **structurés et échantillonnés** : on ne logue pas chaque position GPS, on publie une métrique (nombre de positions par minute).
- Le niveau de logs pilotable à chaud (variable relue ou endpoint d'administration), pour ne jamais redéployer juste pour passer en `debug`.
- Des logs centralisés hors du serveur (Loki, ou au minimum un export), car un serveur plein ne peut plus raconter sa propre panne.
- Une **partition ou un volume séparé** pour `/var/lib/docker`, afin qu'un emballement de logs ne bloque pas le système entier (SSH, journald, mises à jour).
- Un post-mortem court : chronologie, cause racine, trois actions avec un responsable et une date.
