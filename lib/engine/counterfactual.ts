import { mean } from "./baseline";
import { METRICS, METRIC_BY_ID } from "./metrics";
import { scoreFromBadness } from "./score";
import { badnessOf } from "./status";
import type { MetricId, MetricState, RegionWeights, Sample, SeriesMap, Thresholds } from "./types";

// ---------------------------------------------------------------------------
// Path back to green.
//
// A deliberately simple, transparent response model. For every drifting metric
// we track its "badness" (baseline widths away from normal, in the unhealthy
// direction) and let four everyday levers pull it back day by day.
//
// EVERY COEFFICIENT BELOW IS A DEMO VALUE. They are not fitted to flight or
// clinical data; a real system would learn them per astronaut.
// ---------------------------------------------------------------------------

export type LeverId = "sleep" | "crewTime" | "exercise" | "hydration";

export const LEVERS: Record<LeverId, { label: string; unit: string; step: number }> = {
  sleep: { label: "Sleep", unit: "h per night", step: 0.5 },
  crewTime: { label: "Shared crew time", unit: "h per day", step: 0.5 },
  exercise: { label: "Extra exercise", unit: "min per day", step: 15 },
  hydration: { label: "Extra fluids", unit: "L per day", step: 0.5 },
};

export const RESPONSE = {
  demoValue: true,
  /** A night counts as "short" below (usual sleep − this many hours). */
  shortNightMarginH: 1.25,
  /** Badness removed per day, per unit of each lever. */
  perUnit: {
    /** per hour slept above the short-night line */
    sleep: { mood: 0.5, hrv: 0.45, hr: 0.3, pvt_rt: 0.6, pvt_lapses: 0.6, sleep_regularity: 0.7, bp_sys: 0.15, bp_dia: 0.15 },
    /** per hour of shared crew time */
    crewTime: { mood: 0.45, hrv: 0.1, hr: 0.05 },
    /** per extra 30 min of exercise */
    exercise: { mood: 0.1, hrv: 0.15, sleep_regularity: 0.1, glucose: 0.2, activity: 1.0 },
    /** per extra 0.5 L of fluids */
    hydration: { hr: 0.2, bp_sys: 0.15, bp_dia: 0.1 },
  } as Record<LeverId, Partial<Record<MetricId, number>>>,
  /** Badness added per day, per hour short of the short-night line. */
  shortSleepHarm: { mood: 0.3, hrv: 0.3, hr: 0.15, pvt_rt: 0.35, pvt_lapses: 0.3 } as Partial<Record<MetricId, number>>,
  /** Slow natural recovery per day when nights are not short. */
  naturalRecovery: 0.08,
  /** Recovery saturates: no metric improves by more than this per day. */
  maxRecoveryPerDay: 1.0,
  /** Effort cost of each lever unit, used to pick the smallest plan. */
  effort: { sleepPerHourNight: 1.0, crewTimePerHourDay: 0.8, exercisePer15MinDay: 0.5, hydrationPerHalfLitreDay: 0.2 },
  /** Cost of each extra day spent out of green. */
  dayPenalty: 1.0,
  horizonDays: 7,
};

/** Metrics a lever sets directly rather than through a coefficient. */
const DIRECT: Partial<Record<MetricId, LeverId>> = {
  sleep_hours: "sleep",
  exercise_min: "exercise",
  hydration: "hydration",
};

export interface Plan {
  /** Target sleep per night, hours. */
  sleepHours: number;
  /** Nights (and days) the plan is held. Afterwards the usual routine resumes. */
  nights: number;
  crewTimeHours: number;
  extraExerciseMin: number;
  extraHydrationL: number;
}

export interface SimState {
  /** Current badness per metric (only metrics with a usable baseline). */
  badness: Partial<Record<MetricId, number>>;
  /** Usual (baseline) sleep, hours. */
  usualSleep: number;
  sleepScale: number;
  /** Recent habit: mean of the last three nights. */
  habitSleep: number;
  usualExercise: number;
  exerciseScale: number;
  habitExercise: number;
  usualHydration: number;
  hydrationScale: number;
  habitHydration: number;
}

export interface SimDay {
  day: number;
  badness: Partial<Record<MetricId, number>>;
  score: number;
  green: boolean;
  /** Metrics still amber or red on this day. */
  offenders: MetricId[];
}

export interface SimResult {
  days: SimDay[];
  /** First mission day on which every metric is green, or null. */
  greenDay: number | null;
  /** Drifting metrics that none of the levers can move. */
  unaddressable: MetricId[];
}

function recentMean(samples: Sample[] | undefined, day: number, n: number, fallback: number): number {
  const vals = (samples ?? []).filter((s) => s.day <= day && s.day > day - n).map((s) => s.value);
  return vals.length ? mean(vals) : fallback;
}

export function buildSimState(
  metrics: Record<MetricId, MetricState>,
  series: SeriesMap,
  day: number,
): SimState {
  const badness: Partial<Record<MetricId, number>> = {};
  for (const def of METRICS) {
    const s = metrics[def.id];
    if (s.status !== "unknown") badness[def.id] = s.badness;
  }
  const sl = metrics.sleep_hours.baseline;
  const ex = metrics.exercise_min.baseline;
  const hy = metrics.hydration.baseline;
  return {
    badness,
    usualSleep: sl.median, sleepScale: sl.scale,
    habitSleep: recentMean(series.sleep_hours, day, 3, sl.median),
    usualExercise: ex.median, exerciseScale: ex.scale,
    habitExercise: recentMean(series.exercise_min, day, 3, ex.median),
    usualHydration: hy.median, hydrationScale: hy.scale,
    habitHydration: recentMean(series.hydration, day, 3, hy.median),
  };
}

const HAS_LEVER = new Set<MetricId>([
  ...(Object.keys(DIRECT) as MetricId[]),
  ...Object.values(RESPONSE.perUnit).flatMap((m) => Object.keys(m) as MetricId[]),
]);

/**
 * Simulate the next days under a plan (or under "change nothing" when plan is
 * null, in which case the recent habit simply continues).
 */
export function simulatePlan(
  state: SimState,
  plan: Plan | null,
  startDay: number,
  thresholds: Thresholds,
  weights: RegionWeights,
  horizon: number = RESPONSE.horizonDays,
): SimResult {
  const R = RESPONSE;
  const cur: Partial<Record<MetricId, number>> = { ...state.badness };
  const shortLine = state.usualSleep - R.shortNightMarginH;
  const days: SimDay[] = [];
  let greenDay: number | null = null;

  for (let i = 1; i <= horizon; i++) {
    const active = plan !== null && i <= plan.nights;
    // With a plan: hold it, then return to the usual routine.
    // Without one: the recent habit continues unchanged.
    const sleep = plan ? (active ? plan.sleepHours : Math.max(state.usualSleep, plan.sleepHours)) : state.habitSleep;
    const crew = active ? plan!.crewTimeHours : 0;
    const extraEx = active ? plan!.extraExerciseMin : 0;
    const extraHy = active ? plan!.extraHydrationL : 0;
    const exercise = (plan ? Math.max(state.habitExercise, state.usualExercise) : state.habitExercise) + extraEx;
    const hydration = (plan ? Math.max(state.habitHydration, state.usualHydration) : state.habitHydration) + extraHy;

    const sleepDose = Math.max(0, sleep - shortLine);
    const shortfall = Math.max(0, shortLine - sleep);
    const dose: Record<LeverId, number> = {
      sleep: sleepDose,
      crewTime: crew,
      exercise: extraEx / 30,
      hydration: extraHy / 0.5,
    };

    for (const def of METRICS) {
      const id = def.id;
      if (cur[id] === undefined) continue;
      if (id === "sleep_hours") {
        cur[id] = badnessOf((sleep - state.usualSleep) / state.sleepScale, "low");
      } else if (id === "exercise_min") {
        cur[id] = badnessOf((exercise - state.usualExercise) / state.exerciseScale, "low");
      } else if (id === "hydration") {
        cur[id] = badnessOf((hydration - state.usualHydration) / state.hydrationScale, "low");
      } else {
        let b = cur[id]!;
        let pull = 0;
        for (const lever of Object.keys(dose) as LeverId[]) {
          pull += (R.perUnit[lever][id] ?? 0) * dose[lever];
        }
        const harm = (R.shortSleepHarm[id] ?? 0) * shortfall;
        if (HAS_LEVER.has(id)) {
          const recovery = Math.min(R.maxRecoveryPerDay, pull + (shortfall === 0 ? R.naturalRecovery : 0));
          b = b - recovery + harm;
        }
        cur[id] = Math.max(0, b);
      }
    }

    const offenders = (Object.keys(cur) as MetricId[]).filter((id) => cur[id]! >= thresholds.zAmber);
    const green = offenders.length === 0;
    const day = startDay + i;
    if (green && greenDay === null) greenDay = day;
    days.push({ day, badness: { ...cur }, score: scoreFromBadness(cur, weights).score, green, offenders });
  }

  const unaddressable = (Object.keys(state.badness) as MetricId[]).filter(
    (id) => state.badness[id]! >= thresholds.zAmber && !HAS_LEVER.has(id),
  );
  return { days, greenDay, unaddressable };
}

export function planEffort(plan: Plan, state: SimState): number {
  const E = RESPONSE.effort;
  const extraSleep = Math.max(0, plan.sleepHours - state.habitSleep);
  return (
    plan.nights *
    (extraSleep * E.sleepPerHourNight +
      plan.crewTimeHours * E.crewTimePerHourDay +
      (plan.extraExerciseMin / 15) * E.exercisePer15MinDay +
      (plan.extraHydrationL / 0.5) * E.hydrationPerHalfLitreDay)
  );
}

export interface PlanSearchResult {
  /** True when the astronaut is already green: nothing to change. */
  alreadyGreen: boolean;
  plan: Plan | null;
  result: SimResult | null;
  effort: number;
  /** What happens if nothing changes. */
  doNothing: SimResult;
  unaddressable: MetricId[];
  /** Plain-language summary, e.g. "sleep 7 h for 2 nights + 1 h shared crew time". */
  summary: string;
  evaluated: number;
}

export function describePlan(plan: Plan): string {
  const parts = [`sleep ${fmt(plan.sleepHours)} h for ${plan.nights} night${plan.nights === 1 ? "" : "s"}`];
  if (plan.crewTimeHours > 0) parts.push(`${fmt(plan.crewTimeHours)} h shared crew time`);
  if (plan.extraExerciseMin > 0) parts.push(`${plan.extraExerciseMin} min extra exercise`);
  if (plan.extraHydrationL > 0) parts.push(`${fmt(plan.extraHydrationL)} L extra fluids`);
  return parts.join(" + ");
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Sleep targets offered by the search: from about usual sleep (never more than 30 min under it) up to 9 h. */
export function sleepOptions(usualSleep: number): number[] {
  const start = Math.min(9, Math.max(6, Math.ceil((usualSleep - 0.5) * 2) / 2));
  const out: number[] = [];
  for (let h = start; h <= 9.0001; h += 0.5) out.push(Math.round(h * 2) / 2);
  return out;
}

/**
 * Grid search for the lowest-effort plan that reaches green. The plan must
 * finish the job by the day after it ends, so "for N nights" stays honest.
 */
export function findPathToGreen(
  state: SimState,
  startDay: number,
  thresholds: Thresholds,
  weights: RegionWeights,
): PlanSearchResult {
  const doNothing = simulatePlan(state, null, startDay, thresholds, weights);
  const drifting = (Object.keys(state.badness) as MetricId[]).filter((id) => state.badness[id]! >= thresholds.zAmber);
  const unaddressable = doNothing.unaddressable;
  if (drifting.length === 0) {
    return { alreadyGreen: true, plan: null, result: null, effort: 0, doNothing, unaddressable, summary: "On your baseline. No change needed.", evaluated: 0 };
  }

  // Ignore metrics no lever can move when judging "green" for the plan.
  const ignore = new Set(unaddressable);
  const firstGreen = (r: SimResult): number | null => {
    for (const d of r.days) if (d.offenders.every((o) => ignore.has(o))) return d.day;
    return null;
  };

  let best: { plan: Plan; result: SimResult; effort: number; cost: number; green: number } | null = null;
  let evaluated = 0;
  for (const sleepHours of sleepOptions(state.usualSleep)) {
    for (let nights = 1; nights <= 4; nights++) {
      for (const crewTimeHours of [0, 0.5, 1, 1.5, 2]) {
        for (const extraExerciseMin of [0, 15, 30]) {
          for (const extraHydrationL of [0, 0.5, 1]) {
            const plan: Plan = { sleepHours, nights, crewTimeHours, extraExerciseMin, extraHydrationL };
            evaluated++;
            const result = simulatePlan(state, plan, startDay, thresholds, weights);
            const green = firstGreen(result);
            if (green === null || green > startDay + nights + 1) continue;
            const effort = planEffort(plan, state);
            const cost = effort + RESPONSE.dayPenalty * (green - startDay);
            if (!best || cost < best.cost - 1e-9) best = { plan, result, effort, cost, green };
          }
        }
      }
    }
  }

  if (!best) {
    const names = unaddressable.map((id) => METRIC_BY_ID[id].plain).join(", ");
    return {
      alreadyGreen: false, plan: null, result: null, effort: 0, doNothing, unaddressable, evaluated,
      summary: unaddressable.length
        ? `Sleep, crew time, exercise and fluids cannot bring ${names} back on their own. See alerts.`
        : "No plan in the search grid reaches green within 7 days. Ask the flight surgeon.",
    };
  }
  const result: SimResult = { ...best.result, greenDay: best.green };
  return {
    alreadyGreen: false, plan: best.plan, result, effort: best.effort, doNothing, unaddressable, evaluated,
    summary: describePlan(best.plan),
  };
}

/** Green day for a plan, ignoring metrics no lever can move. */
export function greenDayFor(result: SimResult, unaddressable: MetricId[]): number | null {
  const ignore = new Set(unaddressable);
  for (const d of result.days) if (d.offenders.every((o) => ignore.has(o))) return d.day;
  return null;
}
