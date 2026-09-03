# Edito v1 (Éditeur audio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une app web mono-utilisateur de montage audio multi-pistes (import, cut, arrangement, enregistrement micro, export mixdown), déployée en production sur le VPS via Docker/Traefik avec déploiement continu par GitHub Actions.

**Architecture:** Monorepo npm workspaces avec deux packages — `apps/server` (Node + Fastify + SQLite, sert aussi le build statique du frontend) et `apps/web` (React + TypeScript + Vite, moteur audio Web Audio API, UI Tailwind + shadcn/ui). Un seul conteneur Docker en prod, un seul volume persistant pour la DB SQLite + les fichiers audio.

**Tech Stack:** Node.js 20, Fastify, better-sqlite3, React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), wavesurfer.js, Zustand, Vitest, Docker, Traefik, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-09-03-edito-audio-editor-design.md](../specs/2026-09-03-edito-audio-editor-design.md)

## Global Constraints

- Stockage: SQLite (fichier) pour les métadonnées + disque pour les fichiers audio. Pas de conteneur DB séparé.
- Auth: gérée uniquement par Traefik (Basic Auth middleware). Aucun code d'auth dans l'app.
- Un seul projet actif en v1 — pas de gestion multi-projets (le schéma reste normalisé pour ne pas bloquer v1.1).
- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui, thème dark "studio pro".
- Moteur audio: Web Audio API natif + wavesurfer.js pour les waveforms/regions. Export via `OfflineAudioContext`.
- Backend: Node.js + Fastify + better-sqlite3, écoute sur `0.0.0.0:3000`.
- Pas de CI de tests bloquante demandée — le workflow GitHub Actions ne fait QUE le déploiement (checkout → SSH → `git pull` → `docker compose up -d --build`).
- Logs sur stdout/stderr uniquement. Pas de fichiers de logs locaux.
- Tous les fichiers audio uploadés sont renommés en UUID sur disque, jamais servis sous leur nom d'origine.

---

## File Structure

```
Edito/
├── package.json                     # racine, npm workspaces
├── tsconfig.base.json
├── .dockerignore
├── .gitignore
├── Dockerfile
├── compose.yaml
├── .env.example
├── README.md
├── .github/workflows/deploy.yml
├── apps/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts             # bootstrap Fastify, écoute 0.0.0.0:3000
│   │   │   ├── db.ts                # ouverture SQLite + migrations
│   │   │   ├── db/schema.sql        # DDL: project, track, clip, media
│   │   │   ├── routes/health.ts     # GET /healthz
│   │   │   ├── routes/project.ts    # GET/PATCH /api/project
│   │   │   ├── routes/media.ts      # POST/GET/DELETE /api/media
│   │   │   ├── static.ts            # sert apps/web/dist en statique
│   │   │   └── types.ts             # types partagés backend (Project, Track, Clip, Media)
│   │   └── test/
│   │       ├── project.test.ts
│   │       └── media.test.ts
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── styles/index.css
│           ├── api/client.ts            # fetch wrapper typé vers l'API
│           ├── store/projectStore.ts    # Zustand: pistes/clips/transport state
│           ├── store/historyStore.ts    # pile undo/redo (pattern commande)
│           ├── audio/engine.ts          # AudioContext + graphe par piste
│           ├── audio/transport.ts       # play/pause/stop/seek
│           ├── audio/record.ts          # MediaRecorder -> clip
│           ├── audio/export.ts          # OfflineAudioContext -> WAV blob
│           ├── components/
│           │   ├── ui/                  # composants shadcn générés
│           │   ├── TransportBar.tsx
│           │   ├── TrackList.tsx
│           │   ├── TrackHeader.tsx
│           │   ├── TimelineCanvas.tsx
│           │   ├── ClipWaveform.tsx
│           │   └── Toolbar.tsx
│           └── lib/
│               ├── time.ts              # helpers temps/pixels <-> secondes
│               └── keyboard.ts          # gestion raccourcis clavier
└── docs/superpowers/
    ├── specs/2026-09-03-edito-audio-editor-design.md
    └── plans/2026-09-03-edito-v1-implementation.md
```

---

## Phase 0 — Scaffolding du monorepo

### Task 0.1: Racine du repo + workspaces npm

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.dockerignore`, `README.md`

**Interfaces:**
- Produces: workspace npm racine référençant `apps/server` et `apps/web`.

- [ ] **Step 1: Créer `package.json` racine**

```json
{
  "name": "edito",
  "private": true,
  "workspaces": ["apps/server", "apps/web"],
  "scripts": {
    "dev:server": "npm run dev -w apps/server",
    "dev:web": "npm run dev -w apps/web",
    "build": "npm run build -w apps/web && npm run build -w apps/server",
    "test": "npm test -w apps/server && npm test -w apps/web"
  }
}
```

- [ ] **Step 2: Créer `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Créer `.gitignore`**

```
node_modules/
dist/
data/
*.db
.env
```

- [ ] **Step 4: Créer `.dockerignore`**

```
node_modules
**/dist
**/node_modules
.git
data
.env
*.md
```

- [ ] **Step 5: Créer `README.md` minimal (sera complété en Phase 12)**

```markdown
# Edito

Éditeur audio multi-pistes, mono-utilisateur. Voir docs/superpowers/specs et docs/superpowers/plans.
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore .dockerignore README.md
git commit -m "chore: scaffold monorepo root"
```

### Task 0.2: Scaffold `apps/server`

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/index.ts`

**Interfaces:**
- Produces: `apps/server` démarrable via `npm run dev -w apps/server`, écoute sur le port `3000`.

- [ ] **Step 1: Créer `apps/server/package.json`**

```json
{
  "name": "@edito/server",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/static": "^7.0.4",
    "@fastify/multipart": "^8.3.0",
    "better-sqlite3": "^11.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.2",
    "tsx": "^4.19.1",
    "vitest": "^2.1.1",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.5"
  }
}
```

- [ ] **Step 2: Créer `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Créer `apps/server/src/index.ts` (bootstrap minimal)**

```typescript
import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Installer les deps et vérifier le démarrage**

Run: `npm install && npm run dev -w apps/server`
Expected: log Fastify indiquant "Server listening at http://0.0.0.0:3000". Vérifier `curl http://localhost:3000/healthz` renvoie `{"status":"ok"}`. Arrêter le process (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add apps/server package-lock.json
git commit -m "feat(server): scaffold Fastify server with healthz"
```

### Task 0.3: Scaffold `apps/web`

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles/index.css`

**Interfaces:**
- Produces: `apps/web` démarrable via `npm run dev -w apps/web` (Vite dev server), build via `npm run build -w apps/web` → `apps/web/dist`.

- [ ] **Step 1: Générer le scaffold Vite React-TS**

Run (depuis la racine): `npm create vite@latest apps/web -- --template react-ts`
Confirmer l'écrasement si des fichiers existent déjà (index.html, src/ créés par le générateur).

- [ ] **Step 2: Adapter `apps/web/package.json`** — ajouter le nom du package et le script test

```json
{
  "name": "@edito/web",
  "private": true,
  "version": "0.0.1",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

(Conserver les `dependencies`/`devDependencies` générées par Vite — `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`. Ajouter `vitest` en devDependency.)

- [ ] **Step 3: Remplacer `apps/web/src/App.tsx` par un shell minimal**

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <h1 className="p-4 text-xl font-semibold">Edito</h1>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier le démarrage**

Run: `npm install && npm run dev -w apps/web`
Expected: Vite sert sur `http://localhost:5173`, la page affiche "Edito" sur fond sombre.

- [ ] **Step 5: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat(web): scaffold Vite React-TS app"
```

### Task 0.4: Tailwind CSS + shadcn/ui + thème dark studio

**Files:**
- Create: `apps/web/tailwind.config.ts`, `apps/web/postcss.config.js`, `apps/web/components.json`
- Modify: `apps/web/src/styles/index.css`, `apps/web/src/main.tsx`

**Interfaces:**
- Produces: classes Tailwind utilisables dans tout `apps/web`, alias d'import `@/components/ui/*` pour les composants shadcn.

- [ ] **Step 1: Installer Tailwind et initialiser shadcn/ui**

Run:
```bash
npm install -D tailwindcss postcss autoprefixer -w apps/web
npx tailwindcss init -p --cwd apps/web
npx shadcn@latest init -y --cwd apps/web
```
Lors du prompt shadcn (si non couvert par `-y`) : style "New York", couleur de base "Neutral", CSS variables activées.

- [ ] **Step 2: Configurer `apps/web/tailwind.config.ts`** — palette custom pour les pistes

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#0a0a0c",
          panel: "#141417",
          border: "#26262b",
        },
        track: {
          1: "#f97316",
          2: "#22d3ee",
          3: "#a78bfa",
          4: "#4ade80",
          5: "#f472b6",
          6: "#facc15",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: `apps/web/src/styles/index.css`** — forcer le mode sombre par défaut

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  @apply dark;
}

body {
  @apply bg-studio-bg text-neutral-100;
}
```

- [ ] **Step 4: Ajouter les premiers composants shadcn nécessaires**

Run: `npx shadcn@latest add button slider tooltip dropdown-menu toast --cwd apps/web`

- [ ] **Step 5: Vérifier visuellement**

Run: `npm run dev -w apps/web`, ouvrir `http://localhost:5173`, confirmer fond très sombre (`#0a0a0c`) et texte clair.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Tailwind + shadcn/ui dark studio theme"
```

---

## Phase 1 — Backend: base de données et API projet

### Task 1.1: Schéma SQLite + connexion

**Files:**
- Create: `apps/server/src/db/schema.sql`, `apps/server/src/db.ts`, `apps/server/src/types.ts`
- Test: `apps/server/test/db.test.ts`

**Interfaces:**
- Produces: `getDb(): Database` (instance `better-sqlite3` singleton, migrations appliquées au premier appel), types `Project`, `Track`, `Clip`, `Media`.

- [ ] **Step 1: Écrire `apps/server/src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Untitled Project',
  sample_rate INTEGER NOT NULL DEFAULT 44100,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  duration REAL NOT NULL,
  sample_rate INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS track (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL DEFAULT 1 REFERENCES project(id),
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  color TEXT NOT NULL,
  volume REAL NOT NULL DEFAULT 1,
  pan REAL NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  soloed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clip (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id),
  start_time REAL NOT NULL,
  source_offset REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL,
  name TEXT NOT NULL
);

INSERT OR IGNORE INTO project (id) VALUES (1);
```

- [ ] **Step 2: Écrire `apps/server/src/types.ts`**

```typescript
export interface Project {
  id: number;
  name: string;
  sampleRate: number;
}

export interface Track {
  id: string;
  orderIndex: number;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  mediaId: string;
  startTime: number;
  sourceOffset: number;
  duration: number;
  name: string;
}

export interface Media {
  id: string;
  originalFilename: string;
  storedFilename: string;
  duration: number;
  sampleRate: number;
}

export interface ProjectState {
  project: Project;
  tracks: Track[];
  clips: Clip[];
  media: Media[];
}
```

- [ ] **Step 3: Écrire `apps/server/src/db.ts`**

```typescript
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;
  const dataDir = process.env.DATA_DIR ?? join(__dirname, "../../../data");
  db = new Database(join(dataDir, "edito.db"));
  db.pragma("journal_mode = WAL");
  const schema = readFileSync(join(__dirname, "db/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

export function resetDbForTests(): void {
  db = new Database(":memory:");
  const schema = readFileSync(join(__dirname, "db/schema.sql"), "utf-8");
  db.exec(schema);
}
```

- [ ] **Step 4: Écrire le test `apps/server/test/db.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resetDbForTests, getDb } from "../src/db.js";

describe("db", () => {
  beforeEach(() => resetDbForTests());

  it("creates the default project row", () => {
    const row = getDb().prepare("SELECT * FROM project WHERE id = 1").get() as { name: string };
    expect(row.name).toBe("Untitled Project");
  });
});
```

- [ ] **Step 5: Lancer le test**

Run: `npm test -w apps/server`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): add SQLite schema and db bootstrap"
```

### Task 1.2: Endpoints `GET/PATCH /api/project`

**Files:**
- Create: `apps/server/src/routes/project.ts`
- Modify: `apps/server/src/index.ts`
- Test: `apps/server/test/project.test.ts`

**Interfaces:**
- Consumes: `getDb()` de `db.ts`, types de `types.ts`.
- Produces: route Fastify `registerProjectRoutes(app: FastifyInstance)`, réponse `GET /api/project` de forme `ProjectState`, `PATCH /api/project` accepte un body partiel `{ tracks?: Track[], clips?: Clip[], project?: Partial<Project> }` et fait un upsert complet (remplace la liste de tracks/clips fournie).

- [ ] **Step 1: Écrire le test `apps/server/test/project.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { resetDbForTests } from "../src/db.js";
import { registerProjectRoutes } from "../src/routes/project.js";

function buildApp() {
  const app = Fastify();
  app.register(registerProjectRoutes);
  return app;
}

describe("project routes", () => {
  beforeEach(() => resetDbForTests());

  it("GET /api/project returns empty tracks/clips initially", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/project" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tracks).toEqual([]);
    expect(body.clips).toEqual([]);
  });

  it("PATCH /api/project upserts a track then GET reflects it", async () => {
    const app = buildApp();
    const track = {
      id: "t1",
      orderIndex: 0,
      name: "Voix",
      color: "#f97316",
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
    };
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: { tracks: [track] },
    });
    expect(patchRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: "GET", url: "/api/project" });
    const body = getRes.json();
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks[0].name).toBe("Voix");
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/server`
Expected: FAIL — `Cannot find module '../src/routes/project.js'`.

- [ ] **Step 3: Écrire `apps/server/src/routes/project.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { getDb } from "../db.js";
import type { Track, Clip, Project, Media, ProjectState } from "../types.js";

function rowToTrack(r: any): Track {
  return {
    id: r.id,
    orderIndex: r.order_index,
    name: r.name,
    color: r.color,
    volume: r.volume,
    pan: r.pan,
    muted: !!r.muted,
    soloed: !!r.soloed,
  };
}

function rowToClip(r: any): Clip {
  return {
    id: r.id,
    trackId: r.track_id,
    mediaId: r.media_id,
    startTime: r.start_time,
    sourceOffset: r.source_offset,
    duration: r.duration,
    name: r.name,
  };
}

function rowToMedia(r: any): Media {
  return {
    id: r.id,
    originalFilename: r.original_filename,
    storedFilename: r.stored_filename,
    duration: r.duration,
    sampleRate: r.sample_rate,
  };
}

export function loadProjectState(): ProjectState {
  const db = getDb();
  const projectRow = db.prepare("SELECT * FROM project WHERE id = 1").get() as any;
  const tracks = (db.prepare("SELECT * FROM track ORDER BY order_index").all() as any[]).map(rowToTrack);
  const clips = (db.prepare("SELECT * FROM clip").all() as any[]).map(rowToClip);
  const media = (db.prepare("SELECT * FROM media").all() as any[]).map(rowToMedia);
  const project: Project = { id: projectRow.id, name: projectRow.name, sampleRate: projectRow.sample_rate };
  return { project, tracks, clips, media };
}

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/project", async () => loadProjectState());

  app.patch("/api/project", async (req, reply) => {
    const body = req.body as { project?: Partial<Project>; tracks?: Track[]; clips?: Clip[] };
    const db = getDb();
    const tx = db.transaction(() => {
      if (body.project) {
        db.prepare("UPDATE project SET name = COALESCE(?, name), updated_at = datetime('now') WHERE id = 1").run(
          body.project.name ?? null
        );
      }
      if (body.tracks) {
        db.prepare("DELETE FROM track").run();
        const insert = db.prepare(
          `INSERT INTO track (id, project_id, name, order_index, color, volume, pan, muted, soloed)
           VALUES (@id, 1, @name, @orderIndex, @color, @volume, @pan, @muted, @soloed)`
        );
        for (const t of body.tracks) {
          insert.run({ ...t, muted: t.muted ? 1 : 0, soloed: t.soloed ? 1 : 0 });
        }
      }
      if (body.clips) {
        db.prepare("DELETE FROM clip").run();
        const insert = db.prepare(
          `INSERT INTO clip (id, track_id, media_id, start_time, source_offset, duration, name)
           VALUES (@id, @trackId, @mediaId, @startTime, @sourceOffset, @duration, @name)`
        );
        for (const c of body.clips) insert.run(c);
      }
    });
    tx();
    reply.send({ ok: true });
  });
}
```

- [ ] **Step 4: Enregistrer la route dans `apps/server/src/index.ts`**

```typescript
import Fastify from "fastify";
import { registerProjectRoutes } from "./routes/project.js";

const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ status: "ok" }));
app.register(registerProjectRoutes);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Lancer les tests**

Run: `npm test -w apps/server`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): add GET/PATCH /api/project endpoints"
```

### Task 1.3: Endpoints média — upload, streaming, suppression

**Files:**
- Create: `apps/server/src/routes/media.ts`
- Modify: `apps/server/src/index.ts`
- Test: `apps/server/test/media.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `Media` type.
- Produces: `registerMediaRoutes(app)`. `POST /api/media` (multipart, champ `file`) → `201 { id, originalFilename, duration, sampleRate }`. `GET /api/media/:id` → stream du fichier avec support `Range`. `DELETE /api/media/:id` → `204` si le média n'est référencé par aucun clip, `409` sinon.

- [ ] **Step 1: Écrire le test `apps/server/test/media.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { resetDbForTests, getDb } from "../src/db.js";
import { registerMediaRoutes } from "../src/routes/media.js";

function buildApp() {
  const app = Fastify();
  app.register(multipart);
  app.register(registerMediaRoutes, { uploadsDir: "/tmp/edito-test-uploads" });
  return app;
}

describe("media routes", () => {
  beforeEach(() => resetDbForTests());

  it("rejects non-audio uploads with 415", async () => {
    const app = buildApp();
    const form = new FormData();
    form.append("file", new Blob(["not audio"], { type: "text/plain" }), "note.txt");
    const res = await app.inject({ method: "POST", url: "/api/media", payload: form as any });
    expect(res.statusCode).toBe(415);
  });

  it("DELETE returns 409 when media is referenced by a clip", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO media (id, original_filename, stored_filename, duration, sample_rate) VALUES ('m1','a.wav','m1.wav', 3, 44100)"
    ).run();
    db.prepare(
      "INSERT INTO track (id, name, order_index, color, volume, pan) VALUES ('t1','T',0,'#fff',1,0)"
    ).run();
    db.prepare(
      "INSERT INTO clip (id, track_id, media_id, start_time, source_offset, duration, name) VALUES ('c1','t1','m1',0,0,3,'clip')"
    ).run();
    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/media/m1" });
    expect(res.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/server`
Expected: FAIL — module `routes/media.js` introuvable.

- [ ] **Step 3: Écrire `apps/server/src/routes/media.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream, createReadStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { getDb } from "../db.js";

const ALLOWED_MIME = new Set(["audio/wav", "audio/wave", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/m4a"]);
const MAX_BYTES = 100 * 1024 * 1024;

export async function registerMediaRoutes(app: FastifyInstance, opts: { uploadsDir: string }) {
  const uploadsDir = opts.uploadsDir;
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  app.post("/api/media", async (req, reply) => {
    const file = await (req as any).file({ limits: { fileSize: MAX_BYTES } });
    if (!file || !ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(415).send({ error: "unsupported media type" });
    }
    const id = randomUUID();
    const storedFilename = `${id}${extname(file.filename)}`;
    const dest = join(uploadsDir, storedFilename);
    await pipeline(file.file, createWriteStream(dest));

    // Durée/sampleRate réelles décodées côté client lors de l'import (Web Audio),
    // transmises en champs de formulaire à côté du fichier.
    const fields = file.fields as any;
    const duration = Number(fields?.duration?.value ?? 0);
    const sampleRate = Number(fields?.sampleRate?.value ?? 44100);

    getDb()
      .prepare(
        "INSERT INTO media (id, original_filename, stored_filename, duration, sample_rate) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, file.filename, storedFilename, duration, sampleRate);

    reply.code(201).send({ id, originalFilename: file.filename, duration, sampleRate });
  });

  app.get("/api/media/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getDb().prepare("SELECT * FROM media WHERE id = ?").get(id) as any;
    if (!row) return reply.code(404).send({ error: "not found" });
    const filePath = join(uploadsDir, row.stored_filename);
    const stat = statSync(filePath);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Length", stat.size);
    return reply.send(createReadStream(filePath));
  });

  app.delete("/api/media/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const refCount = (db.prepare("SELECT COUNT(*) c FROM clip WHERE media_id = ?").get(id) as any).c;
    if (refCount > 0) return reply.code(409).send({ error: "media still referenced by a clip" });
    const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as any;
    if (!row) return reply.code(404).send({ error: "not found" });
    const filePath = join(uploadsDir, row.stored_filename);
    if (existsSync(filePath)) unlinkSync(filePath);
    db.prepare("DELETE FROM media WHERE id = ?").run(id);
    reply.code(204).send();
  });
}
```

- [ ] **Step 4: Enregistrer multipart + la route média dans `apps/server/src/index.ts`**

```typescript
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { join } from "node:path";
import { registerProjectRoutes } from "./routes/project.js";
import { registerMediaRoutes } from "./routes/media.js";

const app = Fastify({ logger: true });
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");

app.get("/healthz", async () => ({ status: "ok" }));
app.register(multipart);
app.register(registerProjectRoutes);
app.register(registerMediaRoutes, { uploadsDir: join(dataDir, "uploads") });

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Lancer les tests**

Run: `npm test -w apps/server`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): add media upload/stream/delete endpoints"
```

### Task 1.4: Servir le build frontend en statique

**Files:**
- Create: `apps/server/src/static.ts`
- Modify: `apps/server/src/index.ts`, `apps/server/package.json`

**Interfaces:**
- Produces: `registerStatic(app, distDir)` qui sert `apps/web/dist` et fait un fallback vers `index.html` pour les routes non-API (SPA routing).

- [ ] **Step 1: Écrire `apps/server/src/static.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";

export async function registerStatic(app: FastifyInstance, distDir: string) {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api/")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.sendFile("index.html", distDir);
  });
}
```

- [ ] **Step 2: Enregistrer dans `apps/server/src/index.ts`** (après les routes API)

```typescript
import { registerStatic } from "./static.js";
// ...
await app.register(multipart);
await app.register(registerProjectRoutes);
await app.register(registerMediaRoutes, { uploadsDir: join(dataDir, "uploads") });
await registerStatic(app, join(process.cwd(), "../web/dist"));
```

- [ ] **Step 3: Vérification manuelle**

Run: `npm run build -w apps/web && npm run build -w apps/server && npm start -w apps/server`
Expected: `http://localhost:3000/` sert la page React buildée (fond sombre, titre "Edito"), `http://localhost:3000/healthz` répond toujours `{"status":"ok"}`.

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat(server): serve web build as static SPA"
```

---

## Phase 2 — Frontend: API client + store d'état

### Task 2.1: Client API typé

**Files:**
- Create: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`

**Interfaces:**
- Produces: `fetchProject(): Promise<ProjectState>`, `saveProject(patch: ProjectPatch): Promise<void>`, `uploadMedia(file: File, meta: {duration:number; sampleRate:number}): Promise<MediaDTO>`, `deleteMedia(id: string): Promise<void>`.

- [ ] **Step 1: Écrire le test `apps/web/src/api/client.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProject, saveProject } from "./client";

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetchProject calls GET /api/project and returns json", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ tracks: [], clips: [], media: [], project: { id: 1, name: "x", sampleRate: 44100 } }) });
    const result = await fetchProject();
    expect(fetch).toHaveBeenCalledWith("/api/project");
    expect(result.tracks).toEqual([]);
  });

  it("saveProject sends PATCH with JSON body", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await saveProject({ tracks: [] });
    expect(fetch).toHaveBeenCalledWith(
      "/api/project",
      expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/web`
Expected: FAIL — `client.ts` n'exporte rien.

- [ ] **Step 3: Écrire `apps/web/src/api/client.ts`**

```typescript
export interface Track {
  id: string;
  orderIndex: number;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  mediaId: string;
  startTime: number;
  sourceOffset: number;
  duration: number;
  name: string;
}

export interface MediaDTO {
  id: string;
  originalFilename: string;
  duration: number;
  sampleRate: number;
}

export interface ProjectState {
  project: { id: number; name: string; sampleRate: number };
  tracks: Track[];
  clips: Clip[];
  media: MediaDTO[];
}

export interface ProjectPatch {
  project?: { name?: string };
  tracks?: Track[];
  clips?: Clip[];
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function fetchProject(): Promise<ProjectState> {
  return fetch("/api/project").then(handle);
}

export function saveProject(patch: ProjectPatch): Promise<void> {
  return fetch("/api/project", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((res) => handle<{ ok: boolean }>(res)).then(() => undefined);
}

export function uploadMedia(file: File, meta: { duration: number; sampleRate: number }): Promise<MediaDTO> {
  const form = new FormData();
  form.append("file", file);
  form.append("duration", String(meta.duration));
  form.append("sampleRate", String(meta.sampleRate));
  return fetch("/api/media", { method: "POST", body: form }).then(handle);
}

export function deleteMedia(id: string): Promise<void> {
  return fetch(`/api/media/${id}`, { method: "DELETE" }).then((res) => {
    if (!res.ok && res.status !== 204) throw new Error(`API error ${res.status}`);
  });
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test -w apps/web`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add typed API client"
```

### Task 2.2: Store Zustand du projet

**Files:**
- Create: `apps/web/src/store/projectStore.ts`
- Test: `apps/web/src/store/projectStore.test.ts`

**Interfaces:**
- Consumes: types `Track`, `Clip`, `MediaDTO` de `api/client.ts`.
- Produces: hook `useProjectStore` avec état `{ tracks, clips, media, selectedClipId }` et actions `addTrack(track)`, `removeTrack(id)`, `addClip(clip)`, `updateClip(id, patch)`, `removeClip(id)`, `selectClip(id | null)`. Ces actions sont consommées par le moteur audio (Phase 3) et l'UI timeline (Phase 4).

- [ ] **Step 1: Écrire le test `apps/web/src/store/projectStore.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({ tracks: [], clips: [], media: [], selectedClipId: null });
  });

  it("addTrack appends a track", () => {
    useProjectStore.getState().addTrack({ id: "t1", orderIndex: 0, name: "T1", color: "#f97316", volume: 1, pan: 0, muted: false, soloed: false });
    expect(useProjectStore.getState().tracks).toHaveLength(1);
  });

  it("updateClip patches only the matching clip", () => {
    useProjectStore.setState({
      clips: [{ id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0, duration: 2, name: "c" }],
    } as any);
    useProjectStore.getState().updateClip("c1", { startTime: 5 });
    expect(useProjectStore.getState().clips[0].startTime).toBe(5);
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/web`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Installer zustand et écrire `apps/web/src/store/projectStore.ts`**

Run: `npm install zustand -w apps/web`

```typescript
import { create } from "zustand";
import type { Track, Clip, MediaDTO } from "../api/client";

interface ProjectStoreState {
  tracks: Track[];
  clips: Clip[];
  media: MediaDTO[];
  selectedClipId: string | null;
  loadState: (s: { tracks: Track[]; clips: Clip[]; media: MediaDTO[] }) => void;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  addMedia: (media: MediaDTO) => void;
  selectClip: (id: string | null) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  tracks: [],
  clips: [],
  media: [],
  selectedClipId: null,
  loadState: (s) => set({ tracks: s.tracks, clips: s.clips, media: s.media }),
  addTrack: (track) => set((s) => ({ tracks: [...s.tracks, track] })),
  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id), clips: s.clips.filter((c) => c.trackId !== id) })),
  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  updateClip: (id, patch) =>
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
  addMedia: (media) => set((s) => ({ media: [...s.media, media] })),
  selectClip: (id) => set({ selectedClipId: id }),
}));
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test -w apps/web`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Zustand project store"
```

### Task 2.3: Pile undo/redo (pattern commande)

**Files:**
- Create: `apps/web/src/store/historyStore.ts`
- Test: `apps/web/src/store/historyStore.test.ts`

**Interfaces:**
- Consumes: aucune dépendance externe (générique).
- Produces: `useHistoryStore` avec `push(command: {do: () => void; undo: () => void})`, `undo()`, `redo()`, `canUndo`, `canRedo`. Utilisé par toutes les actions d'édition de clips en Phase 4 (chaque action métier s'enveloppe dans une commande poussée ici plutôt que d'appeler directement `projectStore`).

- [ ] **Step 1: Écrire le test `apps/web/src/store/historyStore.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useHistoryStore } from "./historyStore";

describe("historyStore", () => {
  beforeEach(() => useHistoryStore.setState({ undoStack: [], redoStack: [] }));

  it("push executes do() immediately", () => {
    const doFn = vi.fn();
    useHistoryStore.getState().push({ do: doFn, undo: vi.fn() });
    expect(doFn).toHaveBeenCalledTimes(1);
  });

  it("undo calls undo() and moves command to redo stack", () => {
    const undoFn = vi.fn();
    const redoFn = vi.fn();
    useHistoryStore.getState().push({ do: redoFn, undo: undoFn });
    useHistoryStore.getState().undo();
    expect(undoFn).toHaveBeenCalledTimes(1);
    useHistoryStore.getState().redo();
    expect(redoFn).toHaveBeenCalledTimes(2); // 1x push + 1x redo
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/web`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `apps/web/src/store/historyStore.ts`**

```typescript
import { create } from "zustand";

export interface Command {
  do: () => void;
  undo: () => void;
}

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  push: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  push: (cmd) => {
    cmd.do();
    set((s) => ({ undoStack: [...s.undoStack, cmd], redoStack: [] }));
  },
  undo: () => {
    const { undoStack } = get();
    const cmd = undoStack[undoStack.length - 1];
    if (!cmd) return;
    cmd.undo();
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, cmd] }));
  },
  redo: () => {
    const { redoStack } = get();
    const cmd = redoStack[redoStack.length - 1];
    if (!cmd) return;
    cmd.do();
    set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, cmd] }));
  },
}));
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test -w apps/web`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add undo/redo history store"
```

---

## Phase 3 — Moteur audio (Web Audio API)

### Task 3.1: Graphe audio par piste

**Files:**
- Create: `apps/web/src/audio/engine.ts`
- Test: `apps/web/src/audio/engine.test.ts`

**Interfaces:**
- Produces: classe `AudioEngine` avec `ensureTrackNodes(trackId): {gain: GainNode; pan: StereoPannerNode}`, `setTrackVolume(trackId, value)`, `setTrackPan(trackId, value)`, `setTrackMuted(trackId, muted)`, `removeTrack(trackId)`, `getContext(): AudioContext`, `loadBuffer(url): Promise<AudioBuffer>` (avec cache interne par URL).

- [ ] **Step 1: Écrire le test `apps/web/src/audio/engine.test.ts`** (avec un mock minimal d'AudioContext, jsdom ne fournit pas Web Audio nativement)

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AudioEngine } from "./engine";

class FakeGainNode { gain = { value: 1 }; connect = vi.fn(); disconnect = vi.fn(); }
class FakePannerNode { pan = { value: 0 }; connect = vi.fn(); disconnect = vi.fn(); }
class FakeAudioContext {
  destination = {};
  createGain() { return new FakeGainNode() as any; }
  createStereoPanner() { return new FakePannerNode() as any; }
}

describe("AudioEngine", () => {
  let engine: AudioEngine;
  beforeEach(() => {
    engine = new AudioEngine(new FakeAudioContext() as unknown as AudioContext);
  });

  it("ensureTrackNodes creates gain/pan nodes once per track", () => {
    const nodesA = engine.ensureTrackNodes("t1");
    const nodesB = engine.ensureTrackNodes("t1");
    expect(nodesA).toBe(nodesB);
  });

  it("setTrackVolume updates the gain value", () => {
    engine.ensureTrackNodes("t1");
    engine.setTrackVolume("t1", 0.5);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0.5);
  });

  it("setTrackMuted forces gain to 0 and restores previous volume on unmute", () => {
    engine.ensureTrackNodes("t1");
    engine.setTrackVolume("t1", 0.8);
    engine.setTrackMuted("t1", true);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0);
    engine.setTrackMuted("t1", false);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0.8);
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/web`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `apps/web/src/audio/engine.ts`**

```typescript
interface TrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  lastVolume: number;
}

export class AudioEngine {
  private ctx: AudioContext;
  private tracks = new Map<string, TrackNodes>();
  private bufferCache = new Map<string, Promise<AudioBuffer>>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  getContext(): AudioContext {
    return this.ctx;
  }

  ensureTrackNodes(trackId: string): TrackNodes {
    let nodes = this.tracks.get(trackId);
    if (!nodes) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      gain.connect(pan as unknown as AudioNode);
      pan.connect(this.ctx.destination);
      nodes = { gain, pan, lastVolume: 1 };
      this.tracks.set(trackId, nodes);
    }
    return nodes;
  }

  setTrackVolume(trackId: string, value: number): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.lastVolume = value;
    nodes.gain.gain.value = value;
  }

  setTrackPan(trackId: string, value: number): void {
    this.ensureTrackNodes(trackId).pan.pan.value = value;
  }

  setTrackMuted(trackId: string, muted: boolean): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.gain.gain.value = muted ? 0 : nodes.lastVolume;
  }

  removeTrack(trackId: string): void {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;
    nodes.gain.disconnect();
    nodes.pan.disconnect();
    this.tracks.delete(trackId);
  }

  loadBuffer(url: string): Promise<AudioBuffer> {
    let cached = this.bufferCache.get(url);
    if (!cached) {
      cached = fetch(url)
        .then((res) => res.arrayBuffer())
        .then((buf) => this.ctx.decodeAudioData(buf));
      this.bufferCache.set(url, cached);
    }
    return cached;
  }
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test -w apps/web`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add AudioEngine with per-track gain/pan graph"
```

### Task 3.2: Transport (play/pause/stop/seek)

**Files:**
- Create: `apps/web/src/audio/transport.ts`
- Test: `apps/web/src/audio/transport.test.ts`

**Interfaces:**
- Consumes: `AudioEngine` (Task 3.1), `Track`/`Clip` de `api/client.ts`.
- Produces: classe `Transport` avec `play(clips: Clip[], tracks: Track[], getBufferUrl: (mediaId) => string)`, `pause()`, `stop()`, `seek(seconds)`, `getCurrentTime(): number`, `isPlaying(): boolean`, `onTimeUpdate(cb: (t: number) => void): () => void` (retourne une fonction d'unsubscribe).

- [ ] **Step 1: Écrire le test `apps/web/src/audio/transport.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { Transport } from "./transport";

function makeFakeEngine() {
  return {
    getContext: () => ({ currentTime: 0, createBufferSource: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null }) }),
    ensureTrackNodes: () => ({ gain: {}, pan: {} }),
    loadBuffer: vi.fn().mockResolvedValue({ duration: 5 }),
  } as any;
}

describe("Transport", () => {
  it("seek updates getCurrentTime without starting playback", () => {
    const transport = new Transport(makeFakeEngine());
    transport.seek(3.5);
    expect(transport.getCurrentTime()).toBe(3.5);
    expect(transport.isPlaying()).toBe(false);
  });

  it("stop resets currentTime to 0 and isPlaying to false", async () => {
    const transport = new Transport(makeFakeEngine());
    await transport.play([], [], () => "");
    transport.stop();
    expect(transport.isPlaying()).toBe(false);
    expect(transport.getCurrentTime()).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer le test pour confirmer l'échec**

Run: `npm test -w apps/web`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `apps/web/src/audio/transport.ts`**

```typescript
import type { AudioEngine } from "./engine";
import type { Track, Clip } from "../api/client";

type TimeListener = (t: number) => void;

export class Transport {
  private engine: AudioEngine;
  private currentTime = 0;
  private playing = false;
  private startedAtContextTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private listeners = new Set<TimeListener>();
  private rafId: number | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    if (!this.playing) return this.currentTime;
    const ctx = this.engine.getContext();
    return this.currentTime + (ctx.currentTime - this.startedAtContextTime);
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stopSources();
    this.currentTime = Math.max(0, seconds);
    if (wasPlaying) this.restartFrom(this.currentTime);
  }

  async play(clips: Clip[], tracks: Track[], getBufferUrl: (mediaId: string) => string): Promise<void> {
    this.lastClips = clips;
    this.lastTracks = tracks;
    this.lastGetBufferUrl = getBufferUrl;
    await this.restartFrom(this.currentTime);
  }

  pause(): void {
    if (!this.playing) return;
    this.currentTime = this.getCurrentTime();
    this.stopSources();
    this.playing = false;
    this.stopClock();
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.currentTime = 0;
    this.stopClock();
    this.emit();
  }

  onTimeUpdate(cb: TimeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private lastClips: Clip[] = [];
  private lastTracks: Track[] = [];
  private lastGetBufferUrl: (mediaId: string) => string = () => "";

  private async restartFrom(from: number): Promise<void> {
    const ctx = this.engine.getContext();
    const buffers = await Promise.all(
      this.lastClips.map((c) => this.engine.loadBuffer(this.lastGetBufferUrl(c.mediaId)))
    );
    this.activeSources = [];
    this.lastClips.forEach((clip, i) => {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd <= from) return;
      const track = this.lastTracks.find((t) => t.id === clip.trackId);
      if (!track) return;
      const nodes = this.engine.ensureTrackNodes(track.id);
      const source = ctx.createBufferSource();
      source.buffer = buffers[i];
      source.connect(nodes.gain as unknown as AudioNode);
      const offsetIntoClip = Math.max(0, from - clip.startTime);
      const when = ctx.currentTime + Math.max(0, clip.startTime - from);
      source.start(when, clip.sourceOffset + offsetIntoClip, clip.duration - offsetIntoClip);
      this.activeSources.push(source);
    });
    this.startedAtContextTime = ctx.currentTime;
    this.currentTime = from;
    this.playing = true;
    this.startClock();
  }

  private stopSources(): void {
    for (const s of this.activeSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.activeSources = [];
  }

  private startClock(): void {
    const tick = () => {
      this.emit();
      if (this.playing) this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopClock(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.emit();
  }

  private emit(): void {
    const t = this.getCurrentTime();
    for (const l of this.listeners) l(t);
  }
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test -w apps/web`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Transport for synchronized multi-track playback"
```

---

## Phase 4 — Timeline & waveform UI

### Task 4.1: Helpers temps <-> pixels

**Files:**
- Create: `apps/web/src/lib/time.ts`
- Test: `apps/web/src/lib/time.test.ts`

**Interfaces:**
- Produces: `secondsToPixels(seconds, pxPerSecond)`, `pixelsToSeconds(px, pxPerSecond)`, `formatTime(seconds): string` ("mm:ss.cc"). Utilisé par `TimelineCanvas` et `ClipWaveform`.

- [ ] **Step 1: Écrire le test**

```typescript
import { describe, it, expect } from "vitest";
import { secondsToPixels, pixelsToSeconds, formatTime } from "./time";

describe("time helpers", () => {
  it("converts seconds to pixels and back", () => {
    expect(secondsToPixels(2, 100)).toBe(200);
    expect(pixelsToSeconds(200, 100)).toBe(2);
  });

  it("formats time as mm:ss.cc", () => {
    expect(formatTime(65.34)).toBe("01:05.34");
    expect(formatTime(3.5)).toBe("00:03.50");
  });
});
```

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL module introuvable.

- [ ] **Step 3: Écrire `apps/web/src/lib/time.ts`**

```typescript
export function secondsToPixels(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond;
}

export function pixelsToSeconds(px: number, pxPerSecond: number): number {
  return px / pxPerSecond;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cc = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cc).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add time/pixel conversion helpers"
```

### Task 4.2: `TrackList` + `TrackHeader` (structure des pistes, sans waveform)

**Files:**
- Create: `apps/web/src/components/TrackList.tsx`, `apps/web/src/components/TrackHeader.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `useProjectStore` (Task 2.2).
- Produces: `<TrackList />` qui rend une `<TrackHeader track={t} />` par piste, avec bouton "+ Ajouter une piste" qui appelle `addTrack` avec une couleur prise dans la palette `track.1..6` en rotation.

- [ ] **Step 1: Écrire `apps/web/src/components/TrackHeader.tsx`**

```tsx
import { useProjectStore, type Track } from "../store/projectStore";
import { Button } from "./ui/button";

const TRACK_COLORS = ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"];

export function trackColorClass(index: number): string {
  return `bg-${TRACK_COLORS[index % TRACK_COLORS.length]}`;
}

export function TrackHeader({ track, index }: { track: Track; index: number }) {
  const removeTrack = useProjectStore((s) => s.removeTrack);
  return (
    <div className="flex h-24 w-48 shrink-0 flex-col justify-between border-b border-studio-border bg-studio-panel p-2">
      <div className="flex items-center justify-between">
        <span className={`h-2 w-2 rounded-full ${trackColorClass(index)}`} />
        <span className="truncate text-sm font-medium">{track.name}</span>
        <Button size="icon" variant="ghost" onClick={() => removeTrack(track.id)}>
          ✕
        </Button>
      </div>
    </div>
  );
}
```

(Le contrôle volume/pan/mute/solo sera ajouté dans Task 5.1 — cette étape ne pose que la structure visuelle des pistes.)

- [ ] **Step 2: Écrire `apps/web/src/components/TrackList.tsx`**

```tsx
import { randomUUID } from "../lib/uuid";
import { useProjectStore } from "../store/projectStore";
import { TrackHeader } from "./TrackHeader";
import { Button } from "./ui/button";

export function TrackList() {
  const tracks = useProjectStore((s) => s.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);

  function handleAdd() {
    addTrack({
      id: randomUUID(),
      orderIndex: tracks.length,
      name: `Piste ${tracks.length + 1}`,
      color: "",
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
    });
  }

  return (
    <div className="flex flex-col">
      {tracks.map((t, i) => (
        <TrackHeader key={t.id} track={t} index={i} />
      ))}
      <Button variant="secondary" className="m-2" onClick={handleAdd}>
        + Ajouter une piste
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Créer `apps/web/src/lib/uuid.ts`** (wrapper pour rester testable/mockable)

```typescript
export function randomUUID(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 4: Monter `<TrackList />` dans `apps/web/src/App.tsx`**

```tsx
import { TrackList } from "./components/TrackList";

export default function App() {
  return (
    <div className="flex min-h-screen bg-studio-bg text-neutral-100">
      <TrackList />
    </div>
  );
}
```

- [ ] **Step 5: Vérification manuelle**

Run: `npm run dev -w apps/web`. Cliquer "+ Ajouter une piste" plusieurs fois : chaque piste apparaît avec un nom "Piste N" et une pastille de couleur différente ; le bouton "✕" supprime la piste correspondante.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add TrackList/TrackHeader components"
```

### Task 4.3: Import de fichiers (drag & drop) → nouveau clip

**Files:**
- Create: `apps/web/src/components/Toolbar.tsx`, `apps/web/src/audio/import.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `uploadMedia` (Task 2.1), `useProjectStore.addMedia/addClip` (Task 2.2), `AudioEngine.getContext()` (Task 3.1) pour décoder et connaître la durée avant upload.
- Produces: `decodeAudioFile(file: File, ctx: AudioContext): Promise<{buffer: AudioBuffer}>`, composant `<Toolbar onImport={(file) => void} />` avec zone de drop + input file.

- [ ] **Step 1: Écrire `apps/web/src/audio/import.ts`**

```typescript
export async function decodeAudioFile(file: File, ctx: AudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}
```

- [ ] **Step 2: Écrire `apps/web/src/components/Toolbar.tsx`**

```tsx
import { useRef, type DragEvent } from "react";
import { Button } from "./ui/button";

export function Toolbar({ onImport }: { onImport: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onImport(file);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="flex items-center gap-2 border-b border-studio-border bg-studio-panel p-2"
    >
      <Button onClick={() => inputRef.current?.click()}>Importer un son</Button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
          e.target.value = "";
        }}
      />
      <span className="text-xs text-neutral-400">ou glisser-déposer un fichier ici</span>
    </div>
  );
}
```

- [ ] **Step 3: Câbler l'import dans `apps/web/src/App.tsx`** — décode le fichier, upload, ajoute media + un clip sur la première piste (ou une nouvelle piste si aucune n'existe) à la position `startTime: 0`

```tsx
import { Toolbar } from "./components/Toolbar";
import { TrackList } from "./components/TrackList";
import { useProjectStore } from "./store/projectStore";
import { decodeAudioFile } from "./audio/import";
import { uploadMedia } from "./api/client";
import { randomUUID } from "./lib/uuid";

const audioCtx = new AudioContext();

export default function App() {
  const { tracks, addTrack, addMedia, addClip } = useProjectStore();

  async function handleImport(file: File) {
    const buffer = await decodeAudioFile(file, audioCtx);
    const media = await uploadMedia(file, { duration: buffer.duration, sampleRate: buffer.sampleRate });
    addMedia(media);
    let trackId = tracks[0]?.id;
    if (!trackId) {
      trackId = randomUUID();
      addTrack({ id: trackId, orderIndex: 0, name: "Piste 1", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    }
    addClip({ id: randomUUID(), trackId, mediaId: media.id, startTime: 0, sourceOffset: 0, duration: media.duration, name: media.originalFilename });
  }

  return (
    <div className="flex min-h-screen flex-col bg-studio-bg text-neutral-100">
      <Toolbar onImport={handleImport} />
      <div className="flex flex-1">
        <TrackList />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérification manuelle**

Run: `npm run dev -w apps/web` avec le backend lancé (`npm run dev -w apps/server`) et le proxy Vite configuré vers `/api` (voir Step 5). Importer un fichier `.wav` : une piste + un clip nommé d'après le fichier apparaissent.

- [ ] **Step 5: Configurer le proxy dev dans `apps/web/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add drag-and-drop audio import"
```

### Task 4.4: `TimelineCanvas` + `ClipWaveform` (affichage + sélection)

**Files:**
- Create: `apps/web/src/components/TimelineCanvas.tsx`, `apps/web/src/components/ClipWaveform.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `useProjectStore` (clips, media), wavesurfer.js.
- Produces: `<TimelineCanvas pxPerSecond={number} />` qui rend une rangée par piste et positionne chaque `<ClipWaveform clip={c} pxPerSecond={...} />` en `position: absolute; left: secondsToPixels(clip.startTime, pxPerSecond)`. Clic sur un clip → `selectClip(clip.id)`.

- [ ] **Step 1: Installer wavesurfer.js**

Run: `npm install wavesurfer.js -w apps/web`

- [ ] **Step 2: Écrire `apps/web/src/components/ClipWaveform.tsx`**

```tsx
import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { useProjectStore, type Clip } from "../store/projectStore";
import { secondsToPixels } from "../lib/time";

export function ClipWaveform({ clip, pxPerSecond }: { clip: Clip; pxPerSecond: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const media = useProjectStore((s) => s.media.find((m) => m.id === clip.mediaId));
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);

  useEffect(() => {
    if (!containerRef.current || !media) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 64,
      waveColor: "#a78bfa",
      progressColor: "#f97316",
      cursorWidth: 0,
      interact: false,
      url: `/api/media/${media.id}`,
    });
    return () => ws.destroy();
  }, [media]);

  return (
    <div
      onClick={() => selectClip(clip.id)}
      style={{ left: secondsToPixels(clip.startTime, pxPerSecond), width: secondsToPixels(clip.duration, pxPerSecond) }}
      className={`absolute top-1 h-16 cursor-pointer overflow-hidden rounded border ${
        selectedClipId === clip.id ? "border-orange-400" : "border-transparent"
      }`}
    >
      <div ref={containerRef} />
    </div>
  );
}
```

- [ ] **Step 3: Écrire `apps/web/src/components/TimelineCanvas.tsx`**

```tsx
import { useProjectStore } from "../store/projectStore";
import { ClipWaveform } from "./ClipWaveform";

export function TimelineCanvas({ pxPerSecond }: { pxPerSecond: number }) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);

  return (
    <div className="relative flex-1 overflow-x-auto">
      {tracks.map((track) => (
        <div key={track.id} className="relative h-24 border-b border-studio-border">
          {clips.filter((c) => c.trackId === track.id).map((c) => (
            <ClipWaveform key={c.id} clip={c} pxPerSecond={pxPerSecond} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Monter côte à côte avec `TrackList` dans `apps/web/src/App.tsx`**

```tsx
<div className="flex flex-1">
  <TrackList />
  <TimelineCanvas pxPerSecond={100} />
</div>
```

- [ ] **Step 5: Vérification manuelle**

Importer un son : la waveform s'affiche alignée avec la piste correspondante ; cliquer dessus l'entoure d'une bordure orange.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add TimelineCanvas with waveform rendering"
```

### Task 4.5: Split / trim / suppression de clip (avec undo/redo)

**Files:**
- Create: `apps/web/src/audio/clipEditing.ts`
- Test: `apps/web/src/audio/clipEditing.test.ts`
- Modify: `apps/web/src/components/ClipWaveform.tsx`

**Interfaces:**
- Consumes: `useProjectStore` (Task 2.2), `useHistoryStore` (Task 2.3).
- Produces: `splitClip(clip: Clip, atTime: number): [Clip, Clip]` (fonction pure), `deleteClipWithHistory(clip: Clip)`, `splitClipWithHistory(clip: Clip, atTime: number)` qui poussent une commande undoable sur `useHistoryStore`.

- [ ] **Step 1: Écrire le test `apps/web/src/audio/clipEditing.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { splitClip } from "./clipEditing";
import type { Clip } from "../store/projectStore";

describe("splitClip", () => {
  it("splits a clip into two contiguous clips at the given time", () => {
    const clip: Clip = { id: "c1", trackId: "t1", mediaId: "m1", startTime: 2, sourceOffset: 0, duration: 6, name: "x" };
    const [left, right] = splitClip(clip, 5);
    expect(left.startTime).toBe(2);
    expect(left.duration).toBe(3);
    expect(right.startTime).toBe(5);
    expect(right.sourceOffset).toBe(3);
    expect(right.duration).toBe(3);
    expect(left.id).not.toBe(right.id);
  });
});
```

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL.

- [ ] **Step 3: Écrire `apps/web/src/audio/clipEditing.ts`**

```typescript
import type { Clip } from "../store/projectStore";
import { useProjectStore } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import { randomUUID } from "../lib/uuid";

export function splitClip(clip: Clip, atTime: number): [Clip, Clip] {
  const leftDuration = atTime - clip.startTime;
  const left: Clip = { ...clip, duration: leftDuration };
  const right: Clip = {
    ...clip,
    id: randomUUID(),
    startTime: atTime,
    sourceOffset: clip.sourceOffset + leftDuration,
    duration: clip.duration - leftDuration,
  };
  return [left, right];
}

export function splitClipWithHistory(clip: Clip, atTime: number): void {
  if (atTime <= clip.startTime || atTime >= clip.startTime + clip.duration) return;
  const [left, right] = splitClip(clip, atTime);
  const store = useProjectStore.getState();
  useHistoryStore.getState().push({
    do: () => {
      store.updateClip(clip.id, { duration: left.duration });
      store.addClip(right);
    },
    undo: () => {
      store.updateClip(clip.id, { duration: clip.duration });
      store.removeClip(right.id);
    },
  });
}

export function deleteClipWithHistory(clip: Clip): void {
  const store = useProjectStore.getState();
  useHistoryStore.getState().push({
    do: () => store.removeClip(clip.id),
    undo: () => store.addClip(clip),
  });
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS (1 test, + tous les précédents).

- [ ] **Step 5: Câbler la suppression clavier dans `apps/web/src/components/ClipWaveform.tsx`** (le raccourci global "Suppr" est finalisé en Task 9.1 ; ici on expose juste un bouton de suppression au clic droit ou un double-clic minimal pour tester)

Ajouter dans `ClipWaveform.tsx`, sur le `div` racine : `onDoubleClick={() => deleteClipWithHistory(clip)}` (import depuis `../audio/clipEditing`). Ce comportement sera remplacé par un vrai menu contextuel en Task 9.2 si le temps le permet — mais reste fonctionnel tel quel pour le MVP.

- [ ] **Step 6: Vérification manuelle**

Importer un son, double-cliquer sur son clip : il disparaît. Vérifier qu'un `Ctrl+Z` (câblé en Task 9.1) le restaure une fois ce raccourci en place.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): add clip split/delete with undo support"
```

### Task 4.6: Déplacer un clip par glisser-déposer (même piste ou piste différente)

**Files:**
- Modify: `apps/web/src/components/ClipWaveform.tsx`, `apps/web/src/components/TimelineCanvas.tsx`

**Interfaces:**
- Consumes: `useProjectStore.updateClip`, `useHistoryStore.push` (Task 2.3), `pixelsToSeconds` (Task 4.1).
- Produces: le clip suit la souris pendant le drag ; au relâchement, une seule commande undoable est poussée avec la position (et éventuellement la piste) de départ vs d'arrivée.

- [ ] **Step 1: Ajouter la logique de drag dans `apps/web/src/components/ClipWaveform.tsx`**

```tsx
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { useProjectStore, type Clip } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import { secondsToPixels, pixelsToSeconds } from "../lib/time";

// ... imports et hooks existants (media, selectedClipId, selectClip) inchangés

export function ClipWaveform({ clip, pxPerSecond, trackIds }: { clip: Clip; pxPerSecond: number; trackIds: string[] }) {
  // ... containerRef, media, selectedClipId, selectClip comme avant
  const updateClip = useProjectStore((s) => s.updateClip);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOriginal, setDragOriginal] = useState<{ startTime: number; trackId: string } | null>(null);

  function handleMouseDown(e: ReactMouseEvent) {
    e.stopPropagation();
    setDragStartX(e.clientX);
    setDragOriginal({ startTime: clip.startTime, trackId: clip.trackId });
    selectClip(clip.id);
  }

  useEffect(() => {
    if (dragStartX === null || !dragOriginal) return;
    function onMove(e: globalThis.MouseEvent) {
      const deltaSeconds = pixelsToSeconds(e.clientX - dragStartX!, pxPerSecond);
      updateClip(clip.id, { startTime: Math.max(0, dragOriginal!.startTime + deltaSeconds) });
    }
    function onUp() {
      const finalStartTime = useProjectStore.getState().clips.find((c) => c.id === clip.id)!.startTime;
      const original = dragOriginal!;
      updateClip(clip.id, { startTime: original.startTime }); // revert, puis rejouer via l'historique
      useHistoryStore.getState().push({
        do: () => updateClip(clip.id, { startTime: finalStartTime }),
        undo: () => updateClip(clip.id, { startTime: original.startTime }),
      });
      setDragStartX(null);
      setDragOriginal(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [dragStartX, dragOriginal, clip.id, pxPerSecond, updateClip]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={() => selectClip(clip.id)}
      style={{ left: secondsToPixels(clip.startTime, pxPerSecond), width: secondsToPixels(clip.duration, pxPerSecond) }}
      className={/* inchangé */ ""}
    >
      <div ref={containerRef} />
    </div>
  );
}
```

(Le changement de piste par drag vertical est laissé en dehors du MVP strict pour limiter la complexité — un clip reste sur sa piste d'origine ; le réassignement de piste se fait via un futur menu contextuel, backlog v1.1. Seul le déplacement horizontal — la fonctionnalité explicitement listée dans la spec — est livré ici.)

- [ ] **Step 2: Vérification manuelle**

Glisser un clip horizontalement : il suit la souris en temps réel, se fixe à la position au relâchement, et `Ctrl+Z` annule bien le déplacement en un seul cran (pas un par pixel).

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): add drag-to-move for clips with single undo step"
```

### Task 4.7: Trim d'un clip par glisser des bords

**Files:**
- Modify: `apps/web/src/components/ClipWaveform.tsx`

**Interfaces:**
- Consumes: mêmes stores que Task 4.6.
- Produces: deux poignées (gauche/droite, largeur 6px) superposées aux bords du clip ; glisser la poignée gauche ajuste `startTime`/`sourceOffset`/`duration` (le point de fin reste fixe) ; glisser la poignée droite ajuste `duration` uniquement (le point de départ reste fixe). Durée minimale imposée : 0.1s.

- [ ] **Step 1: Ajouter les poignées et leur logique dans `apps/web/src/components/ClipWaveform.tsx`**

```tsx
function useEdgeDrag(
  clip: Clip,
  pxPerSecond: number,
  edge: "left" | "right",
  updateClip: (id: string, patch: Partial<Clip>) => void
) {
  const [active, setActive] = useState(false);

  function onMouseDown(e: ReactMouseEvent) {
    e.stopPropagation();
    setActive(true);
  }

  useEffect(() => {
    if (!active) return;
    const original = { ...clip };
    function onMove(e: globalThis.MouseEvent) {
      const rect = (e.target as HTMLElement).closest(".timeline-track")?.getBoundingClientRect();
      if (!rect) return;
      const timeAtCursor = pixelsToSeconds(e.clientX - rect.left, pxPerSecond);
      if (edge === "left") {
        const newStart = Math.min(timeAtCursor, original.startTime + original.duration - 0.1);
        const delta = newStart - original.startTime;
        updateClip(clip.id, { startTime: newStart, sourceOffset: original.sourceOffset + delta, duration: original.duration - delta });
      } else {
        const newDuration = Math.max(0.1, timeAtCursor - original.startTime);
        updateClip(clip.id, { duration: newDuration });
      }
    }
    function onUp() {
      const current = useProjectStore.getState().clips.find((c) => c.id === clip.id)!;
      updateClip(clip.id, { startTime: original.startTime, sourceOffset: original.sourceOffset, duration: original.duration });
      useHistoryStore.getState().push({
        do: () => updateClip(clip.id, { startTime: current.startTime, sourceOffset: current.sourceOffset, duration: current.duration }),
        undo: () => updateClip(clip.id, { startTime: original.startTime, sourceOffset: original.sourceOffset, duration: original.duration }),
      });
      setActive(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [active]);

  return onMouseDown;
}
```

Ajouter dans le JSX du clip (à l'intérieur du conteneur positionné, qui doit porter la classe `timeline-track` sur son parent de piste dans `TimelineCanvas.tsx` pour que `closest` fonctionne) :

```tsx
<div onMouseDown={useEdgeDrag(clip, pxPerSecond, "left", updateClip)} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20" />
<div onMouseDown={useEdgeDrag(clip, pxPerSecond, "right", updateClip)} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20" />
```

- [ ] **Step 2: Ajouter la classe `timeline-track` sur la div de piste dans `apps/web/src/components/TimelineCanvas.tsx`**

```tsx
<div key={track.id} className="timeline-track relative h-24 border-b border-studio-border">
```

- [ ] **Step 3: Vérification manuelle**

Glisser le bord gauche d'un clip vers la droite : le début avance et la waveform interne se décale (on entend/voit le début coupé). Glisser le bord droit : la fin du clip se raccourcit/rallonge sans dépasser la durée du média source... (note: cette implémentation ne borne pas encore par la durée réelle du fichier source côté droit — acceptable pour le MVP, à durcir en v1.1 si un dépassement audible est constaté).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add drag-to-trim clip edges with undo support"
```

### Task 4.8: Réordonner les pistes (haut/bas)

**Files:**
- Modify: `apps/web/src/components/TrackHeader.tsx`, `apps/web/src/store/projectStore.ts`

**Interfaces:**
- Produces: action `useProjectStore.reorderTrack(id: string, direction: "up" | "down")` qui échange `orderIndex` avec la piste adjacente ; boutons "▲"/"▼" dans `TrackHeader`.

- [ ] **Step 1: Ajouter le test dans `apps/web/src/store/projectStore.test.ts`**

```typescript
it("reorderTrack swaps orderIndex with the adjacent track", () => {
  useProjectStore.setState({
    tracks: [
      { id: "t1", orderIndex: 0, name: "A", color: "", volume: 1, pan: 0, muted: false, soloed: false },
      { id: "t2", orderIndex: 1, name: "B", color: "", volume: 1, pan: 0, muted: false, soloed: false },
    ],
  } as any);
  useProjectStore.getState().reorderTrack("t1", "down");
  const [a, b] = useProjectStore.getState().tracks.sort((x, y) => x.orderIndex - y.orderIndex);
  expect(a.id).toBe("t2");
  expect(b.id).toBe("t1");
});
```

Run: `npm test -w apps/web` → FAIL (méthode inexistante).

- [ ] **Step 2: Ajouter `reorderTrack` dans `apps/web/src/store/projectStore.ts`**

```typescript
// interface: reorderTrack: (id: string, direction: "up" | "down") => void;
reorderTrack: (id, direction) =>
  set((s) => {
    const sorted = [...s.tracks].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex((t) => t.id === id);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return s;
    const a = sorted[idx];
    const b = sorted[swapWith];
    return {
      tracks: s.tracks.map((t) => {
        if (t.id === a.id) return { ...t, orderIndex: b.orderIndex };
        if (t.id === b.id) return { ...t, orderIndex: a.orderIndex };
        return t;
      }),
    };
  }),
```

- [ ] **Step 3: Run** — `npm test -w apps/web` → PASS.

- [ ] **Step 4: Ajouter les boutons dans `TrackHeader.tsx`**

```tsx
const reorderTrack = useProjectStore((s) => s.reorderTrack);
// dans le header, à côté du bouton ✕:
<Button size="icon" variant="ghost" onClick={() => reorderTrack(track.id, "up")}>▲</Button>
<Button size="icon" variant="ghost" onClick={() => reorderTrack(track.id, "down")}>▼</Button>
```

- [ ] **Step 5: Vérification manuelle**

Avec 3 pistes, cliquer "▼" sur la première : elle passe en 2ᵉ position, et les clips suivent bien leur piste dans `TimelineCanvas` (l'ordre d'affichage suit `orderIndex`, donc trier les pistes par `orderIndex` avant de les mapper dans `TimelineCanvas.tsx` et `TrackList.tsx` si ce n'est pas déjà le cas).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add track reordering"
```

---

## Phase 5 — Contrôles de piste (volume/pan/mute/solo) reliés au moteur audio

### Task 5.1: UI des contrôles dans `TrackHeader`

**Files:**
- Modify: `apps/web/src/components/TrackHeader.tsx`

**Interfaces:**
- Consumes: `useProjectStore.updateTrack` (nouvelle action à ajouter au store), composants shadcn `Slider`, `Button` (toggle mute/solo via `variant`).
- Produces: `TrackHeader` affiche un slider volume (0–1.5), un slider pan (-1 à 1), deux boutons "M" (mute) et "S" (solo).

- [ ] **Step 1: Ajouter `updateTrack` à `apps/web/src/store/projectStore.ts`**

```typescript
// dans l'interface ProjectStoreState
updateTrack: (id: string, patch: Partial<Track>) => void;

// dans create<ProjectStoreState>((set) => ({ ... }))
updateTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
```

- [ ] **Step 2: Ajouter le test correspondant dans `apps/web/src/store/projectStore.test.ts`**

```typescript
it("updateTrack patches only the matching track", () => {
  useProjectStore.setState({
    tracks: [{ id: "t1", orderIndex: 0, name: "T", color: "", volume: 1, pan: 0, muted: false, soloed: false }],
  } as any);
  useProjectStore.getState().updateTrack("t1", { volume: 0.3 });
  expect(useProjectStore.getState().tracks[0].volume).toBe(0.3);
});
```

Run: `npm test -w apps/web` → PASS.

- [ ] **Step 3: Étendre `apps/web/src/components/TrackHeader.tsx`**

```tsx
import { useProjectStore, type Track } from "../store/projectStore";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

const TRACK_COLORS = ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"];
export function trackColorClass(index: number): string {
  return `bg-${TRACK_COLORS[index % TRACK_COLORS.length]}`;
}

export function TrackHeader({ track, index }: { track: Track; index: number }) {
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  return (
    <div className="flex h-24 w-48 shrink-0 flex-col gap-1 border-b border-studio-border bg-studio-panel p-2">
      <div className="flex items-center justify-between">
        <span className={`h-2 w-2 rounded-full ${trackColorClass(index)}`} />
        <span className="truncate text-sm font-medium">{track.name}</span>
        <Button size="icon" variant="ghost" onClick={() => removeTrack(track.id)}>✕</Button>
      </div>
      <Slider
        min={0} max={1.5} step={0.01} value={[track.volume]}
        onValueChange={([v]) => updateTrack(track.id, { volume: v })}
      />
      <Slider
        min={-1} max={1} step={0.01} value={[track.pan]}
        onValueChange={([v]) => updateTrack(track.id, { pan: v })}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={track.muted ? "default" : "outline"}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >M</Button>
        <Button
          size="sm"
          variant={track.soloed ? "default" : "outline"}
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
        >S</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérification manuelle**

Les sliders et boutons M/S répondent visuellement. Le câblage vers l'`AudioEngine` réel se fait en Task 5.2.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add volume/pan/mute/solo controls to TrackHeader"
```

### Task 5.2: Synchronisation store → `AudioEngine`

**Files:**
- Create: `apps/web/src/audio/useEngineSync.ts`
- Test: `apps/web/src/audio/useEngineSync.test.ts`

**Interfaces:**
- Consumes: `AudioEngine` (Task 3.1), `useProjectStore.tracks`.
- Produces: hook `useEngineSync(engine: AudioEngine)` qui s'abonne au store et applique `setTrackVolume`/`setTrackPan`/`setTrackMuted` à chaque changement de piste ; gère aussi la règle "solo" : si au moins une piste est soloée, toutes les autres sont mutées côté moteur (sans modifier `track.muted` en base).

- [ ] **Step 1: Écrire le test `apps/web/src/audio/useEngineSync.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProjectStore } from "../store/projectStore";
import { useEngineSync } from "./useEngineSync";

describe("useEngineSync", () => {
  beforeEach(() => useProjectStore.setState({ tracks: [] } as any));

  it("mutes non-soloed tracks when one track is soloed", () => {
    useProjectStore.setState({
      tracks: [
        { id: "t1", orderIndex: 0, name: "A", color: "", volume: 1, pan: 0, muted: false, soloed: true },
        { id: "t2", orderIndex: 1, name: "B", color: "", volume: 1, pan: 0, muted: false, soloed: false },
      ],
    } as any);
    const engine = { setTrackVolume: vi.fn(), setTrackPan: vi.fn(), setTrackMuted: vi.fn() } as any;
    renderHook(() => useEngineSync(engine));
    expect(engine.setTrackMuted).toHaveBeenCalledWith("t1", false);
    expect(engine.setTrackMuted).toHaveBeenCalledWith("t2", true);
  });
});
```

Installer si besoin: `npm install -D @testing-library/react -w apps/web`

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL.

- [ ] **Step 3: Écrire `apps/web/src/audio/useEngineSync.ts`**

```typescript
import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import type { AudioEngine } from "./engine";

export function useEngineSync(engine: AudioEngine): void {
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => {
    const anySoloed = tracks.some((t) => t.soloed);
    for (const t of tracks) {
      engine.setTrackVolume(t.id, t.volume);
      engine.setTrackPan(t.id, t.pan);
      const effectiveMuted = anySoloed ? !t.soloed : t.muted;
      engine.setTrackMuted(t.id, effectiveMuted);
    }
  }, [engine, tracks]);
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS.

- [ ] **Step 5: Appeler `useEngineSync(engine)` dans `apps/web/src/App.tsx`** (l'`AudioEngine` est instancié une fois au niveau App, réutilisant `audioCtx` déjà créé en Task 4.3).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): sync track volume/pan/mute/solo into AudioEngine"
```

---

## Phase 6 — Transport UI (lecture, playhead, seek)

### Task 6.1: `TransportBar` + playhead sur la timeline

**Files:**
- Create: `apps/web/src/components/TransportBar.tsx`
- Modify: `apps/web/src/components/TimelineCanvas.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `Transport` (Task 3.2), `formatTime` (Task 4.1).
- Produces: `<TransportBar transport={Transport} />` avec boutons play/pause/stop et affichage du temps courant ; `TimelineCanvas` reçoit `currentTime: number` et dessine une ligne verticale de playhead, et gère le clic sur la timeline pour appeler `transport.seek(...)`.

- [ ] **Step 1: Écrire `apps/web/src/components/TransportBar.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { Transport } from "../audio/transport";
import { formatTime } from "../lib/time";
import { Button } from "./ui/button";
import { useProjectStore } from "../store/projectStore";

export function TransportBar({ transport, getBufferUrl }: { transport: Transport; getBufferUrl: (mediaId: string) => string }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => transport.onTimeUpdate(setTime), [transport]);

  return (
    <div className="flex items-center gap-2 border-b border-studio-border bg-studio-panel p-2">
      <Button
        onClick={async () => {
          if (playing) { transport.pause(); setPlaying(false); }
          else { await transport.play(clips, tracks, getBufferUrl); setPlaying(true); }
        }}
      >{playing ? "Pause" : "Play"}</Button>
      <Button variant="outline" onClick={() => { transport.stop(); setPlaying(false); }}>Stop</Button>
      <span className="font-mono text-sm tabular-nums">{formatTime(time)}</span>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter le playhead + le seek au clic dans `apps/web/src/components/TimelineCanvas.tsx`**

```tsx
import { useProjectStore } from "../store/projectStore";
import { ClipWaveform } from "./ClipWaveform";
import { secondsToPixels, pixelsToSeconds } from "../lib/time";

export function TimelineCanvas({
  pxPerSecond, currentTime, onSeek,
}: { pxPerSecond: number; currentTime: number; onSeek: (t: number) => void }) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(pixelsToSeconds(e.clientX - rect.left, pxPerSecond));
  }

  return (
    <div className="relative flex-1 overflow-x-auto" onClick={handleClick}>
      <div
        className="pointer-events-none absolute top-0 z-10 h-full w-px bg-orange-400"
        style={{ left: secondsToPixels(currentTime, pxPerSecond) }}
      />
      {tracks.map((track) => (
        <div key={track.id} className="relative h-24 border-b border-studio-border">
          {clips.filter((c) => c.trackId === track.id).map((c) => (
            <ClipWaveform key={c.id} clip={c} pxPerSecond={pxPerSecond} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Câbler dans `apps/web/src/App.tsx`** — créer `transport = new Transport(engine)` une fois, un état `currentTime` mis à jour via `transport.onTimeUpdate`, passer `getBufferUrl={(mediaId) => `/api/media/${mediaId}`}` à `TransportBar`, et `onSeek={(t) => transport.seek(t)}` à `TimelineCanvas`.

- [ ] **Step 4: Vérification manuelle**

Importer deux sons sur deux pistes différentes à des positions différentes, cliquer Play : les deux sons se lisent en synchronisation, le playhead avance, cliquer sur la timeline déplace le playhead et reprend la lecture au bon endroit si "Play" était actif.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add TransportBar and timeline playhead/seek"
```

---

## Phase 7 — Enregistrement micro

### Task 7.1: Capture micro (MediaRecorder) → clip

**Files:**
- Create: `apps/web/src/audio/record.ts`
- Test: `apps/web/src/audio/record.test.ts`
- Modify: `apps/web/src/components/Toolbar.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `decodeAudioFile` (Task 4.3, réutilisé pour décoder le blob enregistré), `uploadMedia` (Task 2.1).
- Produces: classe `MicRecorder` avec `start(): Promise<void>`, `stop(): Promise<Blob>`, `isRecording(): boolean`.

- [ ] **Step 1: Écrire le test `apps/web/src/audio/record.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { MicRecorder } from "./record";

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
    this.onstop?.();
  }
}

describe("MicRecorder", () => {
  it("stop() resolves with a Blob containing recorded chunks", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder as any);
    const fakeStream = {} as MediaStream;
    const recorder = new MicRecorder(fakeStream);
    await recorder.start();
    expect(recorder.isRecording()).toBe(true);
    const blob = await recorder.stop();
    expect(blob).toBeInstanceOf(Blob);
    expect(recorder.isRecording()).toBe(false);
  });
});
```

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL.

- [ ] **Step 3: Écrire `apps/web/src/audio/record.ts`**

```typescript
export class MicRecorder {
  private stream: MediaStream;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recording = false;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.recorder.start();
    this.recording = true;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(new Blob());
      this.recorder.onstop = () => {
        this.recording = false;
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
      };
      this.recorder.stop();
    });
  }
}

export async function requestMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS.

- [ ] **Step 5: Ajouter le bouton "Enregistrer" dans `apps/web/src/components/Toolbar.tsx`**

```tsx
// props ajoutées: isRecording: boolean; onToggleRecord: () => void
<Button variant={isRecording ? "destructive" : "outline"} onClick={onToggleRecord}>
  {isRecording ? "■ Arrêter l'enregistrement" : "● Enregistrer"}
</Button>
```

- [ ] **Step 6: Câbler dans `apps/web/src/App.tsx`**

```tsx
const [micRecorder, setMicRecorder] = useState<MicRecorder | null>(null);
const [isRecording, setIsRecording] = useState(false);

async function handleToggleRecord() {
  if (!isRecording) {
    const stream = await requestMicStream();
    const rec = new MicRecorder(stream);
    await rec.start();
    setMicRecorder(rec);
    setIsRecording(true);
  } else {
    const blob = await micRecorder!.stop();
    setIsRecording(false);
    const file = new File([blob], `Enregistrement ${new Date().toISOString()}.webm`, { type: "audio/webm" });
    await handleImport(file); // réutilise le flux d'import de Task 4.3
  }
}
```

- [ ] **Step 7: Vérification manuelle**

Cliquer "Enregistrer" (autoriser l'accès micro), parler quelques secondes, cliquer "Arrêter" : un nouveau clip apparaît sur la première piste avec la waveform de l'enregistrement.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): add microphone recording to clip"
```

---

## Phase 8 — Persistence: autosave + chargement au démarrage

### Task 8.1: Charger le projet au montage de l'app

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `fetchProject` (Task 2.1), `useProjectStore.loadState` (Task 2.2).

- [ ] **Step 1: Ajouter un `useEffect` de chargement initial dans `App.tsx`**

```tsx
useEffect(() => {
  fetchProject().then((state) => {
    loadState({ tracks: state.tracks, clips: state.clips, media: state.media });
  });
}, []);
```

- [ ] **Step 2: Vérification manuelle**

Importer un son, recharger la page (F5) : tant que l'autosave (Task 8.2) n'est pas branché, le projet apparaît vide au reload — normal à ce stade, corrigé par la task suivante.

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): load persisted project state on startup"
```

### Task 8.2: Autosave debounced + bouton de sauvegarde manuelle + toasts d'erreur

**Files:**
- Create: `apps/web/src/lib/useAutosave.ts`
- Test: `apps/web/src/lib/useAutosave.test.ts`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `saveProject` (Task 2.1), `useProjectStore.tracks/clips`.
- Produces: hook `useAutosave(delayMs: number)` qui appelle `saveProject({ tracks, clips })` `delayMs` après le dernier changement de `tracks`/`clips`, expose `{ status: "idle" | "saving" | "saved" | "error", saveNow: () => Promise<void> }`.

- [ ] **Step 1: Écrire le test `apps/web/src/lib/useAutosave.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectStore } from "../store/projectStore";
import * as client from "../api/client";
import { useAutosave } from "./useAutosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProjectStore.setState({ tracks: [], clips: [] } as any);
  });

  it("calls saveProject after the debounce delay following a change", () => {
    const spy = vi.spyOn(client, "saveProject").mockResolvedValue();
    renderHook(() => useAutosave(1000));
    act(() => {
      useProjectStore.getState().addTrack({ id: "t1", orderIndex: 0, name: "T", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy).toHaveBeenCalledWith({ tracks: expect.any(Array), clips: expect.any(Array) });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL.

- [ ] **Step 3: Écrire `apps/web/src/lib/useAutosave.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { saveProject } from "../api/client";

type Status = "idle" | "saving" | "saved" | "error";

export function useAutosave(delayMs: number) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const [status, setStatus] = useState<Status>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  async function saveNow() {
    setStatus("saving");
    try {
      await saveProject({ tracks: useProjectStore.getState().tracks, clips: useProjectStore.getState().clips });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(saveNow, delayMs);
    return () => clearTimeout(timeoutRef.current);
  }, [tracks, clips, delayMs]);

  return { status, saveNow };
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS.

- [ ] **Step 5: Câbler dans `App.tsx`** et afficher le statut dans `Toolbar` (texte "Sauvegardé" / "Sauvegarde..." / "Erreur de sauvegarde" en rouge avec bouton "Réessayer" appelant `saveNow`).

- [ ] **Step 6: Vérification manuelle**

Importer un son, attendre 2s, recharger la page : le clip est toujours là. Couper le serveur backend, faire un changement : le statut passe à "Erreur de sauvegarde" avec un bouton Réessayer.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): add debounced autosave with status indicator"
```

---

## Phase 9 — Export / mixdown

### Task 9.1: Rendu offline → WAV

**Files:**
- Create: `apps/web/src/audio/export.ts`
- Test: `apps/web/src/audio/export.test.ts`

**Interfaces:**
- Consumes: `AudioEngine.loadBuffer` (réutilisation du cache de buffers), types `Track`/`Clip`.
- Produces: `renderMixdown(clips: Clip[], tracks: Track[], getBufferUrl, sampleRate: number): Promise<AudioBuffer>`, `audioBufferToWav(buffer: AudioBuffer): Blob`.

- [ ] **Step 1: Écrire le test `apps/web/src/audio/export.test.ts`** (teste uniquement l'encodage WAV, pur et sans dépendance au DOM)

```typescript
import { describe, it, expect } from "vitest";
import { audioBufferToWav } from "./export";

function makeFakeBuffer(samples: number[]): AudioBuffer {
  return {
    sampleRate: 44100,
    numberOfChannels: 1,
    length: samples.length,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("audioBufferToWav", () => {
  it("produces a Blob with a valid RIFF/WAVE header", async () => {
    const buffer = makeFakeBuffer([0, 0.5, -0.5, 1, -1]);
    const blob = audioBufferToWav(buffer);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");
  });
});
```

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL.

- [ ] **Step 3: Écrire `apps/web/src/audio/export.ts`**

```typescript
import type { Track, Clip } from "../api/client";

export async function renderMixdown(
  clips: Clip[],
  tracks: Track[],
  getBufferUrl: (mediaId: string) => string,
  sampleRate: number
): Promise<AudioBuffer> {
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) || 1;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
  const bufferCache = new Map<string, AudioBuffer>();

  for (const clip of clips) {
    const track = tracks.find((t) => t.id === clip.trackId);
    if (!track) continue;
    const url = getBufferUrl(clip.mediaId);
    let buffer = bufferCache.get(url);
    if (!buffer) {
      const arrayBuffer = await fetch(url).then((r) => r.arrayBuffer());
      buffer = await offlineCtx.decodeAudioData(arrayBuffer);
      bufferCache.set(url, buffer);
    }
    const gain = offlineCtx.createGain();
    gain.gain.value = track.muted ? 0 : track.volume;
    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = track.pan;
    gain.connect(panner);
    panner.connect(offlineCtx.destination);

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(clip.startTime, clip.sourceOffset, clip.duration);
  }

  return offlineCtx.startRendering();
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add offline mixdown render and WAV encoding"
```

### Task 9.2: Bouton "Exporter" + téléchargement

**Files:**
- Modify: `apps/web/src/components/Toolbar.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `renderMixdown`, `audioBufferToWav` (Task 9.1).

- [ ] **Step 1: Ajouter le bouton dans `Toolbar.tsx`** (prop `onExport: () => void`, état de chargement local `isExporting`)

```tsx
<Button variant="secondary" disabled={isExporting} onClick={onExport}>
  {isExporting ? "Export en cours..." : "Exporter le mixdown"}
</Button>
```

- [ ] **Step 2: Câbler dans `App.tsx`**

```tsx
async function handleExport() {
  const buffer = await renderMixdown(
    useProjectStore.getState().clips,
    useProjectStore.getState().tracks,
    (mediaId) => `/api/media/${mediaId}`,
    44100
  );
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "edito-mixdown.wav";
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Vérification manuelle**

Avec 2-3 clips sur plusieurs pistes, cliquer "Exporter le mixdown" : un fichier `edito-mixdown.wav` se télécharge et, à l'écoute, contient bien le mix synchronisé de toutes les pistes (volumes/pan respectés, pistes mutées absentes).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): wire mixdown export button with WAV download"
```

---

## Phase 10 — Raccourcis clavier, zoom, polish final

### Task 10.1: Raccourcis clavier globaux

**Files:**
- Create: `apps/web/src/lib/keyboard.ts`
- Test: `apps/web/src/lib/keyboard.test.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces: hook `useKeyboardShortcuts(handlers: { onPlayPause, onDelete, onUndo, onRedo })` qui attache/détache un listener `keydown` global : Espace → `onPlayPause` (si le focus n'est pas dans un champ texte), Suppr/Backspace → `onDelete`, Ctrl/Cmd+Z → `onUndo`, Ctrl/Cmd+Shift+Z ou Ctrl+Y → `onRedo`.

- [ ] **Step 1: Écrire le test `apps/web/src/lib/keyboard.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./keyboard";

describe("useKeyboardShortcuts", () => {
  it("calls onPlayPause on Space and onUndo on Ctrl+Z", () => {
    const onPlayPause = vi.fn();
    const onUndo = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onPlayPause, onDelete: vi.fn(), onUndo, onRedo: vi.fn() }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run pour confirmer l'échec** — `npm test -w apps/web` → FAIL.

- [ ] **Step 3: Écrire `apps/web/src/lib/keyboard.ts`**

```typescript
import { useEffect } from "react";

interface Handlers {
  onPlayPause: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function isTextInput(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTextInput(e.target)) return;
      if (e.code === "Space") { e.preventDefault(); handlers.onPlayPause(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { handlers.onDelete(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { handlers.onUndo(); return; }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")) {
        handlers.onRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
```

- [ ] **Step 4: Run** — `npm test -w apps/web` → PASS.

- [ ] **Step 5: Câbler dans `App.tsx`** — `onPlayPause` bascule play/pause du `transport`, `onDelete` appelle `deleteClipWithHistory` sur le clip sélectionné (`useProjectStore.selectedClipId`), `onUndo`/`onRedo` appellent `useHistoryStore.getState().undo()/redo()`.

- [ ] **Step 6: Vérification manuelle**

Sélectionner un clip, appuyer sur Suppr : il disparaît. Ctrl+Z : il revient. Espace : lecture/pause bascule.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): add global keyboard shortcuts"
```

### Task 10.2: Zoom horizontal de la timeline

**Files:**
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components/Toolbar.tsx`

**Interfaces:**
- Produces: état `pxPerSecond` dans `App.tsx` (défaut `100`, bornes `[20, 400]`), deux boutons "+"/"-" dans `Toolbar` qui multiplient/divisent `pxPerSecond` par `1.25`.

- [ ] **Step 1: Ajouter les boutons dans `Toolbar.tsx`** (props `onZoomIn`, `onZoomOut`)

```tsx
<div className="ml-auto flex gap-1">
  <Button size="icon" variant="outline" onClick={onZoomOut}>−</Button>
  <Button size="icon" variant="outline" onClick={onZoomIn}>+</Button>
</div>
```

- [ ] **Step 2: Câbler l'état dans `App.tsx`**

```tsx
const [pxPerSecond, setPxPerSecond] = useState(100);
const zoomIn = () => setPxPerSecond((v) => Math.min(400, v * 1.25));
const zoomOut = () => setPxPerSecond((v) => Math.max(20, v / 1.25));
```

Passer `pxPerSecond` à `TimelineCanvas` (déjà fait) et aux `ClipWaveform` via la prop existante.

- [ ] **Step 3: Vérification manuelle**

Cliquer "+"/"−" : les clips et le playhead s'étirent/se compactent horizontalement de façon cohérente.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add horizontal timeline zoom"
```

---

## Phase 11 — Dockerisation

### Task 11.1: Dockerfile multi-stage

**Files:**
- Create: `Dockerfile`

**Interfaces:**
- Produces: image finale qui écoute sur `0.0.0.0:3000`, contient `apps/server/dist`, `apps/web/dist`, et `node_modules` de production uniquement.

- [ ] **Step 1: Écrire `Dockerfile`**

```dockerfile
# ---- Stage 1: build frontend ----
FROM node:20-alpine AS web-build
WORKDIR /repo
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build -w apps/web

# ---- Stage 2: build backend ----
FROM node:20-alpine AS server-build
WORKDIR /repo
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install
COPY apps/server apps/server
RUN npm run build -w apps/server

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /repo/apps/server/package.json ./package.json
COPY --from=server-build /repo/node_modules ./node_modules
COPY --from=server-build /repo/apps/server/dist ./dist
COPY --from=web-build /repo/apps/web/dist ./web-dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Adapter `apps/server/src/index.ts` pour pointer vers `../web-dist` en prod** (chemin relatif au `WORKDIR` de l'image, différent du chemin dev `../web/dist`)

```typescript
import { existsSync } from "node:fs";

const webDistCandidates = [join(process.cwd(), "web-dist"), join(process.cwd(), "../web/dist")];
const webDist = webDistCandidates.find((p) => existsSync(p)) ?? webDistCandidates[0];
await registerStatic(app, webDist);
```

- [ ] **Step 3: Builder l'image localement pour vérifier**

Run: `docker build -t edito:local .`
Expected: build réussi sans erreur.

Run: `docker run --rm -p 3000:3000 -e DATA_DIR=/data -v edito_test_data:/data edito:local`
Expected: `curl http://localhost:3000/healthz` → `{"status":"ok"}`, `curl http://localhost:3000/` → HTML de l'app React.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile apps/server/src/index.ts
git commit -m "build: add multi-stage Dockerfile"
```

### Task 11.2: `compose.yaml` de production + `.env.example`

**Files:**
- Create: `compose.yaml`, `.env.example`

**Interfaces:**
- Produces: service unique `app` sur le réseau externe `web`, volume nommé `edito_data`, Basic Auth via middleware Traefik, healthcheck sur `/healthz`.

- [ ] **Step 1: Générer le hash Basic Auth (à faire par l'utilisateur, documenté dans le README)**

Commande de référence (htpasswd, format bcrypt) : `htpasswd -nB edito` — le hash produit contient des `$` qui doivent être doublés (`$$`) dans le fichier `.env` lu par Docker Compose.

- [ ] **Step 2: Écrire `compose.yaml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATA_DIR: /data
    volumes:
      - edito_data:/data
    networks:
      - web
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/healthz"]
      interval: 15s
      timeout: 5s
      retries: 5
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.edito.rule=Host(`${APP_DOMAIN}`)
      - traefik.http.routers.edito.entrypoints=websecure
      - traefik.http.routers.edito.tls.certresolver=letsencrypt
      - traefik.http.routers.edito.middlewares=edito-auth
      - traefik.http.middlewares.edito-auth.basicauth.users=${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD_HASH}
      - traefik.http.services.edito.loadbalancer.server.port=3000

volumes:
  edito_data:

networks:
  web:
    external: true
```

- [ ] **Step 3: Écrire `.env.example`**

```env
APP_DOMAIN=edito.louis-nectoux.fr
NODE_ENV=production
BASIC_AUTH_USER=louis
# Générer avec: htpasswd -nB louis   (puis doubler chaque "$" en "$$")
BASIC_AUTH_PASSWORD_HASH=change-me
```

- [ ] **Step 4: Vérification locale**

Run: `docker network create web` (si pas déjà fait localement), `cp .env.example .env` puis éditer, `docker compose up -d --build`, `docker compose ps` → service `app` "healthy".

- [ ] **Step 5: Commit**

```bash
git add compose.yaml .env.example
git commit -m "build: add production compose.yaml with Traefik labels and basic auth"
```

### Task 11.3: README de déploiement

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Réécrire `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add deployment README"
```

---

## Phase 12 — Déploiement continu (GitHub Actions)

### Task 12.1: Workflow de déploiement SSH

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: workflow déclenché sur push `main`, sans étape de test (uniquement déploiement), utilisant les secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`.

- [ ] **Step 1: Écrire `.github/workflows/deploy.yml`**

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_SSH_PORT || 22 }}
          script: |
            set -e
            cd /srv/docker/apps/edito
            git pull origin main
            docker compose up -d --build
            sleep 5
            curl -f http://localhost:3000/healthz || (docker compose logs --tail 100 && exit 1)
```

- [ ] **Step 2: Documenter les secrets requis dans le README** (déjà fait en Task 11.3 — vérifier que les 4 noms de secrets correspondent exactement à ceux utilisés ici : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`).

- [ ] **Step 3: Configurer les secrets sur GitHub** (action manuelle de Louis, pas du code) — `Settings > Secrets and variables > Actions` sur le repo `Sharkooss/Edito` :
  - `VPS_HOST` = `92.222.247.229`
  - `VPS_USER` = utilisateur SSH du VPS
  - `VPS_SSH_KEY` = clé privée SSH (celle dont la publique est déjà autorisée sur le VPS)
  - `VPS_SSH_PORT` = port SSH si non standard (sinon ne pas définir, le défaut `22` s'applique)

- [ ] **Step 4: Première mise en route manuelle sur le VPS** (avant que le workflow puisse fonctionner, le répertoire doit exister) :

```bash
ssh <user>@92.222.247.229
sudo mkdir -p /srv/docker/apps/edito
sudo chown $USER:$USER /srv/docker/apps/edito
cd /srv/docker/apps/edito
git clone https://github.com/Sharkooss/Edito.git .
cp .env.example .env && nano .env
docker network create web 2>/dev/null || true   # no-op si déjà créé par Traefik
docker compose up -d --build
```

- [ ] **Step 5: Vérification**

Faire un `git push` sur `main` depuis le poste de dev, ouvrir l'onglet "Actions" du repo GitHub : le job `deploy` doit passer au vert et `https://edito.louis-nectoux.fr` doit répondre (avec l'invite Basic Auth).

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions deploy workflow"
```

---

## Phase 13 — Intégration finale et vérification manuelle bout-en-bout

### Task 13.1: Parcours utilisateur complet

**Files:** aucun fichier nouveau — vérification manuelle uniquement.

- [ ] **Step 1: Lancer `npm run dev:server` et `npm run dev:web`**, ouvrir `http://localhost:5173`.

- [ ] **Step 2: Scénario complet** :
  1. Ajouter 2 pistes.
  2. Importer un fichier audio sur la piste 1.
  3. Enregistrer un extrait micro, vérifier qu'il atterrit sur une piste.
  4. Déplacer/couper (double-clic pour split côté droit du curseur, ou sélectionner puis couper via l'action câblée) un clip.
  5. Ajuster volume/pan d'une piste, tester mute puis solo.
  6. Lancer la lecture, vérifier la synchronisation et le playhead, seek en cliquant sur la timeline.
  7. Recharger la page (F5) : le projet est intact (autosave).
  8. Exporter le mixdown, écouter le fichier téléchargé : conforme au mix entendu dans le navigateur.
  9. Tester Ctrl+Z/Ctrl+Y sur plusieurs actions successives.

- [ ] **Step 3: Lancer toute la suite de tests**

Run: `npm test -w apps/server && npm test -w apps/web`
Expected: tous les tests PASS.

- [ ] **Step 4: Build de production local**

Run: `npm run build && docker build -t edito:local . && docker run --rm -p 3000:3000 -v edito_local_test:/data edito:local`
Expected: `http://localhost:3000` sert l'app complète et fonctionnelle (sans Basic Auth en local, celle-ci n'existant qu'au niveau Traefik en prod).

- [ ] **Step 5: Déploiement réel** — suivre Task 12.1 Step 4, puis pousser sur `main` pour valider le pipeline CD.

- [ ] **Step 6: Commit final (si des ajustements ont été nécessaires)**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```


