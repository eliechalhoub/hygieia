import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db/client";
import { METRICS, analyzeAstronaut, type MetricId, type SeriesMap, type Status } from "@/lib/engine";
import { engineConfigFor } from "@/lib/profiles";
import { SHARING_CATEGORIES } from "@/lib/sharing";
import { getAllSeries, getCrew, getMission, getSharingPrefs, type MissionState } from "./queries";

// Everything Houston can see goes through this file. Each query filters by the
// astronaut's sharing choices first, and nothing here touches private notes.

/** Keep only the metrics in categories the astronaut shares with Earth. */
export function sharedSeries(series: SeriesMap, prefs: Record<string, boolean>): { series: SeriesMap; hidden: string[] } {
  const out: SeriesMap = {};
  const hidden: string[] = [];
  for (const cat of SHARING_CATEGORIES) {
    if (prefs[cat.id] === false) {
      if (cat.metrics.length) hidden.push(cat.label);
      continue;
    }
    for (const m of cat.metrics) if (series[m]) out[m] = series[m];
  }
  return { series: out, hidden };
}

export interface HoustonCrewRow {
  id: number;
  name: string;
  role: string;
  /** Status computed from shared data only. */
  status: Status;
  score: number;
  hidden: string[];
  drifting: { metric: MetricId; label: string; value: number | null; unit: string; status: Status; reason: string }[];
  sharedCategories: string[];
}

export function getHoustonCrew(mission: MissionState = getMission()): HoustonCrewRow[] {
  const config = engineConfigFor(mission.profile);
  const all = getAllSeries(mission.currentDay);
  return getCrew().map((a) => {
    const prefs = getSharingPrefs(a.id);
    const { series, hidden } = sharedSeries(all.get(a.id) ?? {}, prefs);
    const analysis = analyzeAstronaut(a.id, series, mission.currentDay, config, { forecasts: false });
    const drifting = METRICS.filter((m) => series[m.id])
      .map((m) => ({ def: m, st: analysis.metrics[m.id] }))
      .filter((x) => x.st.status === "amber" || x.st.status === "red")
      .sort((x, y) => y.st.badness - x.st.badness)
      .map((x) => ({ metric: x.def.id, label: x.def.label, value: x.st.value, unit: x.def.unit, status: x.st.status, reason: x.st.reason }));
    return {
      id: a.id, name: a.name, role: a.role, status: analysis.status, score: analysis.score.score, hidden, drifting,
      sharedCategories: SHARING_CATEGORIES.filter((c) => prefs[c.id] !== false).map((c) => c.label),
    };
  });
}

/** Messages that have completed their trip to Earth. Incident reports respect the sharing choice. */
export function getHoustonInbox() {
  const db = getDb();
  const rows = db.select().from(s.messages).where(eq(s.messages.direction, "to_earth")).orderBy(desc(s.messages.sentAt)).all();
  const incidents = new Map(db.select().from(s.incidents).all().map((i) => [i.id, i]));
  const prefsCache = new Map<number, Record<string, boolean>>();
  const nowIso = new Date().toISOString();
  return rows
    .filter((m) => m.deliverAt <= nowIso)
    .filter((m) => {
      if (m.kind !== "incident" || m.incidentId === null) return true;
      const inc = incidents.get(m.incidentId);
      if (!inc || inc.astronautId === null) return true;
      if (!prefsCache.has(inc.astronautId)) prefsCache.set(inc.astronautId, getSharingPrefs(inc.astronautId));
      return prefsCache.get(inc.astronautId)!.incidents !== false;
    });
}

export function getOutboxToShip() {
  return getDb().select().from(s.messages).where(eq(s.messages.direction, "to_ship")).orderBy(desc(s.messages.sentAt)).all();
}
