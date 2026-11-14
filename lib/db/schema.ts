import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Single-file SQLite database (hygieia.db). The demo is rebuilt from the seed
// on every cold start, so there are no migrations — see lib/db/ddl.ts.

export const astronauts = sqliteTable("astronauts", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  role: text("role").notNull(),
  agency: text("agency").notNull(),
  age: integer("age").notNull(),
  /** JSON array of training tags, e.g. ["EVA","CMO"]. */
  trained: text("trained").notNull(),
  bio: text("bio").notNull(),
});

export const mission = sqliteTable("mission", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  currentDay: integer("current_day").notNull(),
  maxDay: integer("max_day").notNull(),
  environmentProfile: text("environment_profile").notNull(),
  commsDelaySeconds: real("comms_delay_seconds").notNull(),
  seed: integer("seed").notNull(),
  seededAt: text("seeded_at").notNull(),
});

export const metricSamples = sqliteTable(
  "metric_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    astronautId: integer("astronaut_id").notNull(),
    metric: text("metric").notNull(),
    missionDay: integer("mission_day").notNull(),
    ts: text("ts").notNull(),
    value: real("value").notNull(),
    /** "sensor" or "manual". */
    source: text("source").notNull(),
  },
  (t) => [index("idx_metric_samples").on(t.astronautId, t.metric, t.ts)],
);

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id").notNull(),
  missionDay: integer("mission_day").notNull(),
  ts: text("ts").notNull(),
  mood: real("mood"),
  headache: integer("headache", { mode: "boolean" }).notNull().default(false),
  crewTimeHours: real("crew_time_hours"),
  note: text("note"),
});

export const pvtResults = sqliteTable("pvt_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id").notNull(),
  missionDay: integer("mission_day").notNull(),
  ts: text("ts").notNull(),
  meanRtMs: real("mean_rt_ms").notNull(),
  lapses: integer("lapses").notNull(),
  trials: integer("trials").notNull(),
});

/** Private journal: never shared, never visible to Houston or the AI agent. */
export const journalEntries = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id").notNull(),
  missionDay: integer("mission_day").notNull(),
  ts: text("ts").notNull(),
  body: text("body").notNull(),
});

export const sharingPrefs = sqliteTable("sharing_prefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id").notNull(),
  category: text("category").notNull(),
  shared: integer("shared", { mode: "boolean" }).notNull(),
});

export const standingOrders = sqliteTable("standing_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metric: text("metric").notNull(),
  operator: text("operator").notNull(),
  value: real("value").notNull(),
  consecutiveDays: integer("consecutive_days").notNull(),
  advice: text("advice").notNull(),
  surgeon: text("surgeon").notNull(),
  astronautId: integer("astronaut_id"),
  createdAt: text("created_at").notNull(),
  /** Wall-clock time the order reaches the spacecraft (delayed link). */
  activeAt: text("active_at").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id"),
  missionDay: integer("mission_day").notNull(),
  rule: text("rule").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  advice: text("advice").notNull(),
  authorisedBy: text("authorised_by"),
  sourceIds: text("source_ids"),
  createdAt: text("created_at").notNull(),
});

export const incidents = sqliteTable("incidents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id"),
  missionDay: integer("mission_day").notNull(),
  tree: text("tree").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  summary: text("summary").notNull(),
  profile: text("profile").notNull(),
  rawBytes: integer("raw_bytes"),
  gzipBytes: integer("gzip_bytes"),
});

export const incidentEvents = sqliteTable("incident_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  incidentId: integer("incident_id").notNull(),
  ts: text("ts").notNull(),
  node: text("node").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  detail: text("detail"),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** "to_earth" or "to_ship". */
  direction: text("direction").notNull(),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  author: text("author").notNull(),
  sentAt: text("sent_at").notNull(),
  deliverAt: text("deliver_at").notNull(),
  status: text("status").notNull(),
  payloadBytes: integer("payload_bytes").notNull(),
  rawBytes: integer("raw_bytes"),
  /** Base64 gzip payload for incident reports. */
  payloadB64: text("payload_b64"),
  incidentId: integer("incident_id"),
  missionDay: integer("mission_day").notNull(),
});

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id"),
  missionDay: integer("mission_day").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  /** "timeline", "agent", "manual". */
  origin: text("origin").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const timelineEvents = sqliteTable("timeline_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** EVA, docking, solar_particle_event, gravity_transition. */
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  missionDay: integer("mission_day").notNull(),
  detail: text("detail"),
  /** JSON array of astronaut ids. */
  assigned: text("assigned").notNull().default("[]"),
  requires: text("requires"),
  sourceUrl: text("source_url"),
});

export const environmentSamples = sqliteTable(
  "environment_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    missionDay: integer("mission_day").notNull(),
    hour: integer("hour").notNull(),
    ts: text("ts").notNull(),
    co2MmHg: real("co2_mmhg").notNull(),
    pressureKpa: real("pressure_kpa").notNull(),
    tempC: real("temp_c").notNull(),
    noiseDba: real("noise_dba").notNull(),
    lightLux: real("light_lux").notNull(),
  },
  (t) => [index("idx_env_day").on(t.missionDay)],
);

export const visionChecks = sqliteTable("vision_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  astronautId: integer("astronaut_id").notNull(),
  missionDay: integer("mission_day").notNull(),
  ts: text("ts").notNull(),
  acuityScore: real("acuity_score").notNull(),
  gridDistortion: integer("grid_distortion", { mode: "boolean" }).notNull(),
  blurNear: integer("blur_near", { mode: "boolean" }).notNull(),
  headache: integer("headache", { mode: "boolean" }).notNull(),
  score: real("score").notNull(),
});

export const doseSamples = sqliteTable(
  "dose_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    astronautId: integer("astronaut_id").notNull(),
    missionDay: integer("mission_day").notNull(),
    ts: text("ts").notNull(),
    totalMSv: real("total_msv").notNull(),
    neutronMSv: real("neutron_msv").notNull(),
    /** "model" or "real_replay". */
    source: text("source").notNull(),
  },
  (t) => [index("idx_dose").on(t.astronautId, t.missionDay)],
);

export const spaceWeatherEvents = sqliteTable("space_weather_events", {
  id: text("id").primaryKey(),
  /** SEP, FLR, CME, GST. */
  kind: text("kind").notNull(),
  realTime: text("real_time").notNull(),
  missionDay: integer("mission_day"),
  sLevel: integer("s_level"),
  classType: text("class_type"),
  note: text("note"),
  sourceUrl: text("source_url").notNull(),
});

/** Backed by content/sources.json; loaded at seed time. */
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  agency: text("agency").notNull(),
  url: text("url").notNull(),
  value: real("value"),
  unit: text("unit"),
  usedFor: text("used_for").notNull(),
  credit: text("credit").notNull(),
  kind: text("kind").notNull(),
  fetchedAt: text("fetched_at"),
});
