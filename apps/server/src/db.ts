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
