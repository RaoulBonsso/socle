---json
{"titre":"Samedi matin, « Votre connexion n'est pas privée » : le certificat TLS a expiré","date":"2026-10-16","piste":"devops","difficulte":2,"duree":60,"contexte":"Un cabinet de kinésithérapie (5 praticiens) prend ses rendez-vous via un site Next.js derrière Nginx, sur un VPS Ubuntu. Certificat Let's Encrypt obtenu avec certbot il y a un an par un prestataire.","competences":["Vérifier un certificat distant avec openssl","Lire l'état et les journaux du renouvellement certbot","Relier un échec de renouvellement à une règle de pare-feu","Mettre en place une surveillance d'expiration"],"livrable":"Ce qu'il faut soumettre : 1) tes hypothèses classées, 2) les commandes de diagnostic et ce qu'elles prouvent, 3) les changements (pare-feu, Nginx, hook de rechargement), 4) le script de surveillance d'expiration et sa planification.","indices":["Commence par prouver la date d'expiration vue par un visiteur, depuis l'extérieur, plutôt que de faire confiance aux fichiers du serveur.","Le renouvellement est tenté régulièrement par un timer. Lis son journal : le message d'erreur nomme le problème.","Le défi HTTP-01 de Let's Encrypt passe obligatoirement par le port 80. Quelqu'un a « durci » le pare-feu en août."],"criteres":["La date d'expiration est prouvée avec openssl s_client depuis l'extérieur","Le message « Timeout during connect (likely firewall problem) » est relié à la fermeture du port 80","Le port 80 est rouvert et Nginx redirige vers HTTPS tout en servant /.well-known/acme-challenge/","Le renouvellement est validé avec certbot renew --dry-run avant le renouvellement réel","Un hook de déploiement recharge Nginx après chaque renouvellement réussi","Une alerte se déclenche au moins 14 jours avant toute expiration"],"lecons":["reseau-diagnostic-ports-dns","linux-services-systemd","bash-scripts-robustes-timers"],"sources":[{"titre":"Let's Encrypt — Challenge Types","url":"https://letsencrypt.org/docs/challenge-types/"},{"titre":"Certbot — User Guide (renouvellement, hooks)","url":"https://eff-certbot.readthedocs.io/en/stable/using.html"},{"titre":"OpenSSL — openssl-x509 (option -checkend)","url":"https://docs.openssl.org/master/man1/openssl-x509/"},{"titre":"OpenSSL — openssl-s_client","url":"https://docs.openssl.org/master/man1/openssl-s_client/"},{"titre":"nginx — Configuring HTTPS servers","url":"https://nginx.org/en/docs/http/configuring_https_servers.html"}]}
---
## La situation

Samedi, 8 h 05. La secrétaire du cabinet t'envoie une capture d'écran : Chrome affiche « Votre connexion n'est pas privée — NET::ERR_CERT_DATE_INVALID ». Les patients ne peuvent plus prendre rendez-vous, et certains appellent pour demander si le site a été piraté. Le samedi matin représente un tiers des prises de rendez-vous de la semaine.

Le prestataire qui a installé le serveur ne répond plus. Tu as un accès SSH et `sudo`.

## Ce que tu as sous la main

Depuis ta machine :

```console
$ curl -sS https://rdv.cabinet.example.com/ -o /dev/null
curl: (60) SSL certificate problem: certificate has expired
```

Sur le serveur :

```console
$ sudo certbot certificates
Found the following certs:
  Certificate Name: rdv.cabinet.example.com
    Domains: rdv.cabinet.example.com
    Expiry Date: 2026-10-16 23:41:07+00:00 (INVALID: EXPIRED)
    Certificate Path: /etc/letsencrypt/live/rdv.cabinet.example.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/rdv.cabinet.example.com/privkey.pem

$ systemctl list-timers | grep -i certbot
Sat 2026-10-17 11:52:00 CEST  3h 47min  Sat 2026-10-17 00:12:31 CEST  7h ago  certbot.timer  certbot.service

$ sudo ufw status
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

Extrait de `/var/log/letsencrypt/letsencrypt.log` (identique depuis fin septembre, deux fois par jour) :

```text
2026-10-17 00:12:44,102:INFO:certbot._internal.auth_handler:Challenge failed for domain rdv.cabinet.example.com
2026-10-17 00:12:44,103:INFO:certbot._internal.auth_handler:http-01 challenge for rdv.cabinet.example.com
2026-10-17 00:12:44,104:ERROR:certbot._internal.auth_handler:  Domain: rdv.cabinet.example.com
  Type:   connection
  Detail: 198.51.100.24: Fetching http://rdv.cabinet.example.com/.well-known/acme-challenge/kZ3o…: Timeout during connect (likely firewall problem)
```

L'historique de commandes de l'ancien prestataire, en août :

```text
  412  sudo ufw delete allow 80/tcp   # on ne sert qu'en HTTPS, durcissement
  413  sudo ufw status
```

La configuration Nginx actuelle ne contient qu'un bloc `server { listen 443 ssl; … }`.

## Ta mission

1. Avant de toucher à quoi que ce soit, écris tes hypothèses classées sur la cause racine.
2. Donne les commandes de diagnostic et ce que chacune prouve. Pourquoi la vérification depuis l'extérieur est-elle indispensable ?
3. Rétablis le service le plus vite possible, en vérifiant le renouvellement avant de le lancer pour de vrai.
4. Le certificat renouvelé est sur le disque, mais le navigateur affiche toujours l'ancien. Pourquoi, et comment l'éviter à chaque renouvellement ?
5. Comment être prévenu deux semaines avant la prochaine fois, quelle que soit la cause ?

===CORRECTION===
## Diagnostic

Ordre de probabilité : (1) le renouvellement automatique échoue depuis des semaines ; (2) le certificat est renouvelé mais Nginx sert encore l'ancien (pas de rechargement) ; (3) l'horloge du serveur ou du client est fausse. Les éléments éliminent vite (2) et (3) : `certbot certificates` dit lui-même `EXPIRED`, donc le fichier sur disque n'a pas été renouvelé.

Preuves, du point de vue d'un visiteur :

```bash
echo | openssl s_client -connect rdv.cabinet.example.com:443 -servername rdv.cabinet.example.com 2>/dev/null \
  | openssl x509 -noout -subject -enddate
# notAfter=Oct 16 23:41:07 2026 GMT
```

`-servername` envoie le SNI : sans lui, un serveur qui héberge plusieurs sites peut présenter un autre certificat.

Pourquoi le renouvellement échoue : le défi **HTTP-01** de Let's Encrypt va chercher un fichier sur `http://domaine/.well-known/acme-challenge/…`, et la documentation Let's Encrypt précise qu'il ne peut se faire **que sur le port 80**. Le port 80 a été fermé dans UFW en août. Le timer `certbot.timer` tourne bien deux fois par jour, mais chaque tentative finit en `Timeout during connect (likely firewall problem)`. Personne ne lit ce journal, et le certificat expire.

On le confirme depuis l'extérieur (méthode de la leçon `reseau-diagnostic-ports-dns`) :

```bash
curl -m 5 -sS -o /dev/null -w '%{http_code}\n' http://rdv.cabinet.example.com/
# curl: (28) Connection timed out  → paquets jetés par le pare-feu, pas « refused »
```

## Solution

1. Rouvrir le port 80 et le faire servir correctement : le défi ACME, plus une redirection vers HTTPS pour tout le reste.

```bash
sudo ufw allow 80/tcp
```

```nginx
# /etc/nginx/sites-available/rdv.conf — bloc ajouté
server {
    listen 80;
    listen [::]:80;
    server_name rdv.cabinet.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

```bash
sudo mkdir -p /var/www/letsencrypt
sudo nginx -t && sudo systemctl reload nginx
```

Le chemin `root` doit correspondre à la méthode de validation enregistrée pour ce certificat dans `/etc/letsencrypt/renewal/rdv.cabinet.example.com.conf` (par exemple `authenticator = webroot` avec ce dossier, ou `authenticator = nginx`, auquel cas le plugin gère lui-même le bloc). Lis ce fichier avant de choisir.

2. Tester, puis renouveler :

```bash
sudo certbot renew --dry-run          # serveur de test de Let's Encrypt, ne touche pas au certificat
sudo certbot renew                    # renouvellement réel
sudo certbot certificates             # nouvelle date d'expiration
```

3. Faire servir le nouveau certificat : Nginx lit les certificats **au démarrage ou au rechargement**. Sans rechargement, il continue de présenter l'ancien, même renouvelé sur disque. Le correctif durable est un hook de déploiement, exécuté après chaque renouvellement réussi :

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/recharger-nginx.sh > /dev/null <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/recharger-nginx.sh
sudo systemctl reload nginx           # pour cette fois
```

Attention : un `--dry-run` n'exécute pas les hooks de déploiement, sauf avec `--run-deploy-hooks`.

4. Surveiller l'expiration **de l'extérieur**, indépendamment de certbot :

```bash
#!/usr/bin/env bash
# /usr/local/bin/verifier-certificat.sh DOMAINE [JOURS]
set -Eeuo pipefail
domaine="${1:?usage: verifier-certificat.sh DOMAINE [JOURS]}"
jours="${2:-14}"
if ! echo | openssl s_client -connect "${domaine}:443" -servername "$domaine" 2>/dev/null \
     | openssl x509 -noout -checkend $(( jours * 86400 )) > /dev/null; then
  echo "ALERTE : le certificat de $domaine expire dans moins de $jours jours (ou est illisible)" >&2
  exit 1
fi
```

`openssl x509 -checkend N` renvoie un code non nul si le certificat expire dans les N secondes. Planifié chaque jour avec un timer systemd (leçon `bash-scripts-robustes-timers`), l'échec apparaît dans `systemctl --failed` et peut déclencher un webhook d'alerte.

## Pourquoi ça arrive en vrai

- Le renouvellement automatique fonctionne des mois sans que personne n'y pense, puis une modification sans rapport apparent (pare-feu, migration, changement de DNS, nouveau reverse proxy) le casse **silencieusement**.
- Le « durcissement » a été fait sans connaître les dépendances : fermer le port 80 semblait logique pour un site « 100 % HTTPS ».
- Les messages d'échec existent (journal certbot, parfois les emails d'expiration), mais personne ne les lit.

## Ce qu'un senior ferait en plus

- Si le port 80 doit vraiment rester fermé (politique de sécurité), passer au défi **DNS-01** avec un plugin DNS de l'hébergeur : il ne dépend d'aucun port entrant et permet aussi les certificats wildcard.
- Surveiller l'expiration depuis un **service externe** (sonde de disponibilité qui vérifie le TLS) : un script sur le serveur ne voit pas ce que voient les visiteurs si le DNS ou un CDN change.
- Inventorier tous les certificats de l'organisation (domaines, sous-domaines, API internes) avec leur date d'expiration et leur méthode de renouvellement.
- Considérer **Caddy**, qui gère l'obtention et le renouvellement HTTPS automatiquement, pour ce type de petit site.
- Documenter les dépendances réseau du serveur (« le port 80 sert au renouvellement TLS ») à côté des règles de pare-feu, pour que le prochain « durcissement » ne recasse pas tout.
