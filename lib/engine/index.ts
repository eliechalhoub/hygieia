import { detectAnomaly } from "./anomaly";
import { forecastMetric } from "./forecast";
import { METRICS, METRIC_BY_ID, REGION_LABEL } from "./metrics";
import { DEFAULT_REGION_WEIGHTS, scoreFromMetrics } from "./score";
import { DEFAULT_THRESHOLDS, evaluateAllMetrics, evaluateRegions, worstStatus } from "./status";
import type { Analysis, EngineConfig, MetricId, MetricState, RegionId, RegionState, SeriesMap } from "./types";

export * from "./types";
export * from "./metrics";
export * from "./baseline";
export * from "./status";
export * from "./score";
export * from "./anomaly";
export * from "./forecast";
export * from "./counterfactual";
export * from "./rules";
export * from "./readiness";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  regionWeights: DEFAULT_REGION_WEIGHTS,
  exercisePrescriptionMin: 120,
};

function explain(
  metrics: Record<MetricId, MetricState>,
  regions: Record<RegionId, RegionState>,
): string {
  const drifting = METRICS.map((m) => metrics[m.id])
    .filter((s) => s.status === "amber" || s.status === "red")
    .sort((a, b) => b.badness - a.badness);
  if (drifting.length === 0) return "All monitored measures are within your personal baseline.";
  const top = drifting.slice(0, 3).map((s) => {
    const def = METRIC_BY_ID[s.metric];
    const dir = s.hardLimitHit ? "past its hard limit" : (s.z ?? 0) < 0 ? "down" : "up";
    return `${def.plain} is ${dir}`;
  });
  const affected = (Object.values(regions) as RegionState[])
    .filter((r) => r.status === "amber" || r.status === "red")
    .map((r) => REGION_LABEL[r.region].toLowerCase());
  const lead = drifting[0];
  const first = lead.day !== null ? lead.reason : "";
  return `${cap(top.join(", "))}. ${first} Affected: ${affected.join(", ")}.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Full analysis of one astronaut on one mission day. */
export function analyzeAstronaut(
  astronautId: number,
  series: SeriesMap,
  day: number,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  opts: { forecasts?: boolean } = {},
): Analysis {
  const metrics = evaluateAllMetrics(series, day, config.thresholds);
  const regions = evaluateRegions(metrics);
  const status = worstStatus(Object.values(regions).map((r) => r.status));
  const score = scoreFromMetrics(metrics, config.regionWeights);
  const anomaly = detectAnomaly(series, day);
  const forecasts: Analysis["forecasts"] = {};
  if (opts.forecasts !== false) {
    for (const def of METRICS) {
      if (def.cadence !== "daily") continue;
      const s = series[def.id];
      if (!s) continue;
      forecasts[def.id] = forecastMetric(s, day, metrics[def.id].baseline, config.thresholds);
    }
  }
  return { astronautId, day, metrics, regions, status, score, anomaly, forecasts, explanation: explain(metrics, regions) };
}
