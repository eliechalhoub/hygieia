import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, getSqlite, schema as s } from "@/lib/db/client";
import {
  analyzeAstronaut, assessTask, type Analysis, type CrewMember, type GoNoGo, type MetricId, type SeriesMap, type TaskEvent,
} from "@/lib/engine";
import { engineConfigFor, getProfile, type Profile } from "@/lib/profiles";
import { loadAllSeries } from "./alerts";

export interface MissionState {
  name: string;
  currentDay: number;
  maxDay: number;
  profile: Profile;
  commsDelaySeconds: number;
  seed: number;
}

export interface Astronaut {
  id: number;
  name: string;
  shortName: string;
  role: string;
  agency: string;
  age: number;
  trained: string[];
  bio: string;
}

export function getMission(): MissionState {
  const row = getDb().select().from(s.mission).where(eq(s.mission.id, 1)).get();
  if (!row) throw new Error("Mission not seeded. Run `npm run seed`.");
  return {
    name: row.name, currentDay: row.currentDay, maxDay: row.maxDay, profile: getProfile(row.environmentProfile),
    commsDelaySeconds: row.commsDelaySeconds, seed: row.seed,
  };
}

export function getCrew(): Astronaut[] {
  return getDb().select().from(s.astronauts).orderBy(asc(s.astronauts.id)).all()
    .map((a) => ({ ...a, trained: JSON.parse(a.trained) as string[] }));
}

export function getAstronaut(id: number): Astronaut | null {
  return getCrew().find((a) => a.id === id) ?? null;
}

/** Series for every astronaut, limited to data the crew could have by `day`. */
export function getAllSeries(day: number): Map<number, SeriesMap> {
  return loadAllSeries(getSqlite(), day);
}

export interface CrewAnalysis {
  astronaut: Astronaut;
  analysis: Analysis;
  series: SeriesMap;
}

export function getCrewAnalyses(mission: MissionState = getMission()): CrewAnalysis[] {
  const config = engineConfigFor(mission.profile);
  const all = getAllSeries(mission.currentDay);
  return getCrew().map((astronaut) => {
    const series = all.get(astronaut.id) ?? {};
    return { astronaut, series, analysis: analyzeAstronaut(astronaut.id, series, mission.currentDay, config) };
  });
}

export function getTimeline() {
  return getDb().select().from(s.timelineEvents).orderBy(asc(s.timelineEvents.missionDay)).all()
    .map((t) => ({ ...t, assigned: JSON.parse(t.assigned) as number[] }));
}

export type TimelineEvent = ReturnType<typeof getTimeline>[number];

/** Go/no-go for crewed tasks in the next `lookahead` days. */
export function getUpcomingTasks(mission: MissionState, crew: CrewAnalysis[], lookahead = 7): GoNoGo[] {
  const config = engineConfigFor(mission.profile);
  const members: CrewMember[] = crew.map((c) => ({ id: c.astronaut.id, name: c.astronaut.shortName, trained: c.astronaut.trained, analysis: c.analysis }));
  return getTimeline()
    .filter((t) => t.kind !== "solar_particle_event" && t.missionDay > mission.currentDay && t.missionDay <= mission.currentDay + lookahead)
    .map((t) => {
      const task: TaskEvent = { id: t.id, kind: t.kind, title: t.title, missionDay: t.missionDay, assigned: t.assigned, requires: t.requires };
      return assessTask(task, members, config, mission.profile.task_thresholds);
    });
}

export function getAlerts(day: number, astronautId?: number) {
  const rows = getDb().select().from(s.alerts).where(eq(s.alerts.missionDay, day)).orderBy(desc(s.alerts.severity)).all();
  return rows
    .filter((a) => astronautId === undefined || a.astronautId === astronautId || a.astronautId === null)
    .map((a) => ({ ...a, sourceIds: a.sourceIds ? (JSON.parse(a.sourceIds) as string[]) : [] }));
}

export type AlertRow = ReturnType<typeof getAlerts>[number];

export function getAlertHistory(fromDay: number, toDay: number, astronautId?: number) {
  const rows = getDb().select().from(s.alerts).where(and(gte(s.alerts.missionDay, fromDay), lte(s.alerts.missionDay, toDay))).orderBy(desc(s.alerts.missionDay)).all();
  return rows.filter((a) => astronautId === undefined || a.astronautId === astronautId || a.astronautId === null);
}

export function getDose(astronautId: number, day: number) {
  return getDb().select().from(s.doseSamples)
    .where(and(eq(s.doseSamples.astronautId, astronautId), lte(s.doseSamples.missionDay, day)))
    .orderBy(asc(s.doseSamples.missionDay)).all();
}

export function getSpaceWeatherEvents() {
  return getDb().select().from(s.spaceWeatherEvents).orderBy(desc(s.spaceWeatherEvents.realTime)).all();
}

export function getEnvironment(day: number, days = 3) {
  return getDb().select().from(s.environmentSamples)
    .where(and(gte(s.environmentSamples.missionDay, day - days + 1), lte(s.environmentSamples.missionDay, day)))
    .orderBy(asc(s.environmentSamples.missionDay), asc(s.environmentSamples.hour)).all();
}

export function getReminders(day: number, astronautId?: number) {
  const rows = getDb().select().from(s.reminders)
    .where(and(gte(s.reminders.missionDay, day - 1), lte(s.reminders.missionDay, day + 2)))
    .orderBy(asc(s.reminders.missionDay)).all();
  return rows.filter((r) => astronautId === undefined || r.astronautId === astronautId || r.astronautId === null);
}

export function getSharingPrefs(astronautId: number): Record<string, boolean> {
  const rows = getDb().select().from(s.sharingPrefs).where(eq(s.sharingPrefs.astronautId, astronautId)).all();
  return Object.fromEntries(rows.map((r) => [r.category, r.shared]));
}

export function getStandingOrders() {
  return getDb().select().from(s.standingOrders).orderBy(desc(s.standingOrders.id)).all();
}

export function getMessages() {
  return getDb().select().from(s.messages).orderBy(desc(s.messages.sentAt)).all();
}

export type MessageRow = ReturnType<typeof getMessages>[number];

export function getIncidents() {
  return getDb().select().from(s.incidents).orderBy(desc(s.incidents.id)).all();
}

export function getIncidentEvents(incidentId: number) {
  return getDb().select().from(s.incidentEvents).where(eq(s.incidentEvents.incidentId, incidentId)).orderBy(asc(s.incidentEvents.id)).all();
}

export function getSources() {
  return getDb().select().from(s.sources).all();
}

export function getCheckin(astronautId: number, day: number) {
  return getDb().select().from(s.checkins)
    .where(and(eq(s.checkins.astronautId, astronautId), eq(s.checkins.missionDay, day)))
    .orderBy(desc(s.checkins.id)).get() ?? null;
}

export function getJournal(astronautId: number) {
  return getDb().select().from(s.journalEntries).where(eq(s.journalEntries.astronautId, astronautId)).orderBy(desc(s.journalEntries.id)).all();
}

export function latestValue(series: SeriesMap, metric: MetricId, day: number): number | null {
  const list = series[metric] ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].day <= day) return list[i].value;
  return null;
}

export interface TeamGoal {
  id: string;
  title: string;
  /** Days in a row, ending today, on which the whole crew met the goal. */
  streak: number;
  metToday: boolean;
  note: string;
}

/** Cooperative crew goals: the whole crew succeeds together. No ranking of individuals. */
export function getTeamGoals(mission: MissionState, crew: CrewAnalysis[]): TeamGoal[] {
  const day = mission.currentDay;
  const rx = mission.profile.exercise.prescription_min;
  const checkins = getDb().select().from(s.checkins).where(and(gte(s.checkins.missionDay, day - 60), lte(s.checkins.missionDay, day))).all();
  const crewTime = new Map<string, number>();
  for (const c of checkins) crewTime.set(`${c.astronautId}:${c.missionDay}`, c.crewTimeHours ?? 0);
  const valueOn = (c: CrewAnalysis, metric: MetricId, d: number) => (c.series[metric] ?? []).find((x) => x.day === d)?.value;

  const streakOf = (met: (d: number) => boolean) => {
    let n = 0;
    for (let d = day; d > day - 60 && d >= 1; d--) { if (met(d)) n++; else break; }
    return n;
  };
  const lastBreak = (met: (d: number) => boolean) => {
    for (let d = day; d > day - 60 && d >= 1; d--) if (!met(d)) return d;
    return null;
  };

  const exercise = (d: number) => crew.every((c) => (valueOn(c, "exercise_min", d) ?? 0) >= 0.8 * rx);
  const together = (d: number) => crew.every((c) => (crewTime.get(`${c.astronaut.id}:${d}`) ?? 0) >= 0.5);
  const sleep = (d: number) => crew.every((c) => (valueOn(c, "sleep_hours", d) ?? 0) >= 6);

  const goal = (id: string, title: string, met: (d: number) => boolean, restart: string): TeamGoal => {
    const streak = streakOf(met);
    const broke = lastBreak(met);
    return {
      id, title, streak, metToday: met(day),
      note: streak > 0 ? `${streak} day${streak === 1 ? "" : "s"} in a row as a crew.` : `Paused${broke ? ` on Day ${broke}` : ""}. ${restart}`,
    };
  };
  return [
    goal("exercise", `Everyone reaches 80% of the ${rx} min exercise prescription`, exercise, "It restarts the day all four reach it."),
    goal("together", "Everyone joins at least 30 minutes of shared crew time", together, "One shared meal today restarts it."),
    goal("sleep", "Everyone sleeps at least 6 hours", sleep, "It restarts after one full night for all four."),
  ];
}
