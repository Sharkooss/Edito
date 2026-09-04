# Edito

Éditeur audio multi-pistes mono-utilisateur (import, cut, multi-pistes, enregistrement micro, export mixdown).

- Spec: `docs/superpowers/specs/2026-09-03-edito-audio-editor-design.md`
- Plan: `docs/superpowers/plans/2026-09-03-edito-v1-implementation.md`

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
