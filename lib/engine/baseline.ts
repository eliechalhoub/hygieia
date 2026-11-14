import type { Baseline, MetricDef, Sample } from "./types";

export const BASELINE_WINDOW_DAYS = 30;
/** Weekly self-tests need a longer look-back to collect enough points. */
export const WEEKLY_WINDOW_DAYS = 70;
export const MIN_SAMPLES_DAILY = 7;
export const MIN_SAMPLES_WEEKLY = 4;
/** Makes MAD comparable to a standard deviation for normal data. */
export const MAD_TO_SD = 1.4826;

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median absolute deviation around a centre. */
export function mad(values: number[], centre: number = median(values)): number {
  if (values.length === 0) return NaN;
  return median(values.map((v) => Math.abs(v - centre)));
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

export function windowFor(def: Pick<MetricDef, "cadence">): { days: number; min: number } {
  return def.cadence === "weekly"
    ? { days: WEEKLY_WINDOW_DAYS, min: MIN_SAMPLES_WEEKLY }
    : { days: BASELINE_WINDOW_DAYS, min: MIN_SAMPLES_DAILY };
}

/**
 * Personal baseline for one metric: rolling median + MAD over the days
 * *before* `day` (today is excluded so a bad day cannot hide itself).
 */
export function computeBaseline(
  samples: Sample[],
  day: number,
  def: Pick<MetricDef, "cadence" | "scaleFloor" | "relScaleFloor">,
): Baseline {
  const { days, min } = windowFor(def);
  const values = samples
    .filter((s) => s.day < day && s.day >= day - days)
    .map((s) => s.value);
  if (values.length === 0) {
    return { median: NaN, scale: def.scaleFloor, n: 0, sufficient: false };
  }
  const med = median(values);
  const scale = Math.max(MAD_TO_SD * mad(values, med), def.scaleFloor, (def.relScaleFloor ?? 0) * Math.abs(med));
  return { median: med, scale, n: values.length, sufficient: values.length >= min };
}

/** Signed robust z-score of a value against a baseline. */
export function robustZ(value: number, baseline: Baseline): number {
  return (value - baseline.median) / baseline.scale;
}

/** Latest sample on or before `day`, ignoring stale readings. */
export function latestSample(
  samples: Sample[],
  day: number,
  def: Pick<MetricDef, "cadence">,
): Sample | null {
  const maxAge = def.cadence === "weekly" ? 10 : 2;
  let best: Sample | null = null;
  for (const s of samples) {
    if (s.day <= day && s.day >= day - maxAge && (!best || s.day > best.day)) best = s;
  }
  return best;
}

export interface Trend {
  /** Robust slope per day (Theil–Sen: the median of all pairwise slopes). */
  slope: number;
  /** Share of pairwise slopes that point the same way as the median slope (0.5–1). */
  agreement: number;
  days: number;
}

/**
 * Robust recent trend of a metric. Theil–Sen ignores a single odd reading,
 * which a least-squares line would follow.
 */
export function recentTrend(samples: Sample[], day: number, windowDays = 5, minSamples = 4): Trend | null {
  const pts = samples.filter((s) => s.day <= day && s.day > day - windowDays).sort((a, b) => a.day - b.day);
  if (pts.length < minSamples) return null;
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) slopes.push((pts[j].value - pts[i].value) / (pts[j].day - pts[i].day));
  }
  const slope = median(slopes);
  const same = slopes.filter((x) => Math.sign(x) === Math.sign(slope) && x !== 0).length;
  return { slope, agreement: slopes.length ? same / slopes.length : 0, days: pts[pts.length - 1].day - pts[0].day + 1 };
}
