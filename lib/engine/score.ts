import { METRICS, REGION_IDS } from "./metrics";
import type {
  MetricId,
  MetricState,
  RegionId,
  RegionWeights,
  ScoreContribution,
  ScoreResult,
  Status,
} from "./types";

// Score configuration. These are design choices, shown in the "why" panel.
export const SCORE_CONFIG = {
  /** Badness at which a metric starts to cost points (the amber line). */
  penaltyStart: 1.5,
  /** Badness at which a metric costs its full weight. */
  penaltyFull: 4.0,
  /** Half the score follows the single worst region, half the weighted mix. */
  blend: { worst: 0.5, weighted: 0.5 },
  /** Score bands used only for the readiness colour. */
  amberBelow: 80,
  redBelow: 60,
};

export const DEFAULT_REGION_WEIGHTS: RegionWeights = {
  head: 0.18,
  eyes: 0.08,
  inner_ear: 0.06,
  heart: 0.18,
  lungs: 0.12,
  muscles_bones: 0.12,
  immune: 0.1,
  whole_body: 0.16,
};

export function penaltyFromBadness(badness: number): number {
  const { penaltyStart, penaltyFull } = SCORE_CONFIG;
  const p = (badness - penaltyStart) / (penaltyFull - penaltyStart);
  return Math.min(1, Math.max(0, p));
}

/** Readiness score from a map of metric badness values. */
export function scoreFromBadness(
  badness: Partial<Record<MetricId, number>>,
  weights: RegionWeights,
): ScoreResult {
  const totalWeight = REGION_IDS.reduce((a, r) => a + weights[r], 0) || 1;
  let maxPenalty = 0;
  let worstRegion: RegionId | null = null;
  const regionPenalty = {} as Record<RegionId, { p: number; worst: MetricId | null }>;

  for (const region of REGION_IDS) {
    let p = 0;
    let worst: MetricId | null = null;
    for (const def of METRICS) {
      if (def.region !== region) continue;
      const b = badness[def.id];
      if (b === undefined) continue;
      const pen = penaltyFromBadness(b);
      if (worst === null || pen > p) { p = pen; worst = def.id; }
    }
    regionPenalty[region] = { p, worst };
    if (p > maxPenalty) { maxPenalty = p; worstRegion = region; }
  }

  const { blend } = SCORE_CONFIG;
  const contributions: ScoreContribution[] = REGION_IDS.map((region) => {
    const { p, worst } = regionPenalty[region];
    const w = weights[region] / totalWeight;
    const weightedPts = 100 * blend.weighted * w * p;
    const worstPts = region === worstRegion ? 100 * blend.worst * p : 0;
    return { region, weight: w, penalty: p, points: weightedPts + worstPts, worstMetric: p > 0 ? worst : null };
  });

  const lost = contributions.reduce((a, c) => a + c.points, 0);
  const score = Math.round(Math.max(0, Math.min(100, 100 - lost)));
  const status: Status =
    score < SCORE_CONFIG.redBelow ? "red" : score < SCORE_CONFIG.amberBelow ? "amber" : "green";
  return { score, status, contributions, worstRegion, blend };
}

export function scoreFromMetrics(
  metrics: Record<MetricId, MetricState>,
  weights: RegionWeights,
): ScoreResult {
  const badness: Partial<Record<MetricId, number>> = {};
  for (const def of METRICS) {
    const s = metrics[def.id];
    if (s.status !== "unknown") badness[def.id] = s.badness;
  }
  return scoreFromBadness(badness, weights);
}
