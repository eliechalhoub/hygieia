import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/lib/db/client";
import { queueMessage } from "@/lib/server/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  tree: z.string().min(1).max(40),
  title: z.string().max(120),
  astronautId: z.number().int().nullable(),
  patient: z.string().max(80),
  profile: z.string().max(20),
  startedAt: z.string(),
  endedAt: z.string(),
  summary: z.string().max(600),
  rawBytes: z.number().int().min(1),
  gzipBytes: z.number().int().min(1),
  /** Base64 of the gzip-compressed report, produced in the browser. */
  payloadB64: z.string().max(400_000),
  log: z.array(z.object({ ts: z.string(), node: z.string().max(60), prompt: z.string().max(300), answer: z.string().max(120), detail: z.string().max(400).optional() })).max(400),
});

/** Triage finished: store the incident and queue its compressed report for Houston. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad incident report" }, { status: 400 });
  const v = parsed.data;
  const db = getDb();
  const mission = db.select().from(s.mission).where(eq(s.mission.id, 1)).get()!;
  const res = db.insert(s.incidents).values({
    astronautId: v.astronautId, missionDay: mission.currentDay, tree: v.tree, startedAt: v.startedAt, endedAt: v.endedAt,
    summary: v.summary, profile: v.profile, rawBytes: v.rawBytes, gzipBytes: v.gzipBytes,
  }).run();
  const incidentId = Number(res.lastInsertRowid);
  if (v.log.length) {
    db.insert(s.incidentEvents).values(v.log.map((e) => ({ incidentId, ts: e.ts, node: e.node, prompt: e.prompt, answer: e.answer, detail: e.detail ?? null }))).run();
  }
  const sent = queueMessage({
    direction: "to_earth", kind: "incident", author: "Hygieia triage (onboard)",
    subject: `Incident report: ${v.title} — ${v.patient}, Day ${mission.currentDay}`,
    body: v.summary, payloadB64: v.payloadB64, payloadBytes: v.gzipBytes, rawBytes: v.rawBytes, incidentId,
  });
  return Response.json({ incidentId, messageId: sent.id, deliverAt: sent.deliverAt, delaySeconds: mission.commsDelaySeconds });
}
