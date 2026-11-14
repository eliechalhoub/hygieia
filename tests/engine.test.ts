import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENGINE_CONFIG, DEFAULT_REGION_WEIGHTS, DEFAULT_THRESHOLDS, METRIC_BY_ID,
  analyzeAstronaut, assessTask, badnessOf, buildSimState, chiSquareQuantile, compare, computeBaseline, detectAnomaly,
  evaluateMetric, evaluateRegions, evaluateAllMetrics, findPathToGreen, forecastMetric, greenDayFor, holtFit, mad, mahalanobis,
  median, normalQuantile, penaltyFromBadness, projectAnalysis, robustZ, runAstronautRules, runCabinAirRule, runStandingOrders,
  scoreFromBadness, simulatePlan, sleepOptions, standingOrderMatches, statusFromBadness, worstStatus,
  type MetricId, type Sample, type SeriesMap, type StandingOrder,
} from "@/lib/engine";
import { mulberry32 } from "@/lib/db/seed";

const T = DEFAULT_THRESHOLDS;

/** Flat series with small bounded noise. */
function flat(mean: number, amp: number, days: number, seed = 1): Sample[] {
  const rand = mulberry32(seed);
  return Array.from({ length: days }, (_, i) => ({ day: i + 1, value: mean + amp * (2 * rand() - 1) }));
}

const NORMAL: Record<string, [number, number]> = {
  sleep_hours: [7.3, 0.4], sleep_regularity: [86, 4], light_exposure: [4.2, 0.6], mood: [7.6, 0.5], pvt_rt: [262, 10],
  pvt_lapses: [1, 0.4], hr: [58, 2], hrv: [64, 4], bp_sys: [116, 4], bp_dia: [74, 3], spo2: [97.6, 0.5], exercise_min: [118, 9],
  activity: [236, 18], temp: [36.6, 0.15], glucose: [92, 5], hydration: [2.6, 0.2], calories: [2450, 160], dose_daily: [1.8, 0.2],
};

function healthySeries(days = 60): SeriesMap {
  const out: SeriesMap = {};
  Object.entries(NORMAL).forEach(([id, [m, a]], i) => { out[id as MetricId] = flat(m, a, days, 100 + i); });
  return out;
}

function withValues(series: SeriesMap, metric: MetricId, fromDay: number, values: number[]): SeriesMap {
  const copy: SeriesMap = { ...series, [metric]: (series[metric] ?? []).map((s) => ({ ...s })) };
  values.forEach((v, i) => { copy[metric]![fromDay - 1 + i].value = v; });
  return copy;
}

describe("baseline", () => {
  it("computes median and MAD", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it("uses the 30 days before today and excludes today", () => {
    const samples = Array.from({ length: 40 }, (_, i) => ({ day: i + 1, value: i + 1 }));
    const b = computeBaseline(samples, 40, { cadence: "daily", scaleFloor: 0.01 });
    expect(b.n).toBe(30); // days 10..39
    expect(b.median).toBe(24.5);
    expect(b.sufficient).toBe(true);
  });

  it("is robust to a few outliers and floors the scale", () => {
    const samples = flat(7, 0, 30).map((s, i) => (i > 26 ? { ...s, value: 2 } : s));
    const b = computeBaseline(samples, 31, { cadence: "daily", scaleFloor: 0.4 });
    expect(b.median).toBe(7);
    expect(b.scale).toBe(0.4);
    expect(robustZ(6.2, b)).toBeCloseTo(-2, 5);
  });

  it("flags too little history as insufficient", () => {
    const b = computeBaseline(flat(60, 2, 4), 5, { cadence: "daily", scaleFloor: 1 });
    expect(b.sufficient).toBe(false);
  });
});

describe("status", () => {
  it("maps badness to green / amber / red at 1.5 and 2.5", () => {
    expect(statusFromBadness(1.49, T)).toBe("green");
    expect(statusFromBadness(1.5, T)).toBe("amber");
    expect(statusFromBadness(2.5, T)).toBe("amber");
    expect(statusFromBadness(2.51, T)).toBe("red");
  });

  it("only counts drift in the unhealthy direction", () => {
    expect(badnessOf(-3, "low")).toBe(3);
    expect(badnessOf(3, "low")).toBe(0);
    expect(badnessOf(3, "high")).toBe(3);
    expect(badnessOf(-2, "both")).toBe(2);
  });

  it("lets a hard limit override the z-score (SpO₂ < 90 % is red)", () => {
    // A wide baseline would call 89.5 % "amber" by z-score alone.
    const samples = [...flat(95, 5, 30, 7), { day: 31, value: 89.5 }];
    const st = evaluateMetric(METRIC_BY_ID.spo2, samples, 31, T);
    expect(st.hardLimitHit).toBe(true);
    expect(st.status).toBe("red");
  });

  it("colours a region by its worst metric", () => {
    const series = withValues(healthySeries(), "mood", 60, [4.0]);
    const metrics = evaluateAllMetrics(series, 60, T);
    const regions = evaluateRegions(metrics);
    expect(metrics.mood.status).toBe("red");
    expect(regions.head.status).toBe("red");
    expect(regions.head.worst).toBe("mood");
    expect(regions.heart.status).toBe("green");
    expect(worstStatus(["green", "amber", "unknown"])).toBe("amber");
  });

  it("reports unknown when there is no recent reading", () => {
    const st = evaluateMetric(METRIC_BY_ID.hr, flat(58, 2, 20), 40, T);
    expect(st.status).toBe("unknown");
  });
});

describe("score", () => {
  it("is 100 when everything is green and falls with the worst region", () => {
    expect(scoreFromBadness({ sleep_hours: 0.5, hr: 1.2 }, DEFAULT_REGION_WEIGHTS).score).toBe(100);
    const bad = scoreFromBadness({ sleep_hours: 4.5, hr: 0 }, DEFAULT_REGION_WEIGHTS);
    expect(bad.worstRegion).toBe("head");
    expect(bad.score).toBeLessThan(50);
    const pts = bad.contributions.reduce((a, c) => a + c.points, 0);
    expect(Math.round(100 - pts)).toBe(bad.score);
  });

  it("uses profile weights", () => {
    const light = scoreFromBadness({ dose_daily: 3 }, { ...DEFAULT_REGION_WEIGHTS, whole_body: 0.05 });
    const heavy = scoreFromBadness({ dose_daily: 3 }, { ...DEFAULT_REGION_WEIGHTS, whole_body: 0.5 });
    expect(heavy.score).toBeLessThan(light.score);
    expect(penaltyFromBadness(1.5)).toBe(0);
    expect(penaltyFromBadness(10)).toBe(1);
  });
});

describe("anomaly", () => {
  it("approximates normal and chi-square quantiles", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.96, 2);
    expect(chiSquareQuantile(0.99, 10)).toBeCloseTo(23.21, 0);
    expect(chiSquareQuantile(0.95, 3)).toBeCloseTo(7.81, 0);
  });

  it("computes Mahalanobis distance with the astronaut's own covariance", () => {
    const rand = mulberry32(5);
    // Two strongly correlated dimensions.
    const history = Array.from({ length: 200 }, () => { const a = rand() * 2 - 1; return [a, a + 0.1 * (rand() * 2 - 1)]; });
    const along = mahalanobis(history, [0.8, 0.8], 0);
    const against = mahalanobis(history, [0.8, -0.8], 0);
    expect(against.distance2).toBeGreaterThan(along.distance2 * 20);
  });

  it("flags an unusual combination and names the top contributors", () => {
    const base = healthySeries();
    const quiet = detectAnomaly(base, 60);
    expect(quiet.available).toBe(true);
    expect(quiet.isAnomaly).toBe(false);
    let odd = withValues(base, "hr", 60, [70]);
    odd = withValues(odd, "temp", 60, [37.6]);
    const res = detectAnomaly(odd, 60);
    expect(res.isAnomaly).toBe(true);
    expect(res.contributors.slice(0, 2).map((c) => c.metric).sort()).toEqual(["hr", "temp"]);
  });

  it("abstains without enough complete days", () => {
    expect(detectAnomaly(healthySeries(8), 8).available).toBe(false);
  });
});

describe("forecast", () => {
  const baseline = { median: 60, scale: 4, n: 30, sufficient: true };

  it("follows a linear trend", () => {
    const fit = holtFit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(fit.level + fit.trend).toBeCloseTo(11, 1);
    const samples = Array.from({ length: 14 }, (_, i) => ({ day: i + 1, value: 70 - i }));
    const fc = forecastMetric(samples, 14, baseline, T);
    expect(fc.abstained).toBe(false);
    expect(fc.points).toHaveLength(7);
    expect(fc.points[0].day).toBe(15);
    expect(fc.points[6].value).toBeCloseTo(50, 0);
    expect(fc.points[6].hi - fc.points[6].lo).toBeGreaterThanOrEqual(fc.points[0].hi - fc.points[0].lo);
  });

  it("abstains with fewer than 10 samples", () => {
    const fc = forecastMetric(flat(60, 1, 6), 6, baseline, T);
    expect(fc.abstained).toBe(true);
    expect(fc.reason).toMatch(/need 10/);
  });

  it("abstains when the band is wider than the green–red range", () => {
    const rand = mulberry32(3);
    const noisy = Array.from({ length: 14 }, (_, i) => ({ day: i + 1, value: 60 + 40 * (rand() * 2 - 1) }));
    expect(forecastMetric(noisy, 14, baseline, T).abstained).toBe(true);
  });
});

describe("path back to green", () => {
  const day = 60;
  function tiredState() {
    let s = withValues(healthySeries(), "sleep_hours", 58, [5.4, 5.2, 5.1]);
    s = withValues(s, "mood", 58, [6.4, 5.9, 5.4]);
    const metrics = evaluateAllMetrics(s, day, T);
    return { state: buildSimState(metrics, s, day), metrics };
  }

  it("never reaches green if nothing changes", () => {
    const { state } = tiredState();
    const res = simulatePlan(state, null, day, T, DEFAULT_REGION_WEIGHTS);
    expect(res.greenDay).toBeNull();
  });

  it("more sleep never delays recovery", () => {
    const { state } = tiredState();
    let previous = Infinity;
    for (const sleepHours of [5.5, 6.5, 7.5, 8.5]) {
      const res = simulatePlan(state, { sleepHours, nights: 2, crewTimeHours: 1, extraExerciseMin: 0, extraHydrationL: 0 }, day, T, DEFAULT_REGION_WEIGHTS);
      const green = res.greenDay ?? 999;
      expect(green).toBeLessThanOrEqual(previous);
      previous = green;
    }
  });

  it("finds a plan that reaches green by the day after it ends, at lowest effort", () => {
    const { state } = tiredState();
    const found = findPathToGreen(state, day, T, DEFAULT_REGION_WEIGHTS);
    expect(found.alreadyGreen).toBe(false);
    expect(found.plan).not.toBeNull();
    const green = found.result!.greenDay!;
    expect(green).toBeLessThanOrEqual(day + found.plan!.nights + 1);
    expect(found.summary).toMatch(/^sleep \d/);
    expect(found.evaluated).toBeGreaterThan(100);
    // A strictly bigger plan must not be cheaper.
    const bigger = { ...found.plan!, crewTimeHours: found.plan!.crewTimeHours + 0.5 };
    const r = simulatePlan(state, bigger, day, T, DEFAULT_REGION_WEIGHTS);
    expect(greenDayFor(r, [])).not.toBeNull();
  });

  it("says no change is needed when already green", () => {
    const s = healthySeries();
    const metrics = evaluateAllMetrics(s, day, T);
    const found = findPathToGreen(buildSimState(metrics, s, day), day, T, DEFAULT_REGION_WEIGHTS);
    expect(found.alreadyGreen).toBe(true);
  });

  it("names metrics the levers cannot move", () => {
    const s = withValues(healthySeries(), "temp", 59, [37.5, 37.7]);
    const metrics = evaluateAllMetrics(s, day, T);
    const found = findPathToGreen(buildSimState(metrics, s, day), day, T, DEFAULT_REGION_WEIGHTS);
    expect(found.unaddressable).toContain("temp");
  });

  it("offers sleep targets from about usual sleep up to 9 h", () => {
    expect(sleepOptions(7.25)).toEqual([7, 7.5, 8, 8.5, 9]);
  });
});

describe("readiness", () => {
  it("projects, decides go/no-go and suggests a green, trained swap", () => {
    const tired = withValues(withValues(healthySeries(), "sleep_hours", 56, [6.4, 5.9, 5.5, 5.2, 5.0]), "mood", 57, [6.6, 6.0, 5.5, 5.0]);
    const a1 = analyzeAstronaut(1, tired, 60);
    const a2 = analyzeAstronaut(2, healthySeries(), 60);
    const a3 = analyzeAstronaut(3, healthySeries(), 60);
    expect(projectAnalysis(a1, 62, DEFAULT_ENGINE_CONFIG).score).toBeLessThan(75);
    const res = assessTask(
      { id: 1, kind: "EVA", title: "Repair", missionDay: 62, assigned: [1], requires: "EVA" },
      [
        { id: 1, name: "A", trained: ["EVA"], analysis: a1 },
        { id: 2, name: "B", trained: [], analysis: a2 },
        { id: 3, name: "C", trained: ["EVA"], analysis: a3 },
      ],
      DEFAULT_ENGINE_CONFIG,
    );
    expect(res.go).toBe(false);
    expect(res.swaps).toHaveLength(1);
    expect(res.swaps[0].inName).toBe("C"); // B is green but not EVA-trained
  });
});

describe("early-warning rules", () => {
  const ctx = (series: SeriesMap, day = 60) => {
    const a = analyzeAstronaut(1, series, day, DEFAULT_ENGINE_CONFIG, { forecasts: false });
    return { astronautId: 1, name: "Test", day, series, metrics: a.metrics, config: DEFAULT_ENGINE_CONFIG, spaceWeather: [] };
  };
  const rulesOf = (series: SeriesMap, day = 60) => runAstronautRules(ctx(series, day)).map((a) => a.rule);

  it("raises nothing on a healthy baseline", () => {
    expect(rulesOf(healthySeries())).toEqual([]);
  });

  it("infection onset: temperature and heart rate up, HRV down", () => {
    let s = withValues(healthySeries(), "temp", 58, [37.2, 37.5, 37.6]);
    s = withValues(s, "hr", 58, [66, 69, 70]);
    s = withValues(s, "hrv", 58, [55, 52, 51]);
    expect(rulesOf(s)).toContain("infection_onset");
  });

  it("dehydration: fluids low for two days", () => {
    expect(rulesOf(withValues(healthySeries(), "hydration", 59, [1.6, 1.5]))).toContain("dehydration");
  });

  it("fatigue-error risk: short sleep with slow reactions", () => {
    let s = withValues(healthySeries(), "sleep_hours", 58, [5.5, 5.3, 5.2]);
    s = withValues(s, "pvt_rt", 59, [290, 295]);
    const alerts = runAstronautRules(ctx(s));
    const a = alerts.find((x) => x.rule === "fatigue_error_risk");
    expect(a).toBeDefined();
    expect(a!.reason).toMatch(/sleep down/);
  });

  it("bone and muscle trajectory: exercise below 80 % of prescription", () => {
    const s = withValues(healthySeries(), "exercise_min", 47, Array(14).fill(70));
    const a = runAstronautRules(ctx(s)).find((x) => x.rule === "bone_muscle_trajectory");
    expect(a).toBeDefined();
    expect(a!.reason).toMatch(/proxy/);
  });

  it("sleep-schedule drift", () => {
    expect(rulesOf(withValues(healthySeries(), "sleep_regularity", 57, [70, 68, 69, 67]))).toContain("sleep_schedule_drift");
  });

  it("SANS progression: three falling vision checks", () => {
    const s = healthySeries();
    s.vision_score = [3, 10, 17, 24, 31, 38].map((day) => ({ day, value: 92 })).concat([{ day: 45, value: 88 }, { day: 52, value: 84 }, { day: 59, value: 80 }]);
    expect(rulesOf(s)).toContain("sans_progression");
  });

  it("radiation: a replayed real solar particle event raises a red alert with its date", () => {
    const s = withValues(healthySeries(), "dose_daily", 60, [5.9]);
    const c = { ...ctx(s), spaceWeather: [{ kind: "SEP", missionDay: 60, sLevel: 1, realTime: "2026-09-05T16:15:00.000Z", sourceUrl: "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/48558/-1" }] };
    const a = runAstronautRules(c).find((x) => x.rule === "radiation_exposure")!;
    expect(a.severity).toBe("red");
    expect(a.reason).toMatch(/2026-09-05/);
    expect(a.reason).toMatch(/× your typical day/);
  });

  it("cabin air: high CO₂ plus symptoms across the crew", () => {
    const base = { day: 5, co2AmberMmHg: 3, co2RedMmHg: 6, zAmber: 1.5 };
    const crew = [
      { astronautId: 1, name: "A", pvtBadness: 2, headache: false },
      { astronautId: 2, name: "B", pvtBadness: 0, headache: true },
      { astronautId: 3, name: "C", pvtBadness: 0, headache: false },
    ];
    expect(runCabinAirRule({ ...base, cabin: [{ day: 5, co2_mmHg: 4.8 }], crew })).toHaveLength(1);
    expect(runCabinAirRule({ ...base, cabin: [{ day: 5, co2_mmHg: 2.4 }], crew })).toHaveLength(0);
    expect(runCabinAirRule({ ...base, cabin: [{ day: 5, co2_mmHg: 4.8 }], crew: crew.map((c) => ({ ...c, pvtBadness: 0, headache: false })) })).toHaveLength(0);
  });
});

describe("standing orders", () => {
  const order: StandingOrder = { id: 7, metric: "sleep_hours", operator: "<", value: 6, consecutiveDays: 2, advice: "Protect tonight's sleep.", surgeon: "Dr. Test", astronautId: null };

  it("needs N consecutive days", () => {
    expect(compare(5.9, "<", 6)).toBe(true);
    expect(compare(6, "<", 6)).toBe(false);
    const oneNight = withValues(healthySeries(), "sleep_hours", 60, [5.5]);
    const twoNights = withValues(healthySeries(), "sleep_hours", 59, [5.6, 5.5]);
    expect(standingOrderMatches(order, oneNight, 60)).toBe(false);
    expect(standingOrderMatches(order, twoNights, 60)).toBe(true);
  });

  it("labels the alert with the surgeon who pre-authorised it", () => {
    const s = withValues(healthySeries(), "sleep_hours", 59, [5.6, 5.5]);
    const alerts = runStandingOrders([order], 1, s, 60);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].authorisedBy).toBe("Dr. Test");
    expect(alerts[0].advice).toBe("Protect tonight's sleep.");
    expect(runStandingOrders([{ ...order, astronautId: 2 }], 1, s, 60)).toHaveLength(0);
  });
});

describe("algorithm refinements", () => {
  it("Theil–Sen trend ignores one odd reading", async () => {
    const { recentTrend } = await import("@/lib/engine");
    const steady = [7.2, 6.8, 6.4, 6.0, 5.6].map((value, i) => ({ day: i + 1, value }));
    expect(recentTrend(steady, 5)!.slope).toBeCloseTo(-0.4, 5);
    expect(recentTrend(steady, 5)!.agreement).toBe(1);
    const spike = steady.map((s) => (s.day === 3 ? { ...s, value: 9 } : s));
    expect(recentTrend(spike, 5)!.slope).toBeCloseTo(-0.4, 1);
    expect(recentTrend(steady.slice(0, 2), 2)).toBeNull();
  });

  it("adds a steady-drift sentence only for drifting metrics", () => {
    const s = withValues(healthySeries(), "sleep_hours", 56, [6.9, 6.5, 6.1, 5.7, 5.3]);
    const st = evaluateMetric(METRIC_BY_ID.sleep_hours, s.sleep_hours, 60, T);
    expect(st.trendPerDay).toBeCloseTo(-0.4, 1);
    expect(st.reason).toMatch(/Falling about 0\.4 h a day over the last 5 days/);
    const ok = evaluateMetric(METRIC_BY_ID.sleep_hours, healthySeries().sleep_hours, 60, T);
    expect(ok.trendPerDay).toBeNull();
  });

  it("fits Holt smoothing per series: a faster level after a shift, and never an unusable band when a usable one exists", async () => {
    const { fitHoltAuto, HOLT_GRID } = await import("@/lib/engine");
    const shifted = [7.2, 7.3, 7.1, 7.3, 7.2, 7.4, 7.2, 7.3, 7.2, 6.6, 6.1, 5.7, 5.4, 5.2];
    const fast = fitHoltAuto(shifted);
    expect(fast.alpha).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(fast.fit.level - 5.2)).toBeLessThan(0.4);
    expect(HOLT_GRID.alpha).toContain(fast.alpha);
    const wide = fitHoltAuto(shifted, Infinity);
    const tight = fitHoltAuto(shifted, 0.0001);
    expect(wide.usable).toBe(true);
    expect(tight.usable).toBe(false);
  });
});
