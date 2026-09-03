# Edito — Éditeur audio web (v1) — Design

- Date: 2026-09-03
- Statut: Approuvé pour passage en plan d'implémentation
- Repo: https://github.com/Sharkooss/Edito
- Domaine cible: edito.louis-nectoux.fr
- VPS: 92.222.247.229 (Docker + Traefik, réseau externe `web`)

## 1. Contexte et objectif

Louis veut un site web perso pour faire du montage audio (puis, dans un second
temps hors scope de cette spec, du montage vidéo), typiquement pour du game
design (bruitages, voix, ambiances). Besoin : importer des sons, les
couper/organiser sur plusieurs pistes, enregistrer sa propre voix/sons au
micro, et exporter un mixdown final. L'app doit être déployée sur son VPS
Docker existant, derrière Traefik, en HTTPS automatique, avec déploiement
continu via GitHub Actions.

Le montage vidéo (v2) n'est pas traité dans cette spec — seulement mentionné
en roadmap pour ne pas fermer de portes architecturales inutilement.

## 2. Périmètre du MVP (v1)

Inclus :
- Import de fichiers audio (drag & drop + sélecteur), formats courants
  (wav, mp3, ogg, m4a).
- Multi-pistes illimitées (dans la limite raisonnable du navigateur) :
  ajouter/supprimer une piste, réordonner.
- Placer, déplacer, couper (split), trimmer (raccourcir par les bords),
  supprimer des clips sur la timeline.
- Lecture synchronisée de toutes les pistes, avec transport
  (play/pause/stop, curseur de lecture, seek au clic sur la timeline).
- Par piste : volume, pan, mute, solo.
- Enregistrement micro directement dans le navigateur, le résultat devient
  un nouveau clip déposable sur une piste.
- Export / mixdown : rendu de l'ensemble du projet en un seul fichier audio
  téléchargeable (WAV en priorité, MP3 en option si le temps le permet).
- Un seul projet actif à la fois, avec sauvegarde automatique côté serveur
  (pas de gestion de plusieurs projets nommés en v1).
- Undo/redo sur les actions d'édition (couper, déplacer, supprimer, etc.).
- Zoom horizontal de la timeline, raccourcis clavier de base (espace =
  play/pause, suppr = supprimer clip sélectionné, ctrl+z/y = undo/redo).

Explicitement hors scope v1 (backlog v1.1+) :
- Gestion de plusieurs projets nommés / bibliothèque de projets.
- Effets audio avancés (EQ, reverb, compression, fade courbés).
- Montage vidéo.
- Partage public d'un projet, collaboration multi-utilisateurs.
- Formats d'export supplémentaires adaptés au jeu vidéo (loop points, etc.).

## 3. Architecture

Une seule application composée de deux parties déployées dans **un seul
conteneur Docker** :

```
┌─────────────────────────────────────────┐
│              Conteneur "app"             │
│                                           │
│  Frontend (React SPA, buildé en static)  │
│    servi par le backend Fastify          │
│                                           │
│  Backend (Node.js + Fastify)             │
│    - API REST (projet, pistes, clips)    │
│    - Upload / stockage fichiers audio    │
│    - SQLite (métadonnées)                │
│                                           │
│  Volume "data": /data                    │
│    /data/db.sqlite                       │
│    /data/uploads/*.wav|mp3|...           │
└─────────────────────────────────────────┘
              ▲
              │ HTTPS (Traefik, Let's Encrypt)
              │ + Basic Auth (middleware Traefik)
              │
     edito.louis-nectoux.fr
```

Pas de conteneur base de données séparé : SQLite en fichier sur le volume
suffit largement pour un usage mono-utilisateur, et simplifie l'ops
(un seul conteneur applicatif à surveiller/sauvegarder).

### 3.1 Frontend

- **React 18 + TypeScript + Vite**.
- **Tailwind CSS + shadcn/ui** (composants Radix stylés, accessibles,
  personnalisables) pour une UI soignée rapidement — thème dark "studio
  pro" (fond très sombre, accents colorés vifs par piste, inspiré
  Ableton/Reaper/Figma).
- **wavesurfer.js** (+ plugin Regions) pour l'affichage des waveforms, le
  drag/trim des clips et la sélection de régions à couper.
- **Web Audio API** natif pour le moteur de lecture multi-pistes
  (un `AudioContext`, un graphe de nœuds `GainNode`/`StereoPannerNode` par
  piste) et pour le mixdown final via `OfflineAudioContext`.
- **MediaRecorder API** pour l'enregistrement micro.
- Gestion d'état : **Zustand** (léger, adapté à un état de type "timeline
  d'édition" avec beaucoup de mutations locales) + historique undo/redo
  maison (pile de snapshots/commandes).
- Sauvegarde : debounce des changements → PATCH vers l'API toutes les
  quelques secondes / au blur, plus un bouton "Sauvegarder" explicite.

### 3.2 Backend

- **Node.js + Fastify** (rapide, TypeScript-friendly, faible overhead).
- **better-sqlite3** pour la persistance des métadonnées.
- Endpoints principaux :
  - `GET /api/project` — récupérer l'état complet du projet actif
    (pistes, clips, paramètres).
  - `PATCH /api/project` — sauvegarder l'état du projet (upsert pistes/
    clips).
  - `POST /api/media` — upload d'un fichier audio (import ou
    enregistrement micro) → stocké dans `/data/uploads`, retourne un id +
    métadonnées (durée, nom).
  - `GET /api/media/:id` — streaming du fichier audio (avec support
    `Range` pour le seek).
  - `DELETE /api/media/:id` — suppression d'un média non référencé.
  - `GET /healthz` — healthcheck.
- Fichiers audio nommés par hash/UUID sur disque, jamais exposés par leur
  nom d'origine directement (évite les collisions et les soucis
  d'encodage de noms de fichiers).
- Pas de couche d'auth applicative : l'app fait confiance à Traefik pour
  n'être joignable qu'après Basic Auth.

### 3.3 Modèle de données (SQLite)

```
project(id, name, sample_rate, created_at, updated_at)
track(id, project_id, name, order_index, color, volume, pan, muted, soloed)
clip(id, track_id, media_id, start_time, source_offset, duration, name)
media(id, original_filename, stored_filename, duration, sample_rate,
      created_at)
```

Une seule ligne `project` existe en v1 (le "projet actif"). Le schéma
reste toutefois normalisé proprement pour ne pas bloquer l'ajout de
multi-projets en v1.1 (ajouter juste un `project_id` sélectionnable, la
structure ne change pas).

## 4. Auth & sécurité

- **Basic Auth au niveau Traefik** via le middleware
  `traefik.http.middlewares.edito-auth.basicauth.users`, appliqué au
  router du service `app`. Identifiants définis via variables d'env
  (`.env`, jamais commit).
- HTTPS forcé via le resolver `letsencrypt` existant.
- Validation des uploads : whitelist d'extensions/types MIME audio,
  limite de taille par fichier (ex. 100 Mo), limite de taille totale du
  volume surveillée manuellement (pas de quota automatique en v1).
- Pas de compte utilisateur, pas de JWT, pas de rôles — un seul
  utilisateur (Louis) en v1.

## 5. Déploiement

### 5.1 Docker

- `Dockerfile` multi-stage :
  1. Stage `frontend-build` : installe les deps, build Vite → `dist/`.
  2. Stage `backend-build` : installe les deps backend, compile
     TypeScript.
  3. Stage final : image Node slim, copie le build backend + le `dist/`
     frontend (servi en statique par Fastify via `@fastify/static`),
     écoute sur `0.0.0.0:3000`.
- `.dockerignore` : `node_modules`, `dist`, `.git`, `data/`.
- `compose.yaml` : service unique `app`, `restart: unless-stopped`,
  volume nommé `edito_data:/data`, réseau `web` (externe), labels
  Traefik (routeur HTTPS + middleware basic auth), healthcheck sur
  `/healthz`.
- `.env.example` avec `APP_DOMAIN`, `BASIC_AUTH_USER`,
  `BASIC_AUTH_PASSWORD_HASH` (hash htpasswd, généré via
  `htpasswd -nB user`), `NODE_ENV`.

### 5.2 CI/CD — GitHub Actions

Sur push sur `main` (pas de CI de test demandée explicitement — le
`README` précise "pas de CI", donc le workflow se limite au déploiement,
sans étape de lint/test bloquante) :
1. Checkout.
2. Connexion SSH au VPS (clé privée stockée en secret GitHub
   `VPS_SSH_KEY`, host `VPS_HOST`, user `VPS_USER`).
3. `cd /srv/docker/apps/edito && git pull && docker compose up -d --build`.
4. (Optionnel) vérification que `/healthz` répond après déploiement.

Secrets GitHub requis : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
`VPS_SSH_PORT` (si non standard).

## 6. Gestion des erreurs

- Frontend : toute erreur réseau (upload échoué, sauvegarde échouée)
  affiche un toast non bloquant et conserve l'état local (rien n'est
  perdu côté client tant que la sauvegarde n'a pas réussi) ; retry
  automatique léger avec backoff.
- Backend : validation stricte des payloads (schémas Fastify/JSON
  Schema), erreurs 4xx explicites, logs structurés sur stdout/stderr
  (jamais de fichier de log local).
- Upload : rejet explicite (415/413) si type ou taille invalide.

## 7. Tests

- Backend : tests unitaires sur les endpoints critiques (upload, save
  projet) avec un client HTTP léger (ex. `tap` ou `vitest` +
  `fastify.inject`).
- Frontend : tests unitaires sur la logique pure (calculs de timeline,
  undo/redo, snapping) avec Vitest ; pas de suite e2e lourde en v1 vu
  l'absence de CI demandée — vérification manuelle via le navigateur
  pour les flows critiques (import → cut → export).

## 8. Roadmap (hors scope de cette spec, pour mémoire)

- v1.1 : multi-projets nommés, effets de base (fade in/out par
  poignées, EQ 3 bandes), export MP3.
- v2 : montage vidéo (import clips vidéo, timeline vidéo séparée ou
  unifiée, export via ffmpeg côté serveur — impliquera probablement un
  worker dédié et repensera le stockage/traitement).
