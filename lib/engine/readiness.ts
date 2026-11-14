import { METRICS } from "./metrics";
import { scoreFromBadness } from "./score";
import { badnessOf, statusFromBadness, worstStatus } from "./status";
import type { Analysis, EngineConfig, MetricId, Status } from "./types";

export interface TaskEvent {
  id: number;
  kind: string;
  title: string;
  missionDay: number;
  /** Astronaut ids currently assigned. */
  assigned: number[];
  /** Training tag a crew member needs, e.g. "EVA". */
  requires: string | null;
}

export interface CrewMember {
  id: number;
  name: string;
  trained: string[];
  analysis: Analysis;
}

export interface Projection {
  day: number;
  score: number;
  status: Status;
  /** Metrics projected amber/red on the task day. */
  offenders: MetricId[];
  /** True when at least one metric used a forecast instead of the last value. */
  usedForecast: boolean;
}

/**
 * Project an astronaut to a future day: use each metric's forecast when the
 * engine did not abstain, otherwise carry the latest reading forward.
 */
export function projectAnalysis(analysis: Analysis, targetDay: number, config: EngineConfig): Projection {
  const badness: Partial<Record<MetricId, number>> = {};
  const offenders: MetricId[] = [];
  const statuses: Status[] = [];
  let usedForecast = false;
  for (const def of METRICS) {
    const s = analysis.metrics[def.id];
    if (s.status === "unknown" || s.value === null) continue;
    let b = s.badness;
    const fc = analysis.forecasts[def.id];
    const point = fc && !fc.abstained ? fc.points.find((p) => p.day === targetDay) : undefined;
    if (point && !s.hardLimitHit && targetDay > analysis.day) {
      const toBad = (v: number) => badnessOf((v - s.baseline.median) / s.baseline.scale, def.direction);
      const projected = toBad(point.value);
      if (s.status !== "green") {
        // Already drifting: follow the trend.
        b = projected;
        usedForecast = true;
      } else if (Math.min(toBad(point.lo), toBad(point.hi)) >= config.thresholds.zAmber) {
        // Currently green: only count a drift the whole 80 % band agrees on.
        b = projected;
        usedForecast = true;
      }
    }
    badness[def.id] = b;
    const st = statusFromBadness(b, config.thresholds);
    statuses.push(st);
    if (st !== "green") offenders.push(def.id);
  }
  const score = scoreFromBadness(badness, config.regionWeights);
  return { day: targetDay, score: score.score, status: worstStatus(statuses), offenders, usedForecast };
}

export interface GoNoGo {
  task: TaskEvent;
  threshold: number;
  crew: {
    astronautId: number;
    name: string;
    projection: Projection;
    go: boolean;
    reason: string;
  }[];
  go: boolean;
  swaps: { out: number; outName: string; in: number; inName: string; reason: string }[];
}

export const DEFAULT_TASK_THRESHOLDS: Record<string, number> = { EVA: 75, docking: 70, gravity_transition: 65 };

function isGo(p: Projection, threshold: number): boolean {
  return p.score >= threshold && p.status !== "red";
}

/** Go/no-go for one task, with swap suggestions from green, trained crew. */
export function assessTask(
  task: TaskEvent,
  crew: CrewMember[],
  config: EngineConfig,
  thresholds: Record<string, number> = DEFAULT_TASK_THRESHOLDS,
): GoNoGo {
  const threshold = thresholds[task.kind] ?? 70;
  const projections = new Map(crew.map((c) => [c.id, projectAnalysis(c.analysis, task.missionDay, config)]));
  const assigned = crew.filter((c) => task.assigned.includes(c.id));
  const rows = assigned.map((c) => {
    const p = projections.get(c.id)!;
    const go = isGo(p, threshold);
    return {
      astronautId: c.id, name: c.name, projection: p, go,
      reason: go
        ? `Projected readiness ${p.score} on Day ${task.missionDay} (needs ${threshold}).`
        : `Projected readiness ${p.score} on Day ${task.missionDay}, below the ${threshold} needed${p.status === "red" ? " and still red" : ""}.`,
    };
  });

  const used = new Set(task.assigned);
  const swaps: GoNoGo["swaps"] = [];
  for (const row of rows.filter((r) => !r.go)) {
    const candidates = crew
      .filter((c) => !used.has(c.id))
      .filter((c) => !task.requires || c.trained.includes(task.requires))
      .filter((c) => c.analysis.status === "green" && isGo(projections.get(c.id)!, threshold))
      .sort((a, b) => projections.get(b.id)!.score - projections.get(a.id)!.score);
    const pick = candidates[0];
    if (pick) {
      used.add(pick.id);
      swaps.push({
        out: row.astronautId, outName: row.name, in: pick.id, inName: pick.name,
        reason: `${pick.name} is green${task.requires ? `, ${task.requires}-trained` : ""}, projected readiness ${projections.get(pick.id)!.score}.`,
      });
    }
  }
  return { task, threshold, crew: rows, go: rows.every((r) => r.go), swaps };
}
