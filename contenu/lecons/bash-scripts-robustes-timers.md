---json
{"titre":"Scripts Bash qui échouent bruyamment + planification avec les timers systemd","piste":"devops","module":"linux-reseau","niveau":2,"duree":20,"prerequis":["linux-services-systemd"],"objectifs":["Écrire un script Bash qui s'arrête à la première erreur au lieu de continuer en silence","Nettoyer les fichiers temporaires quoi qu'il arrive avec trap","Remplacer une ligne cron par un timer systemd journalisé et rattrapable","Faire relire ses scripts par ShellCheck"],"sources":[{"titre":"GNU Bash Reference Manual — The Set Builtin","url":"https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html"},{"titre":"GNU Bash Reference Manual — Bourne Shell Builtins (trap)","url":"https://www.gnu.org/software/bash/manual/html_node/Bourne-Shell-Builtins.html"},{"titre":"systemd.timer — page de manuel officielle","url":"https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html"},{"titre":"systemd.time — syntaxe OnCalendar","url":"https://www.freedesktop.org/software/systemd/man/latest/systemd.time.html"},{"titre":"ShellCheck — wiki des règles","url":"https://www.shellcheck.net/wiki/"}],"liens":["linux-services-systemd","sql-explain-index"]}
---
## Pourquoi c'est important

Un cabinet comptable te confie son serveur. Le jour où un disque lâche, tu demandes la dernière sauvegarde. Le script `backup.sh` tournait en cron chaque nuit depuis un an. Le dossier de destination contient bien 365 fichiers… dont les 200 derniers font **0 octet**. Le script de l'ancien prestataire faisait `cd /data/clients` (dossier renommé depuis), le `cd` a échoué, `tar` a archivé un dossier vide, et le script a continué comme si de rien n'était. Le cron n'envoyait ses mails à personne.

Un script de production doit **échouer bruyamment** : s'arrêter à la première erreur, dire laquelle, nettoyer derrière lui, et laisser une trace consultable. C'est ce qui sépare un « script qui marche chez moi » d'une brique d'exploitation fiable.

## Le concept

Par défaut, Bash est **un employé trop poli** : quand une commande échoue, il passe à la suivante sans rien dire. Les options de `set` le transforment en employé qui lève la main au premier problème :

| Option | Effet |
|---|---|
| `set -e` | quitte si une commande renvoie un code ≠ 0 (avec des exceptions : conditions de `if`, `&&`, `||`) |
| `set -u` | erreur si on lit une variable non définie (fini `rm -rf "$DOSSIER/"*` avec `DOSSIER` vide) |
| `set -o pipefail` | un pipeline échoue si **n'importe quelle** commande échoue, pas seulement la dernière |
| `set -E` | le piège `ERR` est hérité dans les fonctions |

`trap` attache une action à un événement : `EXIT` (fin du script, quelle qu'en soit la cause) pour nettoyer, `ERR` pour journaliser l'erreur.

Côté planification, le **timer systemd** est un cron qui tient un carnet : chaque exécution passe par une unité `.service`, donc a des logs dans `journalctl`, un code de retour visible dans `systemctl status`, et `Persistent=true` rattrape une exécution manquée si la machine était éteinte à l'heure prévue.

## Exemple

`/usr/local/bin/sauvegarde.sh` (testé avec Bash 5 et validé par ShellCheck) :

```bash
#!/usr/bin/env bash
# sauvegarde.sh SOURCE DESTINATION — archive datée + rotation
set -Eeuo pipefail

readonly SOURCE="${1:?usage: sauvegarde.sh SOURCE DESTINATION}"
readonly DEST="${2:?usage: sauvegarde.sh SOURCE DESTINATION}"
readonly RETENTION_JOURS="${RETENTION_JOURS:-7}"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"
readonly HORODATAGE

log() { printf '%s [sauvegarde] %s\n' "$(date --iso-8601=seconds)" "$*" >&2; }

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
trap 'log "ÉCHEC ligne $LINENO (code $?)"' ERR

[[ -d "$SOURCE" ]] || { log "source introuvable : $SOURCE"; exit 1; }
mkdir -p -- "$DEST"

archive="sauvegarde-${HORODATAGE}.tar.gz"
tar -czf "$tmp/$archive" -C "$(dirname -- "$SOURCE")" "$(basename -- "$SOURCE")"
tar -tzf "$tmp/$archive" > /dev/null           # l'archive est-elle lisible ?
mv -- "$tmp/$archive" "$DEST/"
log "archive créée : $DEST/$archive ($(du -h -- "$DEST/$archive" | cut -f1))"

find "$DEST" -maxdepth 1 -name 'sauvegarde-*.tar.gz' -mtime "+$RETENTION_JOURS" -print -delete \
  | while read -r f; do log "supprimée : $f"; done
```

Points à remarquer :

- `${1:?message}` : si l'argument manque, Bash s'arrête avec ce message (et un code ≠ 0).
- Toutes les variables sont **entre guillemets** : un chemin avec espace ne casse rien.
- `--` avant les chemins : un fichier nommé `-rf` ne sera pas pris pour une option.
- L'archive est construite dans un dossier temporaire, **vérifiée**, puis déplacée : jamais de fichier à moitié écrit dans la destination.
- `HORODATAGE` est assigné puis marqué `readonly` séparément : ShellCheck (règle SC2155) signale que `readonly X="$(cmd)"` masque le code de retour de `cmd`.

Tester les cas d'erreur avant de planifier :

```bash
./sauvegarde.sh                       # argument manquant → message d'usage, code 1
./sauvegarde.sh /n/existe/pas /tmp/b  # source introuvable → code 1
./sauvegarde.sh /srv/demo /tmp/b; echo "code=$?"
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable sauvegarde.sh
```

Planification : `/etc/systemd/system/sauvegarde.service`

```ini
[Unit]
Description=Sauvegarde quotidienne de /srv/demo

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sauvegarde.sh /srv/demo /var/backups/demo
```

`/etc/systemd/system/sauvegarde.timer`

```ini
[Unit]
Description=Planifie la sauvegarde quotidienne

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemd-analyze calendar '*-*-* 03:30:00'   # affiche la prochaine échéance
sudo systemctl daemon-reload
sudo systemctl enable --now sauvegarde.timer   # on active le TIMER, pas le service
systemctl list-timers sauvegarde.timer         # prochaine et dernière exécution
sudo systemctl start sauvegarde.service        # exécution immédiate pour tester
journalctl -u sauvegarde.service -n 20         # les lignes écrites par log()
```

## À toi de jouer

1. Écris `sauvegarde.sh`, puis provoque **trois** échecs différents (argument manquant, source absente, destination non inscriptible). Pour chacun, note le code de sortie et le message. Aucun ne doit laisser de fichier dans la destination.
2. Supprime `set -o pipefail`, puis exécute `false | true; echo $?` dans un script avec et sans cette option. Explique la différence en une phrase.
3. Installe le service et le timer sur ton VPS pour sauvegarder un vrai dossier (par exemple la configuration de n8n). Vérifie avec `systemctl list-timers` puis lance une exécution manuelle et lis le journal.
4. Bonus « restauration » : une sauvegarde qui n'a jamais été restaurée n'existe pas. Restaure la dernière archive dans `/tmp/restauration` et compare avec `diff -r`.

## Pièges courants

- **`set -e` n'est pas magique** : il ne se déclenche pas dans la condition d'un `if`, ni à gauche d'un `&&` / `||`. `cd /dossier && tar ...` qui échoue sur le `cd` ne fait pas quitter le script. Vérifie explicitement ce qui compte.
- **Oublier les guillemets** : `rm -rf $DOSSIER/*` avec un espace ou une variable vide est un classique de la catastrophe.
- **Activer le `.service` au lieu du `.timer`** : il faut `enable --now sauvegarde.timer`. Le service, lui, n'a pas de section `[Install]`.
- **Cron sans environnement** : cron et systemd lancent tes scripts avec un `PATH` minimal et sans ton `.bashrc`. Utilise des chemins absolus ou fixe le `PATH` en tête de script.
- **Pas de test de restauration** : une archive corrompue ou vide ne se découvre que le jour où on en a besoin. D'où le `tar -tzf` dans le script.
- **Secrets en argument de commande** : ils apparaissent dans `ps` et dans le journal. Passe-les par un fichier `EnvironmentFile=` en `chmod 600`.

## Vérifie-toi

1. Que fait exactement `set -o pipefail`, et quelle panne évite-t-il dans `pg_dump base | gzip > base.sql.gz` ?
2. Pourquoi `trap '...' EXIT` est-il plus fiable qu'une ligne `rm -rf "$tmp"` placée en fin de script ?
3. Cite deux avantages concrets d'un timer systemd sur une ligne crontab, en lien avec ce que tu as appris sur `journalctl` dans la leçon `linux-services-systemd`.
