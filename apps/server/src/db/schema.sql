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
