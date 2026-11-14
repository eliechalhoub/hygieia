"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, getSqlite, schema as s } from "@/lib/db/client";
import { loadReplay, tsFor, writeDose } from "@/lib/db/seed";
import { METRIC_IDS } from "@/lib/engine/metrics";
import type { MetricId } from "@/lib/engine/types";
import { PROFILES, getProfile, type ProfileId } from "@/lib/profiles";
import { rebuildAlerts } from "@/lib/server/alerts";
import { queueMessage } from "@/lib/server/link";

function mission() {
  return getDb().select().from(s.mission).where(eq(s.mission.id, 1)).get()!;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function setMissionDay(day: number) {
  const m = mission();
  const wanted = Number.isFinite(day) ? Math.round(day) : m.currentDay;
  const d = Math.max(1, Math.min(m.maxDay, wanted));
  getDb().update(s.mission).set({ currentDay: d }).where(eq(s.mission.id, 1)).run();
  refresh();
  return { day: d };
}

/** Switch environment profile: thresholds, kit, comms delay and dose rate all change. */
export async function setProfile(profileId: string) {
  const id = z.enum(["transit", "station", "lunar", "mars", "clinic"]).parse(profileId) as ProfileId;
  const db = getDb();
  const m = mission();
  const before = getProfile(m.environmentProfile);
  const after = PROFILES[id];
  db.update(s.mission).set({ environmentProfile: id, commsDelaySeconds: after.comms.demo_one_way_s }).where(eq(s.mission.id, 1)).run();
  // Dose samples follow the profile's sourced dose rate.
  writeDose(db, id, m.seed, loadReplay(m.maxDay), m.maxDay);
  // Cabin pressure follows the profile's nominal pressure (demo values).
  const shift = after.thresholds.cabin.pressure_kPa.nominal - before.thresholds.cabin.pressure_kPa.nominal;
  if (shift !== 0) getSqlite().prepare("UPDATE environment_samples SET pressure_kpa = ROUND(pressure_kpa + ?, 2)").run(shift);
  rebuildAlerts(getSqlite(), db, 8, m.maxDay);
  refresh();
}

const logSchema = z.record(z.string(), z.number().finite());

/** Manual log or sensor override for today. Standing orders and rules re-run at once. */
export async function logMetrics(astronautId: number, values: Record<string, number>) {
  const parsed = logSchema.parse(values);
  const db = getDb();
  const m = mission();
  const now = new Date().toISOString();
  for (const [metric, value] of Object.entries(parsed)) {
    if (!METRIC_IDS.includes(metric as MetricId)) continue;
    db.delete(s.metricSamples).where(and(eq(s.metricSamples.astronautId, astronautId), eq(s.metricSamples.metric, metric), eq(s.metricSamples.missionDay, m.currentDay))).run();
    db.insert(s.metricSamples).values({ astronautId, metric, missionDay: m.currentDay, ts: now, value, source: "manual" }).run();
  }
  rebuildAlerts(getSqlite(), db, m.currentDay, m.currentDay);
  refresh();
}

export async function saveCheckin(astronautId: number, input: { mood: number; headache: boolean; crewTimeHours: number; note?: string }) {
  const v = z.object({ mood: z.number().min(1).max(10), headache: z.boolean(), crewTimeHours: z.number().min(0).max(12), note: z.string().max(500).optional() }).parse(input);
  const db = getDb();
  const m = mission();
  db.insert(s.checkins).values({ astronautId, missionDay: m.currentDay, ts: new Date().toISOString(), mood: v.mood, headache: v.headache, crewTimeHours: v.crewTimeHours, note: v.note ?? null }).run();
  await logMetrics(astronautId, { mood: v.mood });
}

export async function savePvt(astronautId: number, input: { meanRtMs: number; lapses: number; trials: number }) {
  const v = z.object({ meanRtMs: z.number().min(100).max(5000), lapses: z.number().int().min(0), trials: z.number().int().min(1) }).parse(input);
  const m = mission();
  getDb().insert(s.pvtResults).values({ astronautId, missionDay: m.currentDay, ts: new Date().toISOString(), ...v }).run();
  await logMetrics(astronautId, { pvt_rt: Math.round(v.meanRtMs), pvt_lapses: v.lapses });
}

export async function saveVision(astronautId: number, input: { acuityScore: number; gridDistortion: boolean; blurNear: boolean; headache: boolean }) {
  const v = z.object({ acuityScore: z.number().min(0).max(100), gridDistortion: z.boolean(), blurNear: z.boolean(), headache: z.boolean() }).parse(input);
  // Screening score (demo weighting): acuity, minus points for each reported symptom.
  const score = Math.max(0, Math.round(v.acuityScore - (v.gridDistortion ? 15 : 0) - (v.blurNear ? 8 : 0) - (v.headache ? 4 : 0)));
  const m = mission();
  getDb().insert(s.visionChecks).values({ astronautId, missionDay: m.currentDay, ts: new Date().toISOString(), ...v, score }).run();
  await logMetrics(astronautId, { vision_score: score });
  return { score };
}

/** Private journal. Stored on board only; no query used by Houston or the AI agent reads it. */
export async function addJournal(astronautId: number, body: string) {
  const text = z.string().min(1).max(4000).parse(body.trim());
  const m = mission();
  getDb().insert(s.journalEntries).values({ astronautId, missionDay: m.currentDay, ts: new Date().toISOString(), body: text }).run();
  refresh();
}

export async function setSharing(astronautId: number, category: string, shared: boolean) {
  const db = getDb();
  const row = db.select().from(s.sharingPrefs).where(and(eq(s.sharingPrefs.astronautId, astronautId), eq(s.sharingPrefs.category, category))).get();
  if (row) db.update(s.sharingPrefs).set({ shared }).where(eq(s.sharingPrefs.id, row.id)).run();
  else db.insert(s.sharingPrefs).values({ astronautId, category, shared }).run();
  refresh();
}

const orderSchema = z.object({
  metric: z.string().refine((m) => METRIC_IDS.includes(m as MetricId)),
  operator: z.enum(["<", "<=", ">", ">="]),
  value: z.number().finite(),
  consecutiveDays: z.number().int().min(1).max(14),
  advice: z.string().min(3).max(600),
  surgeon: z.string().min(2).max(80),
  astronautId: z.number().int().nullable(),
});

/** Houston writes a standing order. It travels up the delayed link before it is active on board. */
export async function createStandingOrder(input: z.infer<typeof orderSchema>) {
  const v = orderSchema.parse(input);
  const db = getDb();
  const sent = queueMessage({
    direction: "to_ship", kind: "standing_order", author: v.surgeon,
    subject: `Standing order: ${v.metric} ${v.operator} ${v.value} for ${v.consecutiveDays} day(s)`,
    body: v.advice,
  });
  db.insert(s.standingOrders).values({ ...v, createdAt: new Date().toISOString(), activeAt: sent.deliverAt, enabled: true }).run();
  refresh();
}

export async function setStandingOrderEnabled(id: number, enabled: boolean) {
  const db = getDb();
  db.update(s.standingOrders).set({ enabled }).where(eq(s.standingOrders.id, id)).run();
  const m = mission();
  rebuildAlerts(getSqlite(), db, m.currentDay, m.currentDay);
  refresh();
}

export async function sendMessage(input: { direction: "to_earth" | "to_ship"; subject: string; body: string; author: string; kind?: "note" | "summary" | "draft" }) {
  const v = z.object({
    direction: z.enum(["to_earth", "to_ship"]), subject: z.string().min(1).max(160), body: z.string().min(1).max(4000),
    author: z.string().min(1).max(80), kind: z.enum(["note", "summary", "draft"]).optional(),
  }).parse(input);
  const res = queueMessage({ ...v, kind: v.kind ?? "note" });
  refresh();
  return res;
}

export async function setReminderDone(id: number, done: boolean) {
  getDb().update(s.reminders).set({ done }).where(eq(s.reminders.id, id)).run();
  refresh();
}

export async function createReminder(input: { astronautId: number | null; title: string; detail?: string; dayOffset?: number; origin?: string }) {
  const v = z.object({ astronautId: z.number().int().nullable(), title: z.string().min(2).max(160), detail: z.string().max(400).optional(), dayOffset: z.number().int().min(0).max(30).optional(), origin: z.string().optional() }).parse(input);
  const m = mission();
  const day = Math.min(m.maxDay, m.currentDay + (v.dayOffset ?? 0));
  getDb().insert(s.reminders).values({ astronautId: v.astronautId, missionDay: day, title: v.title, detail: v.detail ?? null, origin: v.origin ?? "manual", done: false, createdAt: tsFor(m.currentDay) }).run();
  refresh();
  return { day };
}
