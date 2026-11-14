import { mean } from "./baseline";
import { METRIC_BY_ID, formatValue } from "./metrics";
import { badnessOf, evaluateMetric } from "./status";
import type { Alert, EngineConfig, MetricId, MetricState, SeriesMap } from "./types";

// Early-warning rules. Each one returns a plain-language reason built from the
// numbers it used, so the crew can check the logic themselves.
// Rule thresholds are demo values unless a source id is attached.

export interface SpaceWeatherHit {
  kind: string;
  missionDay: number;
  sLevel: number | null;
  realTime: string;
  sourceUrl: string;
}

export interface CabinDay {
  day: number;
  co2_mmHg: number;
}

export interface RuleContext {
  astronautId: number;
  name: string;
  day: number;
  series: SeriesMap;
  metrics: Record<MetricId, MetricState>;
  config: EngineConfig;
  spaceWeather: SpaceWeatherHit[];
}

/** Badness of a metric on each of the last `n` days (missing days skipped). */
export function recentBadness(ctx: RuleContext, metric: MetricId, n: number): number[] {
  const def = METRIC_BY_ID[metric];
  const out: number[] = [];
  for (let d = ctx.day - n + 1; d <= ctx.day; d++) {
    const s = (ctx.series[metric] ?? []).find((x) => x.day === d);
    if (!s) continue;
    const st = evaluateMetric(def, ctx.series[metric], d, ctx.config.thresholds);
    if (st.z !== null) out.push(badnessOf(st.z, def.direction));
  }
  return out;
}

function countAtLeast(values: number[], t: number): number {
  return values.filter((v) => v >= t).length;
}

function delta(ctx: RuleContext, metric: MetricId): string {
  const s = ctx.metrics[metric];
  if (s.value === null || !s.baseline.sufficient) return "";
  const d = s.value - s.baseline.median;
  const def = METRIC_BY_ID[metric];
  const sign = d >= 0 ? "up" : "down";
  return `${def.plain} ${sign} ${formatValue(metric, Math.abs(d))} ${def.unit}`.trim();
}

export function runAstronautRules(ctx: RuleContext): Alert[] {
  const alerts: Alert[] = [];
  const t = ctx.config.thresholds;
  const base = { astronautId: ctx.astronautId, day: ctx.day };
  const sev = (b: number): "amber" | "red" => (b > t.zRed ? "red" : "amber");

  // 1. Infection onset: temperature and resting heart rate both rise, HRV dips.
  const temp = recentBadness(ctx, "temp", 3);
  const hr = recentBadness(ctx, "hr", 3);
  const hrv = recentBadness(ctx, "hrv", 3);
  if (countAtLeast(temp, t.zAmber) >= 2 && countAtLeast(hr, t.zAmber) >= 2 && countAtLeast(hrv, 1) >= 1) {
    alerts.push({
      ...base, rule: "infection_onset", severity: sev(Math.max(...temp)),
      title: "Possible infection starting",
      reason: `For at least 2 of the last 3 days: ${delta(ctx, "temp")}, ${delta(ctx, "hr")}, ${delta(ctx, "hrv")} against your own baseline. This pattern often comes before feeling ill.`,
      advice: "Rest, drink more, re-check temperature in 6 hours and keep distance at meals. This is an early warning, not a diagnosis.",
    });
  }

  // 2. Dehydration: fluids low for two days, heart rate creeping up.
  const hyd = recentBadness(ctx, "hydration", 3);
  if (countAtLeast(hyd, t.zAmber) >= 2) {
    const withHr = countAtLeast(hr, 1) >= 1;
    alerts.push({
      ...base, rule: "dehydration", severity: withHr && Math.max(...hyd) > t.zRed ? "red" : "amber",
      title: "Dehydration risk",
      reason: `${delta(ctx, "hydration")} for 2 or more of the last 3 days${withHr ? `, and ${delta(ctx, "hr")}` : ""}.`,
      advice: "Add 0.5 L of fluids today and log it. Check urine colour at the next opportunity.",
    });
  }

  // 3. Fatigue-error risk: short sleep plus slower reactions.
  const sleep = recentBadness(ctx, "sleep_hours", 3);
  const pvt = recentBadness(ctx, "pvt_rt", 3);
  const lapses = recentBadness(ctx, "pvt_lapses", 3);
  if (countAtLeast(sleep, t.zAmber) >= 2 && (countAtLeast(pvt, t.zAmber) >= 1 || countAtLeast(lapses, t.zAmber) >= 1)) {
    alerts.push({
      ...base, rule: "fatigue_error_risk", severity: sev(Math.max(...sleep, ...pvt)),
      title: "Fatigue-error risk",
      reason: `${delta(ctx, "sleep_hours")} on 2 or more of the last 3 nights, and ${delta(ctx, "pvt_rt")} on the reaction test.`,
      advice: "Avoid safety-critical tasks alone today. Use the path back to green and repeat the reaction test tomorrow.",
    });
  }

  // 4. Bone and muscle trajectory: exercise adherence as a proxy (not a measurement).
  const ex = (ctx.series.exercise_min ?? []).filter((s) => s.day <= ctx.day && s.day > ctx.day - 14);
  if (ex.length >= 10) {
    const avg = mean(ex.map((s) => s.value));
    const rx = ctx.config.exercisePrescriptionMin;
    const pct = Math.round((avg / rx) * 100);
    if (avg < 0.8 * rx) {
      alerts.push({
        ...base, rule: "bone_muscle_trajectory", severity: avg < 0.6 * rx ? "red" : "amber",
        title: "Bone and muscle protection is slipping",
        reason: `Exercise averaged ${Math.round(avg)} min/day over 14 days — ${pct}% of the ${rx} min/day prescription. Hygieia cannot measure bone; exercise adherence is a proxy.`,
        advice: "Re-plan exercise slots for the next 3 days with the crew schedule.",
        sourceIds: ["nasa-exercise-countermeasure"],
      });
    }
  }

  // 5. SANS progression: three falling vision self-checks.
  const vis = (ctx.series.vision_score ?? []).filter((s) => s.day <= ctx.day).sort((a, b) => a.day - b.day).slice(-3);
  const visState = ctx.metrics.vision_score;
  if (vis.length === 3 && vis[0].value > vis[1].value && vis[1].value > vis[2].value && visState.badness >= t.zAmber) {
    alerts.push({
      ...base, rule: "sans_progression", severity: sev(visState.badness),
      title: "Vision self-check is trending down",
      reason: `Last three vision self-checks: ${vis.map((v) => Math.round(v.value)).join(" → ")} /100, below your usual ${formatValue("vision_score", visState.baseline.median)}.`,
      advice: "Repeat the vision self-check today and share the result with the flight surgeon. This is a screening prompt, not a diagnosis.",
      sourceIds: ["nasa-hrp-risks"],
    });
  }

  // 6. Sleep-schedule drift.
  const reg = recentBadness(ctx, "sleep_regularity", 4);
  if (countAtLeast(reg, t.zAmber) >= 3) {
    alerts.push({
      ...base, rule: "sleep_schedule_drift", severity: sev(Math.max(...reg)),
      title: "Sleep schedule is drifting",
      reason: `${delta(ctx, "sleep_regularity")} on 3 or more of the last 4 days: bed and wake times are moving.`,
      advice: "Hold a fixed wake time for 3 days and get bright light in the first hour awake.",
    });
  }

  // 7. Radiation exposure, including replayed real solar particle events.
  const dose = ctx.metrics.dose_daily;
  const sep = ctx.spaceWeather.filter((e) => e.kind === "SEP" && e.missionDay <= ctx.day && e.missionDay >= ctx.day - 1);
  if (sep.length > 0 || (dose.status !== "unknown" && dose.badness > t.zRed)) {
    const ev = sep[0];
    const ratio = dose.value !== null && dose.baseline.sufficient ? dose.value / dose.baseline.median : null;
    const doseText = ratio !== null && dose.value !== null
      ? ` Dosimeter reads ${formatValue("dose_daily", dose.value)} mSv today — ${ratio.toFixed(1)}× your typical day.`
      : " Log your dosimeter reading.";
    alerts.push({
      ...base, rule: "radiation_exposure", severity: "red",
      title: ev ? "Solar particle event — go to storm shelter" : "Radiation dose well above your typical day",
      reason: ev
        ? `Solar energetic particle event on Day ${ev.missionDay} (replay of the real event of ${ev.realTime.slice(0, 10)} UTC${ev.sLevel ? `, NOAA S${ev.sLevel}` : ""}).${doseText}`
        : doseText.trim(),
      advice: "Follow the storm-shelter checklist, then log your dosimeter.",
      sourceIds: ["nasa-donki", "noaa-swpc-protons"],
    });
  }

  return alerts;
}

export interface CrewAirInput {
  day: number;
  cabin: CabinDay[];
  /** Per astronaut: reaction-time badness today and whether a headache was logged. */
  crew: { astronautId: number; name: string; pvtBadness: number; headache: boolean }[];
  co2AmberMmHg: number;
  co2RedMmHg: number;
  zAmber: number;
}

/** 8. Cabin air: high CO₂ together with headaches or slow reactions across the crew. */
export function runCabinAirRule(input: CrewAirInput): Alert[] {
  const today = input.cabin.filter((c) => c.day === input.day);
  if (today.length === 0) return [];
  const co2 = mean(today.map((c) => c.co2_mmHg));
  if (co2 < input.co2AmberMmHg) return [];
  const affected = input.crew.filter((c) => c.headache || c.pvtBadness >= input.zAmber);
  if (affected.length < 2 && co2 < input.co2RedMmHg) return [];
  const names = affected.map((c) => c.name).join(", ");
  return [{
    rule: "cabin_air", severity: co2 >= input.co2RedMmHg ? "red" : "amber", astronautId: null, day: input.day,
    title: "Cabin air: CO₂ is high",
    reason: `Cabin CO₂ averaged ${co2.toFixed(1)} mmHg today (alert line ${input.co2AmberMmHg} mmHg)${affected.length ? `, and ${affected.length} crew show headaches or slower reactions (${names})` : ""}.`,
    advice: "Check the CO₂ scrubber, increase airflow in sleeping quarters and repeat the reaction test in 4 hours.",
    sourceIds: ["demo-thresholds"],
  }];
}

// ---------------------------------------------------------------------------
// Standing orders: written by the flight surgeon in advance, evaluated onboard.
// ---------------------------------------------------------------------------

export type Operator = "<" | "<=" | ">" | ">=";

export interface StandingOrder {
  id: number;
  metric: MetricId;
  operator: Operator;
  value: number;
  consecutiveDays: number;
  advice: string;
  surgeon: string;
  /** null = applies to every crew member. */
  astronautId: number | null;
}

export function compare(a: number, op: Operator, b: number): boolean {
  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
  }
}

/** True when the last N consecutive daily readings (ending today) all match. */
export function standingOrderMatches(order: StandingOrder, series: SeriesMap, day: number): boolean {
  const samples = series[order.metric] ?? [];
  for (let d = day - order.consecutiveDays + 1; d <= day; d++) {
    const s = samples.find((x) => x.day === d);
    if (!s || !compare(s.value, order.operator, order.value)) return false;
  }
  return true;
}

export function runStandingOrders(orders: StandingOrder[], astronautId: number, series: SeriesMap, day: number): Alert[] {
  const out: Alert[] = [];
  for (const o of orders) {
    if (o.astronautId !== null && o.astronautId !== astronautId) continue;
    if (!standingOrderMatches(o, series, day)) continue;
    const def = METRIC_BY_ID[o.metric];
    out.push({
      rule: `standing_order_${o.id}`, severity: "amber", astronautId, day,
      title: `Standing order from ${o.surgeon}`,
      reason: `${def.label} ${o.operator} ${o.value} ${def.unit} for ${o.consecutiveDays} day${o.consecutiveDays === 1 ? "" : "s"} in a row.`,
      advice: o.advice,
      authorisedBy: o.surgeon,
    });
  }
  return out;
}
