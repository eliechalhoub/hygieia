import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

// CREATE TABLE statements are generated from the Drizzle schema so there is a
// single source of truth and no migration tool to install.

function literal(v: unknown): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function createTableSql(table: SQLiteTable, nameOverride?: string): string[] {
  const cfg = getTableConfig(table);
  const name = nameOverride ?? cfg.name;
  const cols = cfg.columns.map((c) => {
    let s = `"${c.name}" ${c.getSQLType()}`;
    if (c.primary) s += " PRIMARY KEY";
    if ((c as unknown as { autoIncrement?: boolean }).autoIncrement) s += " AUTOINCREMENT";
    if (c.notNull && !c.primary) s += " NOT NULL";
    if (c.hasDefault && c.default !== undefined) s += ` DEFAULT ${literal(c.default)}`;
    return s;
  });
  const out = [`CREATE TABLE IF NOT EXISTS "${name}" (${cols.join(", ")})`];
  for (const idx of cfg.indexes) {
    const columns = idx.config.columns.map((c) => `"${(c as { name: string }).name}"`).join(", ");
    out.push(`CREATE INDEX IF NOT EXISTS "${idx.config.name}" ON "${name}" (${columns})`);
  }
  return out;
}

export const TABLES: SQLiteTable[] = [
  schema.astronauts, schema.mission, schema.metricSamples, schema.checkins, schema.pvtResults,
  schema.journalEntries, schema.sharingPrefs, schema.standingOrders, schema.alerts, schema.incidents,
  schema.incidentEvents, schema.messages, schema.reminders, schema.timelineEvents,
  schema.environmentSamples, schema.visionChecks, schema.doseSamples, schema.spaceWeatherEvents,
];

/** All DDL. `sources` is a view over a table filled from content/sources.json. */
export function allDdl(): string[] {
  const stmts = TABLES.flatMap((t) => createTableSql(t));
  stmts.push(...createTableSql(schema.sources, "sources_json"));
  stmts.push(`CREATE VIEW IF NOT EXISTS "sources" AS SELECT * FROM "sources_json"`);
  return stmts;
}

export function dropAllSql(): string[] {
  const names = TABLES.map((t) => getTableConfig(t).name);
  return [`DROP VIEW IF EXISTS "sources"`, `DROP TABLE IF EXISTS "sources_json"`, ...names.map((n) => `DROP TABLE IF EXISTS "${n}"`)];
}
