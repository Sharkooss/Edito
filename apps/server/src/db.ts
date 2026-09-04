import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | undefined;

// Columns added after v1 shipped. `CREATE TABLE IF NOT EXISTS` is a no-op on a
// database that already has the table, so an already-deployed edito.db would
// never gain these without an explicit ALTER.
const CLIP_COLUMNS_ADDED_AFTER_V1: ReadonlyArray<readonly [string, string]> = [
  ["gain", "REAL NOT NULL DEFAULT 1"],
  ["fade_in", "REAL NOT NULL DEFAULT 0"],
  ["fade_out", "REAL NOT NULL DEFAULT 0"],
  ["effects", "TEXT NOT NULL DEFAULT '{}'"],
];

function migrate(instance: Database.Database): void {
  const existing = new Set(
    (instance.prepare("PRAGMA table_info(clip)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  for (const [column, definition] of CLIP_COLUMNS_ADDED_AFTER_V1) {
    if (!existing.has(column)) instance.exec(`ALTER TABLE clip ADD COLUMN ${column} ${definition}`);
  }
}

export function getDb(): Database.Database {
  if (db) return db;
  const dataDir = process.env.DATA_DIR ?? join(__dirname, "../../../data");
  const instance = new Database(join(dataDir, "edito.db"));
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  // Schema application must succeed before caching the connection: if it throws
  // (e.g. schema.sql missing from the deployed build) and we cached `db` anyway,
  // every later call would silently reuse a connection that never got its schema,
  // permanently hiding "no such table" errors on any table added since the last
  // successful boot instead of retrying on the next call.
  const schema = readFileSync(join(__dirname, "db/schema.sql"), "utf-8");
  instance.exec(schema);
  migrate(instance);
  db = instance;
  return db;
}

export function resetDbForTests(): void {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "db/schema.sql"), "utf-8");
  db.exec(schema);
  migrate(db);
}
