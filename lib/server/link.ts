import { and, eq, lte } from "drizzle-orm";
import { getDb, getSqlite, schema as s } from "@/lib/db/client";
import { rebuildAlerts } from "./alerts";

// The delayed link. Every message between ship and Earth is stored with
// deliver_at = sent_at + one-way delay, and only becomes visible to the other
// side once that wall-clock time has passed.

export type Direction = "to_earth" | "to_ship";

export interface OutgoingMessage {
  direction: Direction;
  kind: "note" | "summary" | "incident" | "standing_order" | "draft";
  subject: string;
  body: string;
  author: string;
  payloadB64?: string | null;
  payloadBytes?: number;
  rawBytes?: number | null;
  incidentId?: number | null;
}

export function currentDelayMs(): number {
  const m = getDb().select({ d: s.mission.commsDelaySeconds }).from(s.mission).where(eq(s.mission.id, 1)).get();
  return Math.round((m?.d ?? 0) * 1000);
}

export function queueMessage(msg: OutgoingMessage): { id: number; deliverAt: string } {
  const db = getDb();
  const mission = db.select().from(s.mission).where(eq(s.mission.id, 1)).get()!;
  const now = Date.now();
  const deliverAt = new Date(now + mission.commsDelaySeconds * 1000).toISOString();
  const bytes = msg.payloadBytes ?? Buffer.byteLength(msg.body, "utf8");
  const res = db.insert(s.messages).values({
    direction: msg.direction, kind: msg.kind, subject: msg.subject, body: msg.body, author: msg.author,
    sentAt: new Date(now).toISOString(), deliverAt, status: "in_transit", payloadBytes: bytes,
    rawBytes: msg.rawBytes ?? Buffer.byteLength(msg.body, "utf8"), payloadB64: msg.payloadB64 ?? null,
    incidentId: msg.incidentId ?? null, missionDay: mission.currentDay,
  }).run();
  return { id: Number(res.lastInsertRowid), deliverAt };
}

/**
 * Advance the link: mark messages whose travel time has passed as delivered.
 * When a standing order arrives on board, alerts are re-evaluated at once.
 */
export function tickLink(): { delivered: number; ordersArrived: boolean } {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const due = db.select().from(s.messages).where(and(eq(s.messages.status, "in_transit"), lte(s.messages.deliverAt, nowIso))).all();
  if (due.length === 0) return { delivered: 0, ordersArrived: false };
  db.update(s.messages).set({ status: "delivered" }).where(and(eq(s.messages.status, "in_transit"), lte(s.messages.deliverAt, nowIso))).run();
  const ordersArrived = due.some((m) => m.kind === "standing_order");
  if (ordersArrived) {
    const day = db.select({ d: s.mission.currentDay }).from(s.mission).where(eq(s.mission.id, 1)).get()!.d;
    rebuildAlerts(getSqlite(), db, day, day);
  }
  return { delivered: due.length, ordersArrived };
}

export interface LinkSnapshot {
  now: string;
  delaySeconds: number;
  inTransit: { id: number; direction: string; kind: string; subject: string; sentAt: string; deliverAt: string; payloadBytes: number; rawBytes: number | null }[];
  deliveredJustNow: number;
  ordersArrived: boolean;
}

export function linkSnapshot(): LinkSnapshot {
  const tick = tickLink();
  const db = getDb();
  const mission = db.select().from(s.mission).where(eq(s.mission.id, 1)).get()!;
  const inTransit = db.select().from(s.messages).where(eq(s.messages.status, "in_transit")).all();
  return {
    now: new Date().toISOString(),
    delaySeconds: mission.commsDelaySeconds,
    inTransit: inTransit.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, subject: m.subject, sentAt: m.sentAt, deliverAt: m.deliverAt, payloadBytes: m.payloadBytes, rawBytes: m.rawBytes })),
    deliveredJustNow: tick.delivered,
    ordersArrived: tick.ordersArrived,
  };
}
