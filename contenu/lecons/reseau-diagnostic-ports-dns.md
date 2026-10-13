---json
{"titre":"Diagnostiquer « le site ne répond pas » : ports, DNS et HTTP couche par couche","piste":"devops","module":"linux-reseau","niveau":2,"duree":20,"prerequis":["linux-services-systemd"],"objectifs":["Appliquer une méthode de diagnostic réseau du bas vers le haut (DNS → TCP → TLS → HTTP)","Savoir qui écoute sur quel port et sur quelle interface avec ss","Mesurer où se perd le temps d'une requête avec curl -w","Comprendre pourquoi un port publié par Docker peut contourner le pare-feu UFW"],"sources":[{"titre":"ss(8) — Linux manual page","url":"https://man7.org/linux/man-pages/man8/ss.8.html"},{"titre":"curl — manuel officiel","url":"https://curl.se/docs/manpage.html"},{"titre":"BIND 9 — pages de manuel (dig)","url":"https://bind9.readthedocs.io/en/latest/manpages.html"},{"titre":"Docker — Packet filtering and firewalls","url":"https://docs.docker.com/engine/network/packet-filtering-firewalls/"},{"titre":"MDN — Aperçu du protocole HTTP","url":"https://developer.mozilla.org/fr/docs/Web/HTTP/Guides/Overview"}],"liens":["linux-services-systemd","nextjs-frontiere-serveur-client"]}
---
## Pourquoi c'est important

Mardi, 14 h. Ticket de la cliente d'une agence web : « Notre nouveau site `app.example.com` ne marche pas chez moi, mais mon collègue y arrive. » Le développeur qui a fait la mise en ligne a déjà redémarré trois fois le conteneur, sans effet. Ton chef te demande : « C'est le DNS, le pare-feu, le certificat ou l'appli ? Je veux la réponse en 15 minutes, pas une intuition. »

« Le site ne répond pas » recouvre au moins six pannes différentes : nom qui ne se résout pas (ou vers la mauvaise IP), port fermé par un pare-feu, service qui écoute seulement sur `127.0.0.1`, certificat expiré, reverse proxy qui renvoie une 502, application lente. Redémarrer au hasard ne règle rien. Ce qui fait la différence, c'est une **méthode couche par couche** et quatre outils : `dig`, `ss`, `curl`, `journalctl`.

## Le concept

Une requête HTTPS, c'est **un colis qui passe quatre guichets dans l'ordre** :

1. **DNS** : « Quelle adresse pour `app.example.com` ? » → une IP.
2. **TCP** : « Y a-t-il quelqu'un qui décroche au port 443 de cette IP ? » → connexion établie, ou refusée (`Connection refused`), ou pas de réponse (timeout, souvent un pare-feu qui jette les paquets).
3. **TLS** : « Prouve-moi que tu es bien `app.example.com` » → certificat valide, pour ce nom, non expiré.
4. **HTTP** : « Donne-moi `/` » → un code (200, 301, 404, 502…) et un temps de réponse.

Si un guichet échoue, les suivants ne sont jamais atteints. Le diagnostic consiste donc à **trouver le premier guichet qui échoue**, en partant du bas.

Deux notions qui piègent tout le monde :

- **Adresse d'écoute** : un service qui écoute sur `127.0.0.1:3000` n'est joignable *que depuis la machine elle-même*. Sur `0.0.0.0:3000` (ou `[::]:3000`), il accepte les connexions de toutes les interfaces.
- **Refused vs timeout** : `Connection refused` = la machine répond « personne ici » (rien n'écoute). Un timeout = rien ne répond du tout : paquet filtré, mauvaise IP, ou route cassée.

## Exemple

**1. DNS** : que répond le monde, et que répond ma machine ?

```bash
dig +short app.example.com A          # IPv4 selon ton résolveur
dig +short app.example.com AAAA       # IPv6 (un AAAA faux casse le site pour une partie des visiteurs)
dig @1.1.1.1 +short app.example.com A # même question à un résolveur public
dig app.example.com A +noall +answer  # la réponse avec son TTL
```

Si deux résolveurs répondent différemment, tu tiens une piste (propagation, ancien enregistrement en cache jusqu'à expiration du TTL).

**2. Côté serveur : qui écoute, et où ?**

```bash
sudo ss -tlnp
# -t TCP, -l sockets en écoute, -n pas de résolution de noms, -p process propriétaire
```

Sortie typique :

```text
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      511          0.0.0.0:443        0.0.0.0:*     users:(("nginx",pid=812,fd=6))
LISTEN 0      511        127.0.0.1:3000       0.0.0.0:*     users:(("node",pid=1290,fd=21))
```

Lecture : Nginx est joignable de l'extérieur sur 443, Node seulement en local sur 3000 (c'est voulu : Nginx lui transmet les requêtes).

Filtrer sur un port :

```bash
sudo ss -tlnp 'sport = :3000'
```

**3. TCP + TLS + HTTP en une commande, avec le chronométrage** :

```bash
curl -sS -o /dev/null \
  -w 'dns=%{time_namelookup}s tcp=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s code=%{http_code}\n' \
  https://app.example.com/
```

Les temps sont **cumulés** depuis le début : si `tcp=0.03` et `ttfb=2.9`, c'est l'application (ou sa base) qui met près de 3 s à produire le premier octet, pas le réseau.

Voir le détail de la poignée de main TLS et des en-têtes :

```bash
curl -v https://app.example.com/ -o /dev/null 2>&1 | grep -E '^\* (Connected|SSL|Server certificate|expire)|^< HTTP'
```

Tester le serveur en court-circuitant le DNS (utile avant une bascule) :

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --resolve app.example.com:443:203.0.113.10 https://app.example.com/
```

**4. Le piège Docker + UFW.** Sur un VPS avec UFW actif, `docker run -p 5432:5432 postgres` publie le port 5432 **sur toutes les interfaces**, et Docker insère ses propres règles iptables : le trafic vers le conteneur peut passer même si UFW semble le bloquer. La documentation Docker le dit explicitement. La parade la plus simple : publier sur la boucle locale.

```bash
docker run -d -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=dev postgres:17
sudo ss -tlnp 'sport = :5432'   # doit montrer 127.0.0.1:5432, pas 0.0.0.0:5432
```

## À toi de jouer

Sur ton VPS :

1. Lance `sudo ss -tlnp` et classe chaque port en écoute dans un tableau : *service / interface (locale ou publique) / est-ce voulu ?* Tout port public que tu ne sais pas justifier est une faille potentielle.
2. Pour chaque port publié par un conteneur (`docker ps --format '{{.Names}} {{.Ports}}'`), vérifie s'il est lié à `0.0.0.0`. Depuis **ta machine locale** (pas le VPS), teste-le : `curl -m 5 -sS http://IP_DU_VPS:PORT/` ou `nc -vz -w 5 IP_DU_VPS PORT` si `nc` est installé. Conclus : UFW te protège-t-il vraiment ?
3. Choisis un de tes domaines. Mesure `dns / tcp / tls / ttfb` avec `curl -w` cinq fois de suite. Lequel varie le plus ? Formule une hypothèse.
4. Simule la panne du ticket : démarre le serveur Python de la leçon systemd sur `127.0.0.1:8081`, puis essaie de le joindre depuis l'extérieur. Note le message exact (`refused` ou timeout) et explique-le.

## Pièges courants

- **Conclure « c'est le DNS » sans `dig`** : vérifie la réponse réelle et le TTL avant d'accuser qui que ce soit.
- **Oublier l'IPv6** : un enregistrement `AAAA` qui pointe vers une IP morte casse le site pour les clients en IPv6 seulement, d'où les « ça marche chez mon collègue ».
- **Lire `ss` sans `-n`** : les ports s'affichent en noms (`https`, `postgresql`) et la résolution inverse ralentit la commande.
- **Lire `time_total` comme une durée réseau** : décompose avec les autres compteurs avant de conclure.
- **Croire que UFW filtre les ports Docker** : par défaut, un `-p HOTE:CONTENEUR` sans IP expose le port publiquement. Publie sur `127.0.0.1` et passe par un reverse proxy.
- **Tester depuis le serveur lui-même** : `curl localhost` qui marche ne prouve rien pour un visiteur externe. Teste toujours depuis l'extérieur aussi.

## Vérifie-toi

1. Un client reçoit `Connection refused` et un autre un timeout sur la même URL. Quelle hypothèse fais-tu pour chacun ?
2. Quelle commande te montre quel process écoute sur le port 3000, et comment sais-tu s'il est joignable depuis Internet ?
3. `curl -w` affiche `tcp=0.04s ttfb=3.10s`. Où cherches-tu le problème ensuite ? Pense aux plans d'exécution PostgreSQL (leçon `sql-explain-index`) : un TTFB élevé vient très souvent d'une requête lente côté base.
