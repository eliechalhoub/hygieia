import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

export type Db = BetterSQLite3Database<typeof schema>;

interface Handle {
  sqlite: Database.Database;
  db: Db;
  path: string;
}

const g = globalThis as unknown as { __hygieia?: Handle };

export function dbPath(): string {
  return process.env.HYGIEIA_DB ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "hygieia.db");
}

function open(file: string): Handle {
  const sqlite = new Database(/*turbopackIgnore: true*/ file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  // Wait for another writer (a second tab or server) instead of failing at once.
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }), path: file };
}

function isSeeded(sqlite: Database.Database): boolean {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mission'").get();
  if (!row) return false;
  return Boolean(sqlite.prepare("SELECT id FROM mission LIMIT 1").get());
}

/**
 * Shared connection. If the database file is missing or empty (fresh clone,
 * container cold start) it is seeded on first use.
 */
export function getHandle(opts: { autoSeed?: boolean } = {}): Handle {
  const file = dbPath();
  if (g.__hygieia && g.__hygieia.path === file && fs.existsSync(/*turbopackIgnore: true*/ file)) return g.__hygieia;
  if (g.__hygieia) {
    try { g.__hygieia.sqlite.close(); } catch { /* already closed */ }
  }
  const handle = open(file);
  if (opts.autoSeed !== false && !isSeeded(handle.sqlite)) seedDatabase(handle.sqlite, handle.db);
  g.__hygieia = handle;
  return handle;
}

export function getDb(): Db {
  return getHandle().db;
}

export function getSqlite(): Database.Database {
  return getHandle().sqlite;
}

export { schema };
