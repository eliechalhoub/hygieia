// Hygieia analytics engine — shared types.
// The engine is pure TypeScript: no Node, DOM or database imports, so the
// same code runs on the server (alerts, dashboards) and in the browser
// (the instant "path back to green" slider).

export type Status = "green" | "amber" | "red" | "unknown";

export type RegionId =
  | "head"
  | "eyes"
  | "inner_ear"
  | "heart"
  | "lungs"
  | "muscles_bones"
  | "immune"
  | "whole_body";

/** Which direction of drift is unhealthy for a metric. */
export type Direction = "low" | "high" | "both";

export type MetricSource =
  | "actigraphy"
  | "vitals"
  | "dosimeter"
  | "manual"
  | "self_test";

export type MetricId =
  | "sleep_hours"
  | "sleep_regularity"
  | "activity"
  | "light_exposure"
  | "hr"
  | "hrv"
  | "bp_sys"
  | "bp_dia"
  | "spo2"
  | "temp"
  | "glucose"
  | "hydration"
  | "calories"
  | "exercise_min"
  | "mood"
  | "pvt_rt"
  | "pvt_lapses"
  | "vision_score"
  | "balance_score"
  | "dose_daily";

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Short plain-language name used inside sentences ("your sleep"). */
  plain: string;
  unit: string;
  region: RegionId;
  direction: Direction;
  source: MetricSource;
  decimals: number;
  /** Smallest scale we trust (sensor resolution). Stops a very flat
   *  baseline from turning tiny changes into huge z-scores. */
  scaleFloor: number;
  /** Optional floor as a fraction of the baseline median (used for dose, whose level depends on the profile). */
  relScaleFloor?: number;
  cadence: "daily" | "weekly";
  /** Included in the whole-body Mahalanobis vector. */
  inAnomalyVector?: boolean;
}

export interface Sample {
  day: number;
  value: number;
}

export type SeriesMap = Partial<Record<MetricId, Sample[]>>;

export interface HardLimit {
  redBelow?: number;
  redAbove?: number;
}

export interface Thresholds {
  zAmber: number;
  zRed: number;
  hard: Partial<Record<MetricId, HardLimit>>;
}

export interface Baseline {
  median: number;
  /** Robust scale: 1.4826 × MAD, floored at the metric's scaleFloor. */
  scale: number;
  n: number;
  sufficient: boolean;
}

export interface MetricState {
  metric: MetricId;
  value: number | null;
  day: number | null;
  baseline: Baseline;
  /** Signed robust z-score (positive = above baseline). */
  z: number | null;
  /** "Badness": z in the unhealthy direction, never negative. */
  badness: number;
  status: Status;
  hardLimitHit: boolean;
  /** Plain-language description of the drift. */
  reason: string;
  /** Change per day over the last few days, when the drift is steady; otherwise null. */
  trendPerDay: number | null;
}

export interface RegionState {
  region: RegionId;
  status: Status;
  worst: MetricId | null;
  metrics: MetricId[];
}

export interface ScoreContribution {
  region: RegionId;
  weight: number;
  penalty: number;
  /** Points removed from 100 by this region. */
  points: number;
  worstMetric: MetricId | null;
}

export interface ScoreResult {
  score: number;
  status: Status;
  contributions: ScoreContribution[];
  worstRegion: RegionId | null;
  blend: { worst: number; weighted: number };
}

export interface AnomalyResult {
  available: boolean;
  distance2: number;
  cutoff: number;
  isAnomaly: boolean;
  dims: MetricId[];
  contributors: { metric: MetricId; share: number; z: number }[];
  reason: string;
}

export interface ForecastPoint {
  day: number;
  value: number;
  lo: number;
  hi: number;
}

export interface ForecastResult {
  abstained: boolean;
  reason: string;
  points: ForecastPoint[];
  residualSd: number;
}

export interface Alert {
  rule: string;
  severity: "amber" | "red";
  title: string;
  reason: string;
  /** What the crew member can do now. */
  advice: string;
  astronautId: number | null;
  day: number;
  sourceIds?: string[];
  /** Set when a flight surgeon pre-authorised this alert. */
  authorisedBy?: string;
}

export interface RegionWeights {
  head: number;
  eyes: number;
  inner_ear: number;
  heart: number;
  lungs: number;
  muscles_bones: number;
  immune: number;
  whole_body: number;
}

export interface EngineConfig {
  thresholds: Thresholds;
  regionWeights: RegionWeights;
  /** Daily exercise prescription in minutes (profile dependent). */
  exercisePrescriptionMin: number;
}

export interface Analysis {
  astronautId: number;
  day: number;
  metrics: Record<MetricId, MetricState>;
  regions: Record<RegionId, RegionState>;
  status: Status;
  score: ScoreResult;
  anomaly: AnomalyResult;
  forecasts: Partial<Record<MetricId, ForecastResult>>;
  /** One or two sentences: what drifted and why it matters. */
  explanation: string;
}
