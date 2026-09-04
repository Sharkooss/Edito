# Edito

Éditeur audio multi-pistes mono-utilisateur : import, découpe, montage, enregistrement micro et export mixdown.

## Utilisation

**Importer** — bouton « Importer un son » ou glisser-déposer. Plusieurs fichiers à la fois sont acceptés ; chacun arrive sur sa propre piste, à la tête de lecture, sans jamais se superposer à un clip existant.

**Découper** — passer en mode Lame (`C`) : un trait suit le curseur et le clic coupe le clip exactement là. Sinon « Couper ici » (`S`) coupe à la tête de lecture, sur la sélection ou sur les clips traversés.

**Monter** — en mode Sélection (`V`), glisser un clip le déplace dans le temps *et* d'une piste à l'autre. Une position qui chevaucherait un voisin est recalée sur l'espace libre le plus proche. Les bords rognent, les coins orange règlent les fondus, le clic droit ouvre le menu. `Alt` désactive l'aimantation.

**Enregistrer** — armer une piste avec son bouton `Rec` : son vumètre devient live, ce qui permet de vérifier le micro *avant* de lancer. Le bouton Enregistrer déclenche alors un décompte 3-2-1 puis capture depuis la tête de lecture sur la piste armée. La piste reste armée pour une reprise.

**Exporter** — « Exporter le mixdown » produit un WAV 44,1 kHz stéréo avec gains de clip, fondus, volumes, panoramiques et solo/muet appliqués.

Le projet est sauvegardé automatiquement.

### Raccourcis

| Touche | Action |
|---|---|
| `Espace` | Lecture / pause |
| `V` / `C` | Outil Sélection / Lame |
| `S` | Couper à la tête de lecture |
| `Suppr` | Supprimer la sélection |
| `Ctrl+D` | Dupliquer |
| `Ctrl+A` | Tout sélectionner |
| `Ctrl+Z` / `Ctrl+Maj+Z` | Annuler / Rétablir |
| `Alt` (maintenu) | Désactiver l'aimantation |

## Documentation

- Spec v2 : `docs/superpowers/specs/2026-09-04-edito-v2-editing-core-design.md`
- Plan v2 : `docs/superpowers/plans/2026-09-04-edito-v2-editing-core.md`
- Spec v1 : `docs/superpowers/specs/2026-09-03-edito-audio-editor-design.md`

## Développement local

```bash
npm install
npm run dev:server   # Fastify sur :3000
npm run dev:web      # Vite sur :5173 (proxy /api -> :3000)
```

## Déploiement sur le VPS

```bash
cd /srv/docker/apps/edito
git clone https://github.com/Sharkooss/Edito.git .   # première fois seulement
cp .env.example .env
nano .env   # renseigner APP_DOMAIN, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD_HASH
docker compose up -d --build
docker compose logs -f
```

Générer le hash de mot de passe Basic Auth :

```bash
htpasswd -nB $BASIC_AUTH_USER
# copier le hash produit dans .env, en doublant chaque "$" en "$$"
```

### Variables d'environnement obligatoires

| Variable | Description |
|---|---|
| `APP_DOMAIN` | Domaine public, ex. `edito.louis-nectoux.fr` |
| `BASIC_AUTH_USER` | Identifiant de connexion |
| `BASIC_AUTH_PASSWORD_HASH` | Hash bcrypt (`htpasswd -nB`), `$` doublés |

### Port interne

L'app écoute sur le port `3000` dans le conteneur (`traefik...loadbalancer.server.port=3000`).

### Volumes

- `edito_data` → `/data` dans le conteneur : contient `edito.db` (SQLite) et `uploads/` (fichiers audio). À sauvegarder régulièrement (`docker run --rm -v edito_data:/data -v $PWD:/backup alpine tar czf /backup/edito-data.tar.gz -C /data .`).

## Déploiement continu

Le workflow `.github/workflows/deploy.yml` se déclenche sur push sur `main` et exécute `git pull && docker compose up -d --build` sur le VPS via SSH. Secrets GitHub requis : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT` (optionnel, def. 22).
