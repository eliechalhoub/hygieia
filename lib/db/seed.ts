import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { METRICS, METRIC_BY_ID } from "@/lib/engine/metrics";
import type { MetricId } from "@/lib/engine/types";
import { getProfile, type ProfileId } from "@/lib/profiles";
import { loadDonki, pickAnchorSep, replayOntoMission, sepDoseIncrement, type ReplayedEvent } from "@/lib/data/spaceWeather";
import { MISSION_EPOCH_MS } from "@/lib/data/environment";
import { SHARING_CATEGORIES } from "@/lib/sharing";
import { rebuildAlerts } from "@/lib/server/alerts";
import { allDdl, dropAllSql } from "./ddl";
import * as s from "./schema";

type Db = BetterSQLite3Database<typeof s>;

export const DEFAULT_SEED = 2026;
export const MAX_DAY = 150;
export const DEMO_DAY = 143;
export { MISSION_EPOCH_MS };
export const SURGEON = "Dr. Nadia Rahme (flight surgeon)";

export function tsFor(day: number, hour = 8): string {
  return new Date(MISSION_EPOCH_MS + (day - 1) * 86400e3 + hour * 3600e3).toISOString();
}

// --- Seeded random numbers --------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function streamSeed(seed: number, a: number, b: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (b + 0x165667b1), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// --- Crew ---------------------------------------------------------------------

type Base = Record<Exclude<MetricId, "dose_daily">, [mean: number, amplitude: number]>;

const BASE: Base = {
  sleep_hours: [7.3, 0.5], sleep_regularity: [86, 5], light_exposure: [4.2, 0.8], mood: [7.6, 0.7],
  pvt_rt: [262, 14], pvt_lapses: [1, 1], vision_score: [92, 3], balance_score: [88, 4],
  hr: [58, 3], hrv: [64, 6], bp_sys: [116, 5], bp_dia: [74, 4], spo2: [97.6, 0.7],
  exercise_min: [118, 12], activity: [236, 24], temp: [36.6, 0.2], glucose: [92, 7],
  hydration: [2.6, 0.3], calories: [2450, 220],
};

interface CrewSeed {
  id: number; name: string; shortName: string; role: string; agency: string; age: number;
  trained: string[]; bio: string;
  /** Offsets added to the shared base means. */
  offsets: Partial<Record<MetricId, number>>;
}

// The crew is fictional. Any resemblance to real astronauts is unintended.
export const CREW: CrewSeed[] = [
  { id: 1, name: "Leila Haddad", shortName: "Haddad", role: "Commander", agency: "Fictional crew", age: 41, trained: ["EVA", "docking"],
    bio: "Mission commander and lead for EVA operations.", offsets: {} },
  { id: 2, name: "Kenji Sato", shortName: "Sato", role: "Flight engineer", agency: "Fictional crew", age: 38, trained: ["EVA", "docking"],
    bio: "Flight engineer, robotics and EVA.", offsets: { sleep_hours: -0.2, hr: -3, hrv: 8, mood: 0.2, pvt_rt: -10, exercise_min: 6, bp_sys: -3 } },
  { id: 3, name: "Mateus Oliveira", shortName: "Oliveira", role: "Mission specialist", agency: "Fictional crew", age: 35, trained: ["EVA"],
    bio: "Geologist and payload specialist.", offsets: { sleep_hours: 0.3, hr: 4, hrv: -6, bp_sys: 5, bp_dia: 3, glucose: 4, calories: 250, hydration: 0.3 } },
  { id: 4, name: "Amara Okafor", shortName: "Okafor", role: "Crew medical officer", agency: "Fictional crew", age: 44, trained: ["CMO", "docking"],
    bio: "Physician and crew medical officer.", offsets: { hr: 2, hrv: -3, mood: -0.2, pvt_rt: 8, temp: 0.1, calories: -300, hydration: -0.2, exercise_min: -4 } },
];

// --- Scripted storyline --------------------------------------------------------

interface Effect { add: number; noise?: number }
const NONE: Effect = { add: 0 };

function seq(day: number, start: number, values: number[]): number | null {
  const i = day - start;
  return i >= 0 && i < values.length ? values[i] : null;
}

/** Scripted deviations from each astronaut's own normal. */
export function storyEffect(astro: number, metric: MetricId, day: number): Effect {
  const pick = (start: number, values: number[], noise = 0.08): Effect | null => {
    const v = seq(day, start, values);
    return v === null ? null : { add: v, noise };
  };
  let e: Effect | null = null;

  if (astro === 1) {
    // Haddad: sleep falls for several nights; mood, HRV and reactions follow.
    // Days 144+ show the recovery if the path back to green is followed.
    if (metric === "sleep_hours") e = pick(138, [-0.5, -1.1, -1.7, -1.9, -2.1, -2.2, -0.3, -0.2, 0]);
    if (metric === "sleep_regularity") e = pick(139, [-4, -8, -11, -12, -13, -7, -3, 0]);
    if (metric === "mood") e = pick(140, [-0.5, -1.2, -1.8, -2.4, -1.85, -1.3, -0.9, -0.4, 0]);
    if (metric === "hrv") e = pick(140, [-3, -6, -8, -10, -6, -3, 0]);
    if (metric === "hr") e = pick(141, [2, 3, 4, 3, 1, 0]);
    if (metric === "pvt_rt") e = pick(141, [8, 16, 24, 12, 4, 0]);
    if (metric === "pvt_lapses") e = pick(142, [1, 1, 0]);
  }
  if (astro === 2) {
    // Sato: a week of sleep-schedule drift early in the mission.
    if (metric === "sleep_regularity") e = pick(30, [-8, -14, -16, -17, -16, -12, -6]);
  }
  if (astro === 3) {
    // Oliveira: a mild infection around Day 61, and a slow slide in the vision self-check.
    if (metric === "temp") e = pick(61, [0.5, 0.8, 0.9, 0.7, 0.4, 0.1]);
    if (metric === "hr") e = pick(61, [6, 10, 11, 8, 4, 1]);
    if (metric === "hrv") e = pick(61, [-6, -12, -13, -9, -4, 0]);
    if (metric === "mood") e = pick(61, [-0.6, -1.2, -1.2, -0.8, -0.3]);
    if (metric === "activity") e = pick(61, [-40, -80, -90, -60, -30]);
    if (metric === "exercise_min") e = pick(62, [-60, -80, -50, -20]);
    if (metric === "vision_score") {
      if (day >= 84 && day < 112) e = { add: -Math.min(9, Math.floor((day - 84) / 7 + 1) * 3), noise: 0.3 };
      else if (day >= 112) e = { add: -9 };
    }
  }
  if (astro === 4) {
    // Okafor: three low-fluid days, then two weeks of missed exercise.
    if (metric === "hydration") e = pick(95, [-0.9, -1.0, -0.8]);
    if (metric === "hr" && day >= 96 && day <= 97) e = { add: 5, noise: 0.4 };
    if (metric === "exercise_min" && day >= 100 && day <= 113) e = { add: -46, noise: 0.5 };
    if (metric === "activity" && day >= 100 && day <= 113) e = { add: -50, noise: 0.5 };
  }
  // Whole crew: cabin CO₂ episode on Days 80–82 slows reaction times.
  if (metric === "pvt_rt" && day >= 80 && day <= 82 && !e) e = { add: astro === 2 ? 14 : 24, noise: 0.4 };

  return e ?? NONE;
}

const CO2_EPISODE = { start: 80, end: 82 };

function clampMetric(metric: MetricId, v: number): number {
  switch (metric) {
    case "spo2": return Math.min(100, Math.max(80, v));
    case "mood": return Math.min(10, Math.max(1, v));
    case "pvt_lapses": return Math.max(0, Math.round(v));
    case "sleep_regularity": case "vision_score": case "balance_score": return Math.min(100, Math.max(0, v));
    case "sleep_hours": return Math.min(11, Math.max(2, v));
    default: return Math.max(0, v);
  }
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// --- Dose ---------------------------------------------------------------------

/**
 * Dose samples for a profile: the sourced mean daily dose equivalent with
 * ±15 % day-to-day noise, plus a spike when a real solar particle event is
 * replayed. (Event timing is real; the size of the spike is a demo value.)
 */
export function writeDose(db: Db, profileId: ProfileId, seed: number, replay: ReplayedEvent[], maxDay = MAX_DAY): void {
  const profile = getProfile(profileId);
  db.delete(s.doseSamples).run();
  db.delete(s.metricSamples).where(eq(s.metricSamples.metric, "dose_daily")).run();
  const doseRows: (typeof s.doseSamples.$inferInsert)[] = [];
  const metricRows: (typeof s.metricSamples.$inferInsert)[] = [];
  for (const c of CREW) {
    const rand = mulberry32(streamSeed(seed, c.id, 9001));
    // Small fixed personal factor: where each bunk sits behind shielding (demo value).
    const personal = 0.97 + 0.02 * (c.id - 1);
    for (let day = 1; day <= maxDay; day++) {
      const noise = 1 + 0.15 * (2 * rand() - 1);
      let total = profile.dose.mSv_per_day * personal * noise;
      let sep = 0;
      // On Earth the atmosphere and magnetic field stop these particles: no spike in Earth mode.
      if (!profile.earth) for (const e of replay) sep += sepDoseIncrement(e, day);
      total += sep * personal;
      const neutron = (total - sep * personal) * profile.dose.neutron_share * (1 + 0.05 * (2 * rand() - 1));
      doseRows.push({
        astronautId: c.id, missionDay: day, ts: tsFor(day, 23), totalMSv: round(total, 3), neutronMSv: round(neutron, 3),
        source: sep > 0 ? "real_replay" : "model",
      });
      metricRows.push({ astronautId: c.id, metric: "dose_daily", missionDay: day, ts: tsFor(day, 23), value: round(total, 3), source: "sensor" });
    }
  }
  for (const part of chunk(doseRows, 500)) db.insert(s.doseSamples).values(part).run();
  for (const part of chunk(metricRows, 500)) db.insert(s.metricSamples).values(part).run();
}

/** Real space-weather events replayed on the mission clock. */
export function loadReplay(maxDay = MAX_DAY): ReplayedEvent[] {
  const donki = loadDonki();
  if (!donki) return [];
  return replayOntoMission(donki.events, pickAnchorSep(donki.events), maxDay);
}

/** One timeline event per replayed storm (several instruments report the same event). */
export function stormDays(replay: ReplayedEvent[]): ReplayedEvent[] {
  const byDay = new Map<number, ReplayedEvent>();
  for (const e of replay) {
    if (!e.crewRelevant || e.missionDay === null) continue;
    const cur = byDay.get(e.missionDay);
    if (!cur || (e.hardSpectrum && !cur.hardSpectrum)) byDay.set(e.missionDay, e);
  }
  // Merge storms on consecutive days into the first day.
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const out: ReplayedEvent[] = [];
  for (const d of days) {
    if (out.length && d - out[out.length - 1].missionDay! <= 1) continue;
    out.push(byDay.get(d)!);
  }
  return out;
}

// --- Main seed ------------------------------------------------------------------

export interface SeedOptions {
  seed?: number;
  day?: number;
  profile?: ProfileId;
  quiet?: boolean;
}

export function seedDatabase(sqlite: Database.Database, db: Db, opts: SeedOptions = {}): void {
  const seed = opts.seed ?? Number(process.env.HYGIEIA_SEED ?? DEFAULT_SEED);
  const day = opts.day ?? Number(process.env.HYGIEIA_DAY ?? DEMO_DAY);
  const profileId = opts.profile ?? ((process.env.HYGIEIA_PROFILE as ProfileId) || "transit");
  const profile = getProfile(profileId);
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  const run = sqlite.transaction(() => {
    for (const stmt of dropAllSql()) sqlite.exec(stmt);
    for (const stmt of allDdl()) sqlite.exec(stmt);

    db.insert(s.mission).values({
      id: 1, name: "Mars transit mission", currentDay: day, maxDay: MAX_DAY,
      environmentProfile: profile.id, commsDelaySeconds: profile.comms.demo_one_way_s, seed, seededAt: new Date(now).toISOString(),
    }).run();

    db.insert(s.astronauts).values(CREW.map((c) => ({
      id: c.id, name: c.name, shortName: c.shortName, role: c.role, agency: c.agency, age: c.age,
      trained: JSON.stringify(c.trained), bio: c.bio,
    }))).run();

    // Sources (the `sources` view reads this table).
    const sourcesPath = path.join(process.cwd(), "content", "sources.json");
    const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8")) as { sources: Record<string, unknown>[] };
    const insSource = sqlite.prepare(
      `INSERT INTO sources_json (id, title, agency, url, value, unit, used_for, credit, kind, fetched_at) VALUES (@id, @title, @agency, @url, @value, @unit, @used_for, @credit, @kind, @fetched_at)`,
    );
    for (const src of sources.sources) {
      insSource.run({ value: null, unit: null, fetched_at: null, ...src, ...(Array.isArray(src.value) ? { value: null } : {}) });
    }

    // Metric samples.
    const rows: (typeof s.metricSamples.$inferInsert)[] = [];
    const pvtRows: (typeof s.pvtResults.$inferInsert)[] = [];
    const visionRows: (typeof s.visionChecks.$inferInsert)[] = [];
    const checkinRows: (typeof s.checkins.$inferInsert)[] = [];
    for (const c of CREW) {
      const perDay = new Map<number, Partial<Record<MetricId, number>>>();
      METRICS.forEach((def, mi) => {
        if (def.id === "dose_daily") return;
        const rand = mulberry32(streamSeed(seed, c.id, mi + 1));
        const [mean, amp] = BASE[def.id as keyof Base];
        const centre = mean + (c.offsets[def.id] ?? 0);
        for (let d = 1; d <= MAX_DAY; d++) {
          const u = rand();
          if (def.cadence === "weekly" && (d + c.id) % 7 !== 0) continue;
          const eff = storyEffect(c.id, def.id, d);
          const raw = centre + eff.add + amp * (eff.noise ?? 1) * (2 * u - 1);
          const value = round(clampMetric(def.id, raw), def.decimals);
          const source = def.source === "manual" ? "manual" : "sensor";
          rows.push({ astronautId: c.id, metric: def.id, missionDay: d, ts: tsFor(d, def.source === "actigraphy" ? 7 : 8), value, source });
          if (!perDay.has(d)) perDay.set(d, {});
          perDay.get(d)![def.id] = value;
        }
      });
      const rand = mulberry32(streamSeed(seed, c.id, 777));
      for (let d = 1; d <= MAX_DAY; d++) {
        const v = perDay.get(d)!;
        pvtRows.push({ astronautId: c.id, missionDay: d, ts: tsFor(d, 9), meanRtMs: v.pvt_rt!, lapses: v.pvt_lapses!, trials: 12 });
        if (v.vision_score !== undefined) {
          visionRows.push({
            astronautId: c.id, missionDay: d, ts: tsFor(d, 10), acuityScore: v.vision_score, gridDistortion: false,
            blurNear: v.vision_score < 86, headache: false, score: v.vision_score,
          });
        }
        const lonely = c.id === 1 && d >= 139 && d <= 143;
        const co2 = d >= CO2_EPISODE.start && d <= CO2_EPISODE.end && c.id !== 2;
        checkinRows.push({
          astronautId: c.id, missionDay: d, ts: tsFor(d, 20), mood: v.mood!, headache: co2,
          crewTimeHours: round(lonely ? 0.2 * rand() : 0.8 + rand(), 1),
          note: null,
        });
      }
    }
    for (const part of chunk(rows, 500)) db.insert(s.metricSamples).values(part).run();
    for (const part of chunk(pvtRows, 500)) db.insert(s.pvtResults).values(part).run();
    for (const part of chunk(visionRows, 500)) db.insert(s.visionChecks).values(part).run();
    for (const part of chunk(checkinRows, 500)) db.insert(s.checkins).values(part).run();

    // Cabin environment, every 2 hours. Demo values with a daily rhythm.
    const envRand = mulberry32(streamSeed(seed, 0, 4242));
    const envRows: (typeof s.environmentSamples.$inferInsert)[] = [];
    const cabin = profile.thresholds.cabin;
    for (let d = 1; d <= MAX_DAY; d++) {
      for (let hour = 0; hour < 24; hour += 2) {
        const night = hour < 6 || hour >= 22;
        const episode = d >= CO2_EPISODE.start && d <= CO2_EPISODE.end;
        const co2 = (night ? 2.5 : 2.1) + 0.25 * (2 * envRand() - 1) + (hour >= 16 && hour < 20 ? 0.2 : 0) + (episode ? 2.3 + 0.4 * envRand() : 0);
        envRows.push({
          missionDay: d, hour, ts: tsFor(d, hour),
          co2MmHg: round(co2, 2),
          pressureKpa: round(cabin.pressure_kPa.nominal + 0.4 * (2 * envRand() - 1), 2),
          tempC: round(22.4 + (night ? -0.8 : 0.4) + 0.5 * (2 * envRand() - 1), 1),
          noiseDba: round((night ? 50 : 57) + 2.5 * (2 * envRand() - 1), 1),
          lightLux: round(night ? 4 + 4 * envRand() : 380 + 90 * (2 * envRand() - 1), 0),
        });
      }
    }
    for (const part of chunk(envRows, 500)) db.insert(s.environmentSamples).values(part).run();

    // Real space weather, replayed on the mission clock.
    const replay = loadReplay();
    if (replay.length) {
      for (const part of chunk(replay, 200)) {
        db.insert(s.spaceWeatherEvents).values(part.map((e) => ({
          id: e.id, kind: e.kind, realTime: e.time, missionDay: e.missionDay, sLevel: e.sLevel,
          classType: e.classType ?? null,
          note: e.instruments?.join("; ") ?? e.note ?? null,
          sourceUrl: e.link,
        }))).onConflictDoNothing().run();
      }
    }
    writeDose(db, profile.id, seed, replay);

    // Timeline.
    const timeline: (typeof s.timelineEvents.$inferInsert)[] = [
      { kind: "docking", title: "Dock with transfer habitat", missionDay: 2, assigned: "[1,2]", requires: "docking", detail: "Completed." },
      { kind: "EVA", title: "Solar array inspection", missionDay: 96, assigned: "[2,3]", requires: "EVA", detail: "Completed. 5 h 40 min." },
      { kind: "EVA", title: "High-gain antenna repair", missionDay: 145, assigned: "[1,3]", requires: "EVA", detail: "Planned 6 h spacewalk." },
      { kind: "docking", title: "Docking drill with pre-placed lander", missionDay: 149, assigned: "[2]", requires: "docking", detail: "Manual approach drill." },
      { kind: "gravity_transition", title: "Prepare for 3/8 g: landing readiness", missionDay: 150, assigned: "[1,2,3,4]", requires: null, detail: "Balance checks begin after landing." },
    ];
    for (const e of stormDays(replay)) {
      timeline.push({
        kind: "solar_particle_event", title: "Solar particle event", missionDay: e.missionDay!, assigned: "[1,2,3,4]", requires: null,
        detail: `Replay of the real event of ${e.time.slice(0, 16).replace("T", " ")} UTC (${(e.instruments ?? []).join(", ")}). NOAA S1 or higher.`,
        sourceUrl: e.link,
      });
    }
    db.insert(s.timelineEvents).values(timeline).run();

    // Smart reminders derived from the timeline.
    const reminders: (typeof s.reminders.$inferInsert)[] = [];
    for (const t of timeline) {
      const ids = JSON.parse(t.assigned ?? "[]") as number[];
      for (const id of ids) {
        if (t.kind === "solar_particle_event") {
          reminders.push({ astronautId: id, missionDay: t.missionDay, title: "Log your dosimeter after the solar particle event", detail: t.detail ?? null, origin: "timeline", done: t.missionDay < day, createdAt: tsFor(t.missionDay) });
        }
        if (t.kind === "EVA") {
          reminders.push({ astronautId: id, missionDay: t.missionDay - 1, title: `Reaction test before EVA: ${t.title}`, detail: "60-second PVT the evening before.", origin: "timeline", done: t.missionDay - 1 < day, createdAt: tsFor(t.missionDay - 1) });
          reminders.push({ astronautId: id, missionDay: t.missionDay + 1, title: `Post-EVA check: ${t.title}`, detail: "Joints, skin, breathing, hydration.", origin: "timeline", done: t.missionDay + 1 < day, createdAt: tsFor(t.missionDay + 1) });
        }
        if (t.kind === "gravity_transition") {
          reminders.push({ astronautId: id, missionDay: t.missionDay, title: "Balance check after gravity transition", detail: "Stand, turn head, walk heel-to-toe.", origin: "timeline", done: false, createdAt: tsFor(t.missionDay) });
        }
      }
    }
    for (const part of chunk(reminders, 200)) db.insert(s.reminders).values(part).run();

    // Sharing: everything shared by default; Haddad keeps mood private.
    const prefs: (typeof s.sharingPrefs.$inferInsert)[] = [];
    for (const c of CREW) for (const cat of SHARING_CATEGORIES) prefs.push({ astronautId: c.id, category: cat.id, shared: !(c.id === 1 && cat.id === "mood") });
    db.insert(s.sharingPrefs).values(prefs).run();

    // Standing orders written in advance by the flight surgeon (demo advice).
    db.insert(s.standingOrders).values([
      { metric: "sleep_hours", operator: "<", value: 6, consecutiveDays: 2, surgeon: SURGEON, astronautId: null, createdAt: iso(40 * 86400e3), activeAt: iso(40 * 86400e3), enabled: true,
        advice: "Two short nights in a row. Protect tonight: no duty after 21:00, dim the lights one hour before bed, 7 hours in your bunk. If a third short night follows, tell the commander and message me." },
      { metric: "spo2", operator: "<", value: 94, consecutiveDays: 1, surgeon: SURGEON, astronautId: null, createdAt: iso(40 * 86400e3), activeAt: iso(40 * 86400e3), enabled: true,
        advice: "Re-measure on another finger after 5 minutes at rest. Check the cabin CO₂ and pressure panel. Send me the readings." },
      { metric: "temp", operator: ">=", value: 37.6, consecutiveDays: 2, surgeon: SURGEON, astronautId: null, createdAt: iso(40 * 86400e3), activeAt: iso(40 * 86400e3), enabled: true,
        advice: "Rest day. Extra fluids, separate meals from the crew, temperature every 6 hours. Send me a symptom list." },
    ]).run();

    // Private journal (never shared, never visible to Houston or the AI agent).
    db.insert(s.journalEntries).values([
      { astronautId: 1, missionDay: 141, ts: tsFor(141, 23), body: "Third night awake past 02:00 going over the antenna repair. Skipped dinner with the crew again." },
      { astronautId: 1, missionDay: 143, ts: tsFor(143, 7), body: "Tired. Short with Kenji this morning. Need to fix this before the spacewalk." },
    ]).run();

    // A little link history.
    const delay = profile.comms.demo_one_way_s * 1000;
    const msg = (direction: string, kind: string, subject: string, body: string, author: string, agoMs: number, missionDay: number) => ({
      direction, kind, subject, body, author, sentAt: iso(agoMs), deliverAt: iso(agoMs - delay), status: "delivered",
      payloadBytes: Buffer.byteLength(body, "utf8"), rawBytes: Buffer.byteLength(body, "utf8"), missionDay,
    });
    db.insert(s.messages).values([
      msg("to_ship", "note", "Standing orders uploaded", "Three standing orders are active on board: short sleep, low SpO₂, raised temperature. Hygieia applies them without waiting for me.", SURGEON, 40 * 86400e3, 103),
      msg("to_earth", "summary", "Crew health summary — Day 142", "Three crew green. Haddad amber: sleep 5.2 h, second short night. Standing order applied on board.", "Hygieia (onboard)", 26 * 3600e3, 142),
      msg("to_ship", "note", "Re: Day 142 summary", "Seen. Keep Haddad off solo critical tasks until sleep recovers. Review EVA crew for Day 145.", SURGEON, 20 * 3600e3, 142),
    ]).run();
  });
  run();

  rebuildAlerts(sqlite, db, 8, MAX_DAY);
  if (!opts.quiet) {
    const n = sqlite.prepare("SELECT COUNT(*) AS n FROM metric_samples").get() as { n: number };
    console.log(`[seed] Hygieia seeded: ${CREW.length} crew, ${MAX_DAY} days, ${n.n} metric samples, profile ${profile.id}, Day ${day}, seed ${seed}.`);
  }
}

export { METRIC_BY_ID };
