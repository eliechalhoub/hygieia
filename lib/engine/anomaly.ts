import { Matrix, inverse } from "ml-matrix";
import { METRICS, METRIC_BY_ID } from "./metrics";
import { mean } from "./baseline";
import type { AnomalyResult, MetricId, SeriesMap } from "./types";

export const ANOMALY_CONFIG = {
  /** Days of the astronaut's own history used for the covariance. */
  windowDays: 45,
  /** Need at least this many complete days per dimension. */
  minRowsPerDim: 2.5,
  /** Shrink the covariance toward its diagonal for stability. */
  shrinkage: 0.3,
  /** Chi-square tail probability for the alarm. */
  p: 0.99,
};

/** Standard normal quantile (Acklam's rational approximation). */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new Error("p must be in (0,1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Chi-square quantile via the Wilson–Hilferty approximation. */
export function chiSquareQuantile(p: number, df: number): number {
  const z = normalQuantile(p);
  const t = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * t * t * t;
}

export interface MahalanobisResult {
  distance2: number;
  /** Share of the squared distance attributed to each dimension. */
  shares: number[];
  /** Per-dimension standard score of the point. */
  z: number[];
}

/** Squared Mahalanobis distance of `point` from the rows of `history`. */
export function mahalanobis(history: number[][], point: number[], shrinkage = ANOMALY_CONFIG.shrinkage): MahalanobisResult {
  const k = point.length;
  const n = history.length;
  const mu = Array.from({ length: k }, (_, j) => mean(history.map((r) => r[j])));
  const cov = Matrix.zeros(k, k);
  for (const row of history) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        cov.set(i, j, cov.get(i, j) + ((row[i] - mu[i]) * (row[j] - mu[j])) / (n - 1));
      }
    }
  }
  // Shrink off-diagonal terms; add a tiny ridge so the matrix always inverts.
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if (i !== j) cov.set(i, j, cov.get(i, j) * (1 - shrinkage));
    }
    cov.set(i, i, cov.get(i, i) * 1.0001 + 1e-9);
  }
  const inv = inverse(cov);
  const d = point.map((v, j) => v - mu[j]);
  const invD = inv.mmul(Matrix.columnVector(d)).to1DArray();
  const parts = d.map((v, j) => v * invD[j]);
  const distance2 = Math.max(0, parts.reduce((a, b) => a + b, 0));
  const positive = parts.map((p) => Math.max(0, p));
  const sum = positive.reduce((a, b) => a + b, 0) || 1;
  return {
    distance2,
    shares: positive.map((p) => p / sum),
    z: d.map((v, j) => v / Math.sqrt(cov.get(j, j))),
  };
}

/**
 * Whole-body anomaly: is today's *combination* of readings unusual for this
 * astronaut, even if no single metric crossed its own threshold?
 */
export function detectAnomaly(series: SeriesMap, day: number): AnomalyResult {
  const dims = METRICS.filter((m) => m.inAnomalyVector).map((m) => m.id);
  const empty: AnomalyResult = {
    available: false, distance2: 0, cutoff: 0, isAnomaly: false, dims, contributors: [],
    reason: "Not enough complete days to compare today's overall pattern.",
  };
  const byDay = new Map<number, Map<MetricId, number>>();
  for (const id of dims) {
    for (const s of series[id] ?? []) {
      if (s.day > day || s.day < day - ANOMALY_CONFIG.windowDays) continue;
      if (!byDay.has(s.day)) byDay.set(s.day, new Map());
      byDay.get(s.day)!.set(id, s.value);
    }
  }
  const today = byDay.get(day);
  if (!today || dims.some((id) => !today.has(id))) return empty;
  const history: number[][] = [];
  for (const [d, row] of byDay) {
    if (d === day) continue;
    if (dims.every((id) => row.has(id))) history.push(dims.map((id) => row.get(id)!));
  }
  if (history.length < dims.length * ANOMALY_CONFIG.minRowsPerDim) return empty;

  const point = dims.map((id) => today.get(id)!);
  const res = mahalanobis(history, point);
  const cutoff = chiSquareQuantile(ANOMALY_CONFIG.p, dims.length);
  const contributors = dims
    .map((metric, i) => ({ metric, share: res.shares[i], z: res.z[i] }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
  const isAnomaly = res.distance2 > cutoff;
  const names = contributors
    .filter((c) => c.share > 0.1)
    .map((c) => `${METRIC_BY_ID[c.metric].plain} (${c.z > 0 ? "high" : "low"})`);
  return {
    available: true,
    distance2: res.distance2,
    cutoff,
    isAnomaly,
    dims,
    contributors,
    reason: isAnomaly
      ? `Today's overall pattern is unusual for you. Biggest contributors: ${names.join(", ")}.`
      : "Today's overall pattern matches your own history.",
  };
}
