---json
{"titre":"Faire tourner un service proprement avec systemd","piste":"devops","module":"linux-reseau","niveau":2,"duree":20,"prerequis":[],"objectifs":["Écrire un fichier d'unité systemd qui redémarre tout seul en cas de crash","Lire et filtrer les logs d'un service avec journalctl","Durcir un service (utilisateur dédié, système de fichiers en lecture seule) et mesurer le résultat avec systemd-analyze security"],"sources":[{"titre":"systemd.service — page de manuel officielle","url":"https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html"},{"titre":"systemd.exec — options d'exécution et de sandboxing","url":"https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html"},{"titre":"journalctl — page de manuel officielle","url":"https://www.freedesktop.org/software/systemd/man/latest/journalctl.html"},{"titre":"systemctl — page de manuel officielle","url":"https://www.freedesktop.org/software/systemd/man/latest/systemctl.html"}],"liens":["bash-scripts-robustes-timers","reseau-diagnostic-ports-dns"]}
---
## Pourquoi c'est important

Lundi, 8 h 40. Le responsable logistique d'une PME de livraison t'appelle : « Le portail de suivi des colis est mort depuis ce week-end, les chauffeurs n'ont pas leurs tournées. » Tu te connectes au VPS. Le backend Node avait été lancé à la main il y a trois mois par un prestataire, avec `nohup node server.js &`. Samedi, l'hébergeur a redémarré la machine pour un correctif noyau. Personne n'a relancé le process. Aucun log, aucune alerte, deux jours de perte d'activité.

La correction prend dix minutes, et c'est le sujet de cette leçon : une **unité systemd**. En entreprise, tout ce qui tourne « hors conteneur » (reverse proxy, agent de monitoring, runner CI, Ollama, le démon Docker lui-même) est géré par systemd. En astreinte comme en entretien, on te posera toujours les trois mêmes questions : *qu'est-ce qui relance le service s'il plante ? où sont ses logs ? avec quels droits tourne-t-il ?* Tu dois pouvoir y répondre en une commande chacune.

## Le concept

**systemd est le chef d'orchestre du système** : c'est le premier process lancé au démarrage (PID 1), et il démarre, surveille et arrête tout le reste.

Analogie : pense à un **régisseur de théâtre**. Chaque acteur (service) a une *fiche* (le fichier d'unité) qui dit : quand il entre en scène (`After=`, `WantedBy=`), quelle est sa réplique (`ExecStart=`), quoi faire s'il s'effondre (`Restart=`), et dans quelle loge il a le droit d'aller (`User=`, `ProtectSystem=`…). Le régisseur note tout ce que disent les acteurs dans un cahier central : le **journal** (`journalctl`).

Les notions clés :

- **Unité** : un objet géré par systemd. Les plus courantes : `.service` (un process), `.timer` (une planification), `.socket`, `.target` (un groupe d'unités, comme `multi-user.target` = « système démarré en mode serveur »).
- **Sections d'un `.service`** : `[Unit]` (description, dépendances d'ordre), `[Service]` (comment lancer et surveiller), `[Install]` (à quel moment l'activer au boot).
- **`enable` ≠ `start`** : `start` lance maintenant ; `enable` crée le lien pour lancer au prochain boot. `enable --now` fait les deux.
- **Où mettre ses fichiers** : `/etc/systemd/system/` pour tes unités. `/usr/lib/systemd/system/` (ou `/lib/systemd/system/` selon la distrib) appartient aux paquets : on n'y touche pas, on surcharge avec `systemctl edit`.
- **Sandboxing** : systemd peut enfermer un service (utilisateur éphémère, `/usr` et `/etc` en lecture seule, `/tmp` privé) sans Docker, juste avec des options dans `[Service]`.

## Exemple

On sert un dossier statique avec le serveur HTTP intégré à Python, écoutant **uniquement en local** (un reverse proxy comme Nginx ou Caddy l'exposerait ensuite).

```bash
sudo mkdir -p /srv/demo
echo "<h1>Bonjour depuis systemd</h1>" | sudo tee /srv/demo/index.html
```

Fichier `/etc/systemd/system/demo-http.service` :

```ini
[Unit]
Description=Serveur HTTP de démonstration (Socle)
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
ExecStart=/usr/bin/python3 -m http.server 8081 --bind 127.0.0.1 --directory /srv/demo
# Utilisateur éphémère créé au démarrage, détruit à l'arrêt
DynamicUser=yes
# Relance si le process sort avec une erreur ou est tué par un signal
Restart=on-failure
RestartSec=2
# Durcissement
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

Cycle de vie :

```bash
sudo systemd-analyze verify /etc/systemd/system/demo-http.service  # valide la syntaxe
sudo systemctl daemon-reload            # relit les fichiers d'unité modifiés
sudo systemctl enable --now demo-http   # active au boot + démarre
systemctl status demo-http              # état, PID, dernières lignes de log
curl -s http://127.0.0.1:8081/          # doit renvoyer le <h1>
```

Les logs, sans jamais chercher un fichier `.log` :

```bash
journalctl -u demo-http -f                     # suivre en direct (comme tail -f)
journalctl -u demo-http --since "10 min ago"   # fenêtre de temps
journalctl -u demo-http -p err -b              # erreurs seulement, depuis le dernier boot
journalctl -u demo-http -o json-pretty -n 1    # une entrée avec tous ses champs
```

Prouver que le redémarrage automatique marche :

```bash
sudo systemctl kill -s SIGKILL demo-http   # simule un crash brutal
sleep 3
systemctl status demo-http                 # nouveau PID : systemd l'a relancé
```

Mesurer le durcissement (score d'exposition de 0 à 10, plus bas = mieux) :

```bash
systemd-analyze security demo-http.service
```

Modifier une unité sans toucher au fichier d'origine (indispensable pour les services installés par un paquet) :

```bash
sudo systemctl edit demo-http      # crée un drop-in override.conf
sudo systemctl cat demo-http       # affiche l'unité + ses surcharges
```

## À toi de jouer

Sur ton VPS (ou une VM locale) :

1. Déploie `demo-http` comme ci-dessus. Note le score donné par `systemd-analyze security demo-http.service`.
2. Ajoute au moins trois options de durcissement documentées dans `systemd.exec` (pistes : `PrivateDevices=`, `ProtectKernelTunables=`, `RestrictAddressFamilies=AF_INET AF_INET6`, `MemoryMax=` côté ressources dans `systemd.resource-control`) via `systemctl edit`. Relance, vérifie que `curl` répond toujours, et compare le score.
3. Casse volontairement `ExecStart=` (un chemin qui n'existe pas). Retrouve le message d'erreur exact **uniquement** avec `systemctl status` et `journalctl`, puis répare.
4. Bonus : liste les services qui ont échoué sur ton serveur avec `systemctl --failed`. S'il y en a, explique pourquoi en lisant leur journal.

Nettoyage : `sudo systemctl disable --now demo-http && sudo rm /etc/systemd/system/demo-http.service && sudo systemctl daemon-reload`.

## Pièges courants

- **Oublier `daemon-reload`** après avoir modifié un fichier d'unité : systemd continue d'utiliser l'ancienne version (il te prévient d'ailleurs dans `systemctl status`).
- **Mettre `&` ou `nohup` dans `ExecStart=`** : systemd gère déjà le process au premier plan. Si ton programme se « démonise » lui-même (fork), il faut `Type=forking` — mais préfère toujours un mode premier plan.
- **`After=` n'implique pas `Wants=`** : `After=` règle l'ordre, pas la dépendance. Sans `Wants=`/`Requires=`, l'unité citée peut ne jamais être démarrée.
- **Variables d'environnement** : un service ne voit pas ton `.bashrc`. Utilise `Environment=` ou `EnvironmentFile=` (et un fichier en `chmod 600` pour les secrets, jamais en clair dans l'unité versionnée).
- **`Restart=always` sur un programme qui plante au démarrage** : systemd abandonne après plusieurs échecs rapprochés (`StartLimitBurst=`/`StartLimitIntervalSec=` dans `[Unit]`). Le service apparaît alors en `failed` : lis le journal, ne te contente pas de relancer.
- **Modifier un fichier sous `/usr/lib/systemd/system/`** : il sera écrasé à la prochaine mise à jour du paquet. Utilise `systemctl edit`.

## Vérifie-toi

1. Quelle est la différence entre `systemctl enable` et `systemctl start`, et que fait `enable --now` ?
2. Ton service a crashé cette nuit à 3 h. Quelle commande exacte te donne uniquement ses messages d'erreur depuis le dernier démarrage de la machine ?
3. Pourquoi `DynamicUser=yes` + `ProtectSystem=strict` réduisent-ils l'impact d'une faille dans ton application ? Relie ta réponse au principe de moindre privilège que tu retrouveras dans les conteneurs (utilisateur non-root dans un Dockerfile).
