import type { MetricDef, MetricId, RegionId } from "./types";

// All astronauts log the same core set (NASA Standard Measures idea).
// `scaleFloor` is the smallest day-to-day change worth reacting to for each
// metric (demo values): it keeps ordinary variation from raising an amber.
// Sources are simulated: an actigraphy band modelled on NASA ARCHeR, a vitals
// patch, a personal dosimeter modelled on CSA CANS, manual logs and self-tests.
export const METRICS: MetricDef[] = [
  { id: "sleep_hours", label: "Sleep", plain: "sleep", unit: "h", region: "head", direction: "low", source: "actigraphy", decimals: 1, scaleFloor: 0.4, cadence: "daily", inAnomalyVector: true },
  { id: "sleep_regularity", label: "Sleep regularity", plain: "sleep schedule", unit: "/100", region: "head", direction: "low", source: "actigraphy", decimals: 0, scaleFloor: 4, cadence: "daily" },
  { id: "light_exposure", label: "Daytime light", plain: "daytime light", unit: "klx·h", region: "head", direction: "low", source: "actigraphy", decimals: 1, scaleFloor: 0.62, cadence: "daily" },
  { id: "mood", label: "Mood", plain: "mood", unit: "/10", region: "head", direction: "low", source: "manual", decimals: 1, scaleFloor: 0.55, cadence: "daily", inAnomalyVector: true },
  { id: "pvt_rt", label: "Reaction time (PVT)", plain: "reaction time", unit: "ms", region: "head", direction: "high", source: "self_test", decimals: 0, scaleFloor: 11, cadence: "daily" },
  { id: "pvt_lapses", label: "PVT lapses", plain: "attention lapses", unit: "", region: "head", direction: "high", source: "self_test", decimals: 0, scaleFloor: 1, cadence: "daily" },
  { id: "vision_score", label: "Vision self-check", plain: "vision self-check", unit: "/100", region: "eyes", direction: "low", source: "self_test", decimals: 0, scaleFloor: 2.4, cadence: "weekly" },
  { id: "balance_score", label: "Balance self-check", plain: "balance self-check", unit: "/100", region: "inner_ear", direction: "low", source: "self_test", decimals: 0, scaleFloor: 3.2, cadence: "weekly" },
  { id: "hr", label: "Resting heart rate", plain: "resting heart rate", unit: "bpm", region: "heart", direction: "high", source: "vitals", decimals: 0, scaleFloor: 2.4, cadence: "daily", inAnomalyVector: true },
  { id: "hrv", label: "Heart-rate variability", plain: "heart-rate variability", unit: "ms", region: "heart", direction: "low", source: "vitals", decimals: 0, scaleFloor: 4.6, cadence: "daily", inAnomalyVector: true },
  { id: "bp_sys", label: "Systolic BP", plain: "systolic blood pressure", unit: "mmHg", region: "heart", direction: "both", source: "vitals", decimals: 0, scaleFloor: 4, cadence: "daily", inAnomalyVector: true },
  { id: "bp_dia", label: "Diastolic BP", plain: "diastolic blood pressure", unit: "mmHg", region: "heart", direction: "both", source: "vitals", decimals: 0, scaleFloor: 3.2, cadence: "daily" },
  { id: "spo2", label: "SpO₂", plain: "blood oxygen", unit: "%", region: "lungs", direction: "low", source: "vitals", decimals: 1, scaleFloor: 0.55, cadence: "daily", inAnomalyVector: true },
  { id: "exercise_min", label: "Exercise", plain: "exercise", unit: "min", region: "muscles_bones", direction: "low", source: "manual", decimals: 0, scaleFloor: 9.5, cadence: "daily" },
  { id: "activity", label: "Activity", plain: "daily activity", unit: "active min", region: "muscles_bones", direction: "low", source: "actigraphy", decimals: 0, scaleFloor: 19, cadence: "daily" },
  { id: "temp", label: "Body temperature", plain: "body temperature", unit: "°C", region: "immune", direction: "high", source: "vitals", decimals: 1, scaleFloor: 0.16, cadence: "daily", inAnomalyVector: true },
  { id: "glucose", label: "Glucose", plain: "glucose", unit: "mg/dL", region: "whole_body", direction: "both", source: "vitals", decimals: 0, scaleFloor: 5.5, cadence: "daily" },
  { id: "hydration", label: "Fluids", plain: "fluid intake", unit: "L", region: "whole_body", direction: "low", source: "manual", decimals: 1, scaleFloor: 0.24, cadence: "daily", inAnomalyVector: true },
  { id: "calories", label: "Energy intake", plain: "energy intake", unit: "kcal", region: "whole_body", direction: "low", source: "manual", decimals: 0, scaleFloor: 170, cadence: "daily" },
  { id: "dose_daily", label: "Daily radiation dose", plain: "daily radiation dose", unit: "mSv", region: "whole_body", direction: "high", source: "dosimeter", decimals: 2, scaleFloor: 0.02, relScaleFloor: 0.115, cadence: "daily" },
];

export const METRIC_BY_ID: Record<MetricId, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.id, m]),
) as Record<MetricId, MetricDef>;

export const METRIC_IDS: MetricId[] = METRICS.map((m) => m.id);

export const REGIONS: { id: RegionId; label: string; covers: string }[] = [
  { id: "head", label: "Head", covers: "mood, sleep, cognition" },
  { id: "eyes", label: "Eyes", covers: "vision (SANS screening)" },
  { id: "inner_ear", label: "Inner ear", covers: "balance" },
  { id: "heart", label: "Heart & vessels", covers: "heart rate, HRV, blood pressure" },
  { id: "lungs", label: "Lungs", covers: "blood oxygen" },
  { id: "muscles_bones", label: "Muscles & bones", covers: "exercise adherence (proxy)" },
  { id: "immune", label: "Immune", covers: "temperature, infection early warning" },
  { id: "whole_body", label: "Whole body", covers: "radiation, nutrition" },
];

export const REGION_LABEL: Record<RegionId, string> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r.label]),
) as Record<RegionId, string>;

export const REGION_IDS: RegionId[] = REGIONS.map((r) => r.id);

export function metricsInRegion(region: RegionId): MetricDef[] {
  return METRICS.filter((m) => m.region === region);
}

export function formatValue(metric: MetricId, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const def = METRIC_BY_ID[metric];
  return value.toFixed(def.decimals);
}

export const STATUS_WORD: Record<string, string> = {
  green: "Green",
  amber: "Amber",
  red: "Red",
  unknown: "No data",
};
