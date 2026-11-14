import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, gte, lte } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import {
  analyzeAstronaut, runAstronautRules, runCabinAirRule, runStandingOrders,
  type Alert, type CabinDay, type MetricId, type Operator, type SeriesMap, type SpaceWeatherHit, type StandingOrder,
} from "@/lib/engine";
import { engineConfigFor, getProfile } from "@/lib/profiles";

type Db = BetterSQLite3Database<typeof s>;

/** Every sample for every astronaut, grouped for the engine. */
export function loadAllSeries(sqlite: Database.Database, maxDay?: number): Map<number, SeriesMap> {
  const rows = sqlite
    .prepare(`SELECT astronaut_id AS a, metric AS m, mission_day AS d, value AS v FROM metric_samples ${maxDay ? "WHERE mission_day <= ?" : ""} ORDER BY mission_day, id`)
    .all(...(maxDay ? [maxDay] : [])) as { a: number; m: MetricId; d: number; v: number }[];
  const out = new Map<number, SeriesMap>();
  for (const r of rows) {
    if (!out.has(r.a)) out.set(r.a, {});
    const map = out.get(r.a)!;
    const list = (map[r.m] ??= []);
    // A later entry for the same day (manual re-log) replaces the earlier one.
    if (list.length && list[list.length - 1].day === r.d) list[list.length - 1].value = r.v;
    else list.push({ day: r.d, value: r.v });
  }
  return out;
}

export function loadStormHits(sqlite: Database.Database): SpaceWeatherHit[] {
  const rows = sqlite
    .prepare(
      `SELECT t.mission_day AS missionDay, t.source_url AS sourceUrl, e.real_time AS realTime, e.s_level AS sLevel
       FROM timeline_events t LEFT JOIN space_weather_events e ON e.source_url = t.source_url
       WHERE t.kind = 'solar_particle_event'`,
    )
    .all() as { missionDay: number; sourceUrl: string | null; realTime: string | null; sLevel: number | null }[];
  return rows.map((r) => ({ kind: "SEP", missionDay: r.missionDay, sLevel: r.sLevel, realTime: r.realTime ?? "", sourceUrl: r.sourceUrl ?? "" }));
}

export function loadActiveOrders(sqlite: Database.Database, nowIso = new Date().toISOString()): StandingOrder[] {
  const rows = sqlite
    .prepare(`SELECT id, metric, operator, value, consecutive_days AS consecutiveDays, advice, surgeon, astronaut_id AS astronautId FROM standing_orders WHERE enabled = 1 AND active_at <= ?`)
    .all(nowIso) as { id: number; metric: MetricId; operator: Operator; value: number; consecutiveDays: number; advice: string; surgeon: string; astronautId: number | null }[];
  return rows;
}

export interface AlertContext {
  series: Map<number, SeriesMap>;
  crew: { id: number; shortName: string }[];
  storms: SpaceWeatherHit[];
  orders: StandingOrder[];
  cabin: CabinDay[];
  headaches: Set<string>;
  profileId: string;
}

export function loadAlertContext(sqlite: Database.Database): AlertContext {
  const mission = sqlite.prepare("SELECT environment_profile AS p FROM mission WHERE id = 1").get() as { p: string };
  const crew = sqlite.prepare("SELECT id, short_name AS shortName FROM astronauts ORDER BY id").all() as { id: number; shortName: string }[];
  const cabin = sqlite.prepare("SELECT mission_day AS day, AVG(co2_mmhg) AS co2_mmHg FROM environment_samples GROUP BY mission_day").all() as CabinDay[];
  const heads = sqlite.prepare("SELECT astronaut_id AS a, mission_day AS d FROM checkins WHERE headache = 1").all() as { a: number; d: number }[];
  return {
    series: loadAllSeries(sqlite),
    crew,
    // Solar particle events do not reach a clinic on the ground.
    storms: getProfile(mission.p).earth ? [] : loadStormHits(sqlite),
    orders: loadActiveOrders(sqlite),
    cabin,
    headaches: new Set(heads.map((h) => `${h.a}:${h.d}`)),
    profileId: mission.p,
  };
}

/** All alerts the onboard engine raises for one mission day. */
export function computeAlertsForDay(ctx: AlertContext, day: number): Alert[] {
  const profile = getProfile(ctx.profileId);
  const config = engineConfigFor(profile);
  const alerts: Alert[] = [];
  const air: { astronautId: number; name: string; pvtBadness: number; headache: boolean }[] = [];
  for (const c of ctx.crew) {
    const series = ctx.series.get(c.id) ?? {};
    const analysis = analyzeAstronaut(c.id, series, day, config, { forecasts: false });
    alerts.push(
      ...runAstronautRules({ astronautId: c.id, name: c.shortName, day, series, metrics: analysis.metrics, config, spaceWeather: ctx.storms }),
      ...runStandingOrders(ctx.orders, c.id, series, day),
    );
    air.push({ astronautId: c.id, name: c.shortName, pvtBadness: analysis.metrics.pvt_rt.badness, headache: ctx.headaches.has(`${c.id}:${day}`) });
  }
  const co2 = profile.thresholds.cabin.co2_mmHg;
  alerts.push(...runCabinAirRule({ day, cabin: ctx.cabin, crew: air, co2AmberMmHg: co2.amber, co2RedMmHg: co2.red, zAmber: config.thresholds.zAmber }));
  return alerts;
}

/** Recompute and store alerts for a range of mission days. */
export function rebuildAlerts(sqlite: Database.Database, db: Db, fromDay: number, toDay: number): number {
  const ctx = loadAlertContext(sqlite);
  const createdAt = new Date().toISOString();
  const rows: (typeof s.alerts.$inferInsert)[] = [];
  for (let day = fromDay; day <= toDay; day++) {
    for (const a of computeAlertsForDay(ctx, day)) {
      rows.push({
        astronautId: a.astronautId, missionDay: a.day, rule: a.rule, severity: a.severity, title: a.title, reason: a.reason,
        advice: a.advice, authorisedBy: a.authorisedBy ?? null, sourceIds: a.sourceIds ? JSON.stringify(a.sourceIds) : null, createdAt,
      });
    }
  }
  const tx = sqlite.transaction(() => {
    db.delete(s.alerts).where(and(gte(s.alerts.missionDay, fromDay), lte(s.alerts.missionDay, toDay))).run();
    for (let i = 0; i < rows.length; i += 200) db.insert(s.alerts).values(rows.slice(i, i + 200)).run();
  });
  tx();
  return rows.length;
}

export function alertsForDay(db: Db, day: number) {
  return db.select().from(s.alerts).where(eq(s.alerts.missionDay, day)).all();
}
