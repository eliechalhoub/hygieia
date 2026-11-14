import { sd } from "./baseline";
import type { Baseline, ForecastResult, Sample, Thresholds } from "./types";

export const FORECAST_CONFIG = {
  /** Holt level and trend smoothing. */
  alpha: 0.3,
  beta: 0.1,
  lookbackDays: 14,
  horizonDays: 7,
  minSamples: 10,
  /** z for an 80 % two-sided band. */
  z80: 1.2816,
};

export interface HoltFit {
  level: number;
  trend: number;
  residuals: number[];
}

/** Holt's linear-trend exponential smoothing on evenly spaced values. */
export function holtFit(values: number[], alpha = FORECAST_CONFIG.alpha, beta = FORECAST_CONFIG.beta): HoltFit {
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  // A two-point slope is noisy; start from the average early slope instead.
  if (values.length >= 4) trend = (values[3] - values[0]) / 3;
  const residuals: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const predicted = level + trend;
    residuals.push(values[i] - predicted);
    const newLevel = alpha * values[i] + (1 - alpha) * predicted;
    trend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
  }
  return { level, trend, residuals };
}

/** Standard-deviation multiplier of the h-step-ahead Holt forecast error. */
export function holtSpread(h: number, alpha = FORECAST_CONFIG.alpha, beta = FORECAST_CONFIG.beta): number {
  let v = 1;
  for (let j = 1; j < h; j++) v += (alpha + j * alpha * beta) ** 2;
  return Math.sqrt(v);
}

/** Smoothing values tried for each series. */
export const HOLT_GRID = { alpha: [0.2, 0.3, 0.4, 0.5, 0.65, 0.8], beta: [0.05, 0.1, 0.2, 0.3] };

/**
 * Fit the smoothing pair to the series. Among the pairs whose 80 % band at the
 * end of the horizon is still narrow enough to be useful (`maxWidth`), the one
 * with the smallest one-step squared error wins. Quiet series keep a slow,
 * stable level; a series that has just shifted gets a faster level, so the
 * forecast starts near the latest readings instead of lagging behind them.
 * If no pair is usable, the best-fitting pair is returned and the caller abstains.
 */
export function fitHoltAuto(values: number[], maxWidth = Infinity, horizon = FORECAST_CONFIG.horizonDays): { fit: HoltFit; alpha: number; beta: number; usable: boolean } {
  type Cand = { fit: HoltFit; alpha: number; beta: number; sse: number; usable: boolean };
  let best: Cand | null = null;
  for (const alpha of HOLT_GRID.alpha) {
    for (const beta of HOLT_GRID.beta) {
      const fit = holtFit(values, alpha, beta);
      // Ignore the first two residuals: they mostly reflect the starting guess.
      const sse = fit.residuals.slice(2).reduce((acc, r) => acc + r * r, 0);
      const width = 2 * FORECAST_CONFIG.z80 * Math.max(sd(fit.residuals), 1e-9) * holtSpread(horizon, alpha, beta);
      const cand: Cand = { fit, alpha, beta, sse, usable: width <= maxWidth };
      if (!best || (cand.usable && !best.usable) || (cand.usable === best.usable && sse < best.sse - 1e-12)) best = cand;
    }
  }
  return { fit: best!.fit, alpha: best!.alpha, beta: best!.beta, usable: best!.usable };
}

/**
 * 7-day forecast with an 80 % band. The engine abstains — and says so —
 * when it has too little data or the band is too wide to be useful.
 */
export function forecastMetric(
  samples: Sample[],
  day: number,
  baseline: Baseline,
  thresholds: Thresholds,
): ForecastResult {
  const cfg = FORECAST_CONFIG;
  const recent = samples
    .filter((s) => s.day <= day && s.day > day - cfg.lookbackDays)
    .sort((a, b) => a.day - b.day);
  if (recent.length < cfg.minSamples) {
    return { abstained: true, reason: `Only ${recent.length} readings in the last ${cfg.lookbackDays} days — need ${cfg.minSamples} to forecast.`, points: [], residualSd: 0 };
  }
  // Green–red range: the span between the two red lines around the baseline.
  const greenRedRange = 2 * thresholds.zRed * baseline.scale;
  const { fit, alpha, beta } = fitHoltAuto(recent.map((s) => s.value), baseline.sufficient ? greenRedRange : Infinity);
  const residualSd = Math.max(sd(fit.residuals), 1e-9);
  const points = [];
  for (let h = 1; h <= cfg.horizonDays; h++) {
    const value = fit.level + h * fit.trend;
    const half = cfg.z80 * residualSd * holtSpread(h, alpha, beta);
    points.push({ day: day + h, value, lo: value - half, hi: value + half });
  }
  const last = points[points.length - 1];
  if (baseline.sufficient && last.hi - last.lo > greenRedRange) {
    return { abstained: true, reason: "Recent readings are too noisy for a useful forecast.", points: [], residualSd };
  }
  return { abstained: false, reason: `Holt linear trend on the last 14 days (level ${alpha}, trend ${beta}), 80 % band.`, points, residualSd };
}
