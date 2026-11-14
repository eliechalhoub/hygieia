import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createReminder } from "@/lib/actions";
import { currentSLevel, loadDonki, loadGoesProtons } from "@/lib/data/spaceWeather";
import {
  METRICS, METRIC_BY_ID, REGION_LABEL, analyzeAstronaut, buildSimState, findPathToGreen, formatValue,
  type MetricId,
} from "@/lib/engine";
import { engineConfigFor } from "@/lib/profiles";
import { sharedSeries } from "./houston";
import { searchKb } from "./kb";
import {
  getAlertHistory, getAllSeries, getAstronaut, getIncidentEvents, getIncidents, getMission, getSharingPrefs, getTimeline,
} from "./queries";

// Tools the AI agent can call. The agent runs on a cloud API, so it is treated
// like Earth: every tool goes through the astronaut's sharing choices, and no
// tool here can reach private notes.

export const AGENT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_metrics",
    description: "Recent daily readings for the current astronaut (only categories they share). Use it to quote exact numbers. Returns values per mission day with units and the personal baseline.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        metrics: { type: "array", items: { type: "string", enum: METRICS.map((m) => m.id) }, description: "Metric ids. Omit for all shared metrics." },
        days: { type: "integer", minimum: 1, maximum: 30, description: "How many days back from today (default 7)." },
      },
    },
  },
  {
    name: "get_status_and_forecast",
    description: "Engine output for the current astronaut: status colour per body region, readiness score, drifting metrics with z-scores, 7-day forecasts (or why the engine abstained), whole-body anomaly, and the smallest path back to green.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_alerts",
    description: "Early-warning alerts and standing-order advice for the current astronaut and the cabin, with the plain-language reason for each.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { days_back: { type: "integer", minimum: 0, maximum: 30, description: "0 = today only (default 3)." } } },
  },
  {
    name: "get_incidents",
    description: "Emergency triage incidents logged on board: tree used, summary, timestamps and the step-by-step log.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 5 } } },
  },
  {
    name: "get_space_weather",
    description: "Space weather from the committed NASA DONKI and NOAA SWPC snapshots: current NOAA S-level, real solar particle events replayed on the mission clock, and source links.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_medical_kb",
    description: "Keyword search over Hygieia's knowledge base (one note per NASA HRP risk: what it is, what Hygieia can and cannot observe, sources). Use it before explaining any spaceflight health risk.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { query: { type: "string", description: "Keywords, e.g. 'SANS vision' or 'bone loss exercise'." } }, required: ["query"] },
  },
  {
    name: "draft_message_to_houston",
    description: "Draft a message to the flight surgeon. It is NOT sent: the astronaut sees the draft and must approve it before it enters the delayed link.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { subject: { type: "string" }, body: { type: "string", description: "Plain text. Include the numbers that matter." } },
      required: ["subject", "body"],
    },
  },
  {
    name: "create_reminder",
    description: "Create an onboard reminder for the current astronaut.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, detail: { type: "string" }, in_days: { type: "integer", minimum: 0, maximum: 14, description: "0 = today." } },
      required: ["title"],
    },
  },
];

const schemas = {
  get_metrics: z.object({ metrics: z.array(z.string()).optional(), days: z.number().int().min(1).max(30).optional() }),
  get_status_and_forecast: z.object({}),
  get_alerts: z.object({ days_back: z.number().int().min(0).max(30).optional() }),
  get_incidents: z.object({ limit: z.number().int().min(1).max(5).optional() }),
  get_space_weather: z.object({}),
  search_medical_kb: z.object({ query: z.string().min(2).max(200) }),
  draft_message_to_houston: z.object({ subject: z.string().min(1).max(160), body: z.string().min(1).max(4000) }),
  create_reminder: z.object({ title: z.string().min(2).max(160), detail: z.string().max(400).optional(), in_days: z.number().int().min(0).max(14).optional() }),
};

export type AgentToolName = keyof typeof schemas;

export interface ToolOutcome {
  ok: boolean;
  /** JSON string returned to the model. */
  content: string;
  /** Short label shown in the chat panel. */
  label: string;
  /** Draft message the astronaut must approve. */
  draft?: { subject: string; body: string };
}

function shared(astronautId: number) {
  const mission = getMission();
  const prefs = getSharingPrefs(astronautId);
  const all = getAllSeries(mission.currentDay).get(astronautId) ?? {};
  const { series, hidden } = sharedSeries(all, prefs);
  return { mission, series, hidden };
}

export async function runAgentTool(name: string, rawInput: unknown, astronautId: number): Promise<ToolOutcome> {
  if (!(name in schemas)) return { ok: false, content: JSON.stringify({ error: `Unknown tool ${name}` }), label: name };
  const parsed = schemas[name as AgentToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, content: JSON.stringify({ INVALID_JSON: JSON.stringify(rawInput) }), label: name };
  const astronaut = getAstronaut(astronautId);
  if (!astronaut) return { ok: false, content: JSON.stringify({ error: "Unknown astronaut" }), label: name };

  switch (name as AgentToolName) {
    case "get_metrics": {
      const input = parsed.data as z.infer<typeof schemas.get_metrics>;
      const { mission, series, hidden } = shared(astronautId);
      const days = input.days ?? 7;
      const config = engineConfigFor(mission.profile);
      const analysis = analyzeAstronaut(astronautId, series, mission.currentDay, config, { forecasts: false });
      const wanted = (input.metrics?.length ? input.metrics : Object.keys(series)) as MetricId[];
      const out = wanted.filter((m) => METRIC_BY_ID[m]).map((m) => {
        const def = METRIC_BY_ID[m];
        if (!series[m]) return { metric: m, label: def.label, not_available: "Not shared by the astronaut, or no data." };
        const st = analysis.metrics[m];
        return {
          metric: m, label: def.label, unit: def.unit,
          baseline_median: st.baseline.sufficient ? Number(formatValue(m, st.baseline.median)) : null,
          today: st.value, status: st.status, z_score: st.z === null ? null : Number(st.z.toFixed(2)),
          readings: (series[m] ?? []).filter((x) => x.day > mission.currentDay - days).map((x) => ({ day: x.day, value: x.value })),
        };
      });
      return { ok: true, label: `Read ${out.length} metrics (${days} d)`, content: JSON.stringify({ astronaut: astronaut.name, mission_day: mission.currentDay, not_shared_categories: hidden, metrics: out }) };
    }
    case "get_status_and_forecast": {
      const { mission, series, hidden } = shared(astronautId);
      const config = engineConfigFor(mission.profile);
      const a = analyzeAstronaut(astronautId, series, mission.currentDay, config);
      const path = findPathToGreen(buildSimState(a.metrics, series, mission.currentDay), mission.currentDay, config.thresholds, config.regionWeights);
      const drifting = METRICS.filter((m) => a.metrics[m.id].status === "amber" || a.metrics[m.id].status === "red").map((m) => {
        const st = a.metrics[m.id];
        const fc = a.forecasts[m.id];
        return {
          metric: m.id, label: m.label, unit: m.unit, value: st.value, status: st.status, z_score: Number((st.z ?? 0).toFixed(2)),
          baseline_median: Number(formatValue(m.id, st.baseline.median)), explanation: st.reason,
          forecast: !fc ? "none" : fc.abstained ? { abstained: true, reason: fc.reason } : { day_plus_3: Number(formatValue(m.id, fc.points[2].value)), day_plus_7: Number(formatValue(m.id, fc.points[6].value)), band_80pct_day_plus_7: [Number(formatValue(m.id, fc.points[6].lo)), Number(formatValue(m.id, fc.points[6].hi))] },
        };
      });
      return {
        ok: true, label: "Read status and forecast",
        content: JSON.stringify({
          astronaut: astronaut.name, mission_day: mission.currentDay, environment_profile: mission.profile.label,
          computed_from_shared_data_only: true, not_shared_categories: hidden,
          status: a.status, readiness_score: a.score.score,
          regions: Object.values(a.regions).map((r) => ({ region: REGION_LABEL[r.region], status: r.status })),
          drifting_metrics: drifting,
          whole_body_anomaly: { unusual: a.anomaly.isAnomaly, reason: a.anomaly.reason },
          path_back_to_green: { already_green: path.alreadyGreen, plan: path.summary, projected_green_day: path.result?.greenDay ?? null, note: "Response coefficients are demo values, not validated." },
          thresholds: { amber_z: config.thresholds.zAmber, red_z: config.thresholds.zRed, note: "Clinical thresholds are demo values." },
        }),
      };
    }
    case "get_alerts": {
      const input = parsed.data as z.infer<typeof schemas.get_alerts>;
      const mission = getMission();
      const back = input.days_back ?? 3;
      const rows = getAlertHistory(mission.currentDay - back, mission.currentDay, astronautId);
      const prefs = getSharingPrefs(astronautId);
      // Alerts built on a category the astronaut keeps private stay on board.
      const visible = rows.filter((r) => !(prefs.mood === false && /mood/i.test(r.reason)));
      return {
        ok: true, label: `Read ${visible.length} alerts`,
        content: JSON.stringify({ mission_day: mission.currentDay, alerts: visible.map((r) => ({ day: r.missionDay, severity: r.severity, title: r.title, reason: r.reason, advice: r.advice, pre_authorised_by: r.authorisedBy })) }),
      };
    }
    case "get_incidents": {
      const input = parsed.data as z.infer<typeof schemas.get_incidents>;
      const prefs = getSharingPrefs(astronautId);
      if (prefs.incidents === false) return { ok: true, label: "Incidents not shared", content: JSON.stringify({ not_shared: "The astronaut does not share incident reports." }) };
      const rows = getIncidents().slice(0, input.limit ?? 3);
      return {
        ok: true, label: `Read ${rows.length} incidents`,
        content: JSON.stringify({ incidents: rows.map((i) => ({ id: i.id, day: i.missionDay, tree: i.tree, summary: i.summary, started: i.startedAt, ended: i.endedAt, report_bytes: { raw: i.rawBytes, gzip: i.gzipBytes }, log: getIncidentEvents(i.id).map((ev) => ({ ts: ev.ts, step: ev.prompt, answer: ev.answer, detail: ev.detail })) })) }),
      };
    }
    case "get_space_weather": {
      const mission = getMission();
      const goes = loadGoesProtons();
      const donki = loadDonki();
      const s = currentSLevel(goes);
      const storms = getTimeline().filter((t) => t.kind === "solar_particle_event" && t.missionDay <= mission.currentDay);
      return {
        ok: true, label: "Read space weather",
        content: JSON.stringify({
          mission_day: mission.currentDay,
          noaa_s_level_now: s.level, latest_ge10MeV_flux_pfu: s.latest?.flux ?? null, snapshot_fetched_at: goes?.fetched_at ?? null,
          s_scale: "S1 starts at 10 pfu of >=10 MeV protons; S2 100; S3 1000; S4 10^4; S5 10^5",
          replayed_solar_particle_events: storms.map((t) => ({ mission_day: t.missionDay, detail: t.detail, source: t.sourceUrl })),
          note: "Event timing is real (NASA/CCMC DONKI). The size of the onboard dose spike is a demo value.",
          sources: { donki: donki?.source_url, donki_fetched_at: donki?.fetched_at, goes: goes?.source_url },
          daily_dose_rate_mSv: mission.profile.dose.mSv_per_day, dose_rate_source: mission.profile.dose.source_id,
        }),
      };
    }
    case "search_medical_kb": {
      const input = parsed.data as z.infer<typeof schemas.search_medical_kb>;
      const hits = searchKb(input.query);
      return {
        ok: true, label: `Searched knowledge base: “${input.query}”`,
        content: JSON.stringify({ query: input.query, results: hits.map((h) => ({ title: h.note.title, coverage: h.note.coverage, source: h.note.source, excerpt: h.excerpt })), note: hits.length ? undefined : "No note matched. Say so rather than answering from memory." }),
      };
    }
    case "draft_message_to_houston": {
      const input = parsed.data as z.infer<typeof schemas.draft_message_to_houston>;
      return {
        ok: true, label: "Drafted a message to Houston (needs approval)", draft: input,
        content: JSON.stringify({ status: "draft_shown_to_astronaut", sent: false, note: "The astronaut must press Approve before this is sent on the delayed link." }),
      };
    }
    case "create_reminder": {
      const input = parsed.data as z.infer<typeof schemas.create_reminder>;
      const res = await createReminder({ astronautId, title: input.title, detail: input.detail, dayOffset: input.in_days ?? 0, origin: "agent" });
      return { ok: true, label: `Created reminder for Day ${res.day}`, content: JSON.stringify({ created: true, mission_day: res.day, title: input.title }) };
    }
  }
}
