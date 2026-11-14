import { computeBaseline, latestSample, recentTrend, robustZ } from "./baseline";
import { METRICS, METRIC_BY_ID, REGION_IDS, formatValue } from "./metrics";
import type {
  Baseline,
  Direction,
  MetricDef,
  MetricId,
  MetricState,
  RegionId,
  RegionState,
  Sample,
  SeriesMap,
  Status,
  Thresholds,
} from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = {
  zAmber: 1.5,
  zRed: 2.5,
  hard: {
    // Demo values — see content/sources.json ("demo-thresholds").
    spo2: { redBelow: 90 },
    temp: { redAbove: 38.0 },
  },
};

const RANK: Record<Status, number> = { unknown: 0, green: 1, amber: 2, red: 3 };

export function worstStatus(statuses: Status[]): Status {
  let worst: Status = "unknown";
  for (const s of statuses) if (RANK[s] > RANK[worst]) worst = s;
  return worst;
}

/** z in the unhealthy direction; drift in the healthy direction counts as 0. */
export function badnessOf(z: number, direction: Direction): number {
  if (direction === "low") return Math.max(0, -z);
  if (direction === "high") return Math.max(0, z);
  return Math.abs(z);
}

export function statusFromBadness(badness: number, t: Thresholds): Status {
  if (badness > t.zRed) return "red";
  if (badness >= t.zAmber) return "amber";
  return "green";
}

function driftReason(def: MetricDef, value: number, baseline: Baseline, z: number, status: Status, hard: boolean): string {
  const v = `${formatValue(def.id, value)} ${def.unit}`.trim();
  if (hard) return `${def.label} is ${v}, past the hard limit.`;
  if (!baseline.sufficient) return `${def.label} is ${v}. Not enough history for a personal baseline yet.`;
  const base = `${formatValue(def.id, baseline.median)} ${def.unit}`.trim();
  if (status === "green") return `${def.label} is ${v}, in line with your usual ${base}.`;
  const dir = z < 0 ? "below" : "above";
  return `${def.label} is ${v}, ${dir} your usual ${base} (${Math.abs(z).toFixed(1)} baseline widths).`;
}

export function evaluateMetric(
  def: MetricDef,
  samples: Sample[] | undefined,
  day: number,
  thresholds: Thresholds,
): MetricState {
  const series = samples ?? [];
  const baseline = computeBaseline(series, day, def);
  const latest = latestSample(series, day, def);
  if (!latest) {
    return {
      metric: def.id, value: null, day: null, baseline, z: null, badness: 0,
      status: "unknown", hardLimitHit: false, reason: `No recent ${def.plain} reading.`, trendPerDay: null,
    };
  }
  const hard = thresholds.hard[def.id];
  const hardHit =
    (hard?.redBelow !== undefined && latest.value < hard.redBelow) ||
    (hard?.redAbove !== undefined && latest.value > hard.redAbove);

  if (!baseline.sufficient) {
    const status: Status = hardHit ? "red" : "unknown";
    return {
      metric: def.id, value: latest.value, day: latest.day, baseline, z: null, badness: hardHit ? thresholds.zRed + 1 : 0,
      status, hardLimitHit: hardHit, reason: driftReason(def, latest.value, baseline, 0, status, hardHit), trendPerDay: null,
    };
  }
  const z = robustZ(latest.value, baseline);
  const badness = badnessOf(z, def.direction);
  const status: Status = hardHit ? "red" : statusFromBadness(badness, thresholds);
  // Steady drift: a robust slope that most day pairs agree on, in the unhealthy
  // direction, and large enough to matter (one baseline width over the window).
  let trendPerDay: number | null = null;
  let trendText = "";
  if (status !== "green" && def.cadence === "daily") {
    const trend = recentTrend(series, day);
    if (trend && trend.agreement >= 0.8 && badnessOf(trend.slope, def.direction) > 0 && Math.abs(trend.slope) * (trend.days - 1) >= baseline.scale) {
      trendPerDay = trend.slope;
      const per = Math.abs(trend.slope).toFixed(Math.max(1, def.decimals));
      trendText = ` ${trend.slope < 0 ? "Falling" : "Rising"} about ${per} ${def.unit} a day over the last ${trend.days} days.`.replace("  ", " ");
    }
  }
  return {
    metric: def.id, value: latest.value, day: latest.day, baseline, z,
    badness: hardHit ? Math.max(badness, thresholds.zRed + 0.5) : badness,
    status, hardLimitHit: hardHit,
    reason: driftReason(def, latest.value, baseline, z, status, hardHit) + trendText,
    trendPerDay,
  };
}

export function evaluateAllMetrics(
  series: SeriesMap,
  day: number,
  thresholds: Thresholds,
): Record<MetricId, MetricState> {
  const out = {} as Record<MetricId, MetricState>;
  for (const def of METRICS) out[def.id] = evaluateMetric(def, series[def.id], day, thresholds);
  return out;
}

/** Region colour = worst metric in the region. */
export function evaluateRegions(metrics: Record<MetricId, MetricState>): Record<RegionId, RegionState> {
  const out = {} as Record<RegionId, RegionState>;
  for (const region of REGION_IDS) {
    const ids = METRICS.filter((m) => m.region === region).map((m) => m.id);
    let worst: MetricId | null = null;
    for (const id of ids) {
      const s = metrics[id];
      if (s.status === "unknown") continue;
      if (!worst || s.badness > metrics[worst].badness) worst = id;
    }
    out[region] = {
      region,
      status: worstStatus(ids.map((id) => metrics[id].status)),
      worst,
      metrics: ids,
    };
  }
  return out;
}

export function metricLabel(id: MetricId): string {
  return METRIC_BY_ID[id].label;
}
