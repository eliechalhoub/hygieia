import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The scripted demo storyline (section 11 of the brief), checked end to end
// against a freshly seeded temporary database.

const file = path.join(os.tmpdir(), `hygieia-test-${process.pid}.db`);
process.env.HYGIEIA_DB = file;

type Q = typeof import("@/lib/server/queries");
type E = typeof import("@/lib/engine");
let q: Q;
let e: E;
let close: () => void;

beforeAll(async () => {
  const client = await import("@/lib/db/client");
  const seed = await import("@/lib/db/seed");
  const handle = client.getHandle({ autoSeed: false });
  seed.seedDatabase(handle.sqlite, handle.db, { quiet: true, day: 143, profile: "transit", seed: seed.DEFAULT_SEED });
  close = () => handle.sqlite.close();
  q = await import("@/lib/server/queries");
  e = await import("@/lib/engine");
});

afterAll(() => {
  close?.();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
});

describe("demo storyline, Day 143", () => {
  it("step 1: three crew green, Haddad red", () => {
    const crew = q.getCrewAnalyses();
    const status = Object.fromEntries(crew.map((c) => [c.astronaut.shortName, c.analysis.status]));
    expect(status).toEqual({ Haddad: "red", Sato: "green", Oliveira: "green", Okafor: "green" });
    const haddad = crew[0].analysis;
    expect(haddad.metrics.sleep_hours.status).toBe("red");
    expect(haddad.metrics.mood.status).toBe("red");
    expect(["amber", "red"]).toContain(haddad.metrics.hrv.status);
    expect(haddad.regions.head.status).toBe("red");
    expect(["amber", "red"]).toContain(haddad.regions.heart.status);
    expect(haddad.score.score).toBeLessThan(60);
    expect(haddad.anomaly.isAnomaly).toBe(true);
  });

  it("step 2: smallest path back to green is 7 h for 2 nights + 1 h crew time, green by Day 146", () => {
    const mission = q.getMission();
    const haddad = q.getCrewAnalyses()[0];
    const { thresholds, regionWeights } = { thresholds: mission.profile.thresholds, regionWeights: mission.profile.region_weights };
    const state = e.buildSimState(haddad.analysis.metrics, haddad.series, 143);
    const found = e.findPathToGreen(state, 143, thresholds, regionWeights);
    expect(found.summary).toBe("sleep 7 h for 2 nights + 1 h shared crew time");
    expect(found.result?.greenDay).toBe(146);
    expect(e.greenDayFor(found.doNothing, found.unaddressable)).toBeNull();
  });

  it("step 3: Day 145 spacewalk is no-go for Haddad; suggested swap is Sato (green, trained)", () => {
    const mission = q.getMission();
    const tasks = q.getUpcomingTasks(mission, q.getCrewAnalyses(mission));
    const eva = tasks.find((t) => t.task.kind === "EVA" && t.task.missionDay === 145)!;
    expect(eva.go).toBe(false);
    expect(eva.crew.find((c) => c.name === "Haddad")!.go).toBe(false);
    expect(eva.swaps).toHaveLength(1);
    expect(eva.swaps[0].outName).toBe("Haddad");
    expect(eva.swaps[0].inName).toBe("Sato");
  });

  it("step 4: the sleep slider moves the projected recovery day", () => {
    const mission = q.getMission();
    const haddad = q.getCrewAnalyses()[0];
    const state = e.buildSimState(haddad.analysis.metrics, haddad.series, 143);
    const t = mission.profile.thresholds;
    const w = mission.profile.region_weights;
    const found = e.findPathToGreen(state, 143, t, w);
    const dayFor = (sleepHours: number) => e.greenDayFor(e.simulatePlan(state, { ...found.plan!, sleepHours }, 143, t, w), found.unaddressable);
    expect(dayFor(7)).toBe(146);
    expect(dayFor(6)!).toBeGreaterThan(146);
    expect(dayFor(5)!).toBeGreaterThan(dayFor(6)!);
  });

  it("step 5: the standing order fires after two short nights, labelled with the surgeon", () => {
    const alerts = q.getAlerts(143, 1);
    const order = alerts.find((a) => a.rule.startsWith("standing_order"));
    expect(order).toBeDefined();
    expect(order!.authorisedBy).toMatch(/Dr\./);
    expect(order!.title).toContain(order!.authorisedBy!);
    // It did not fire before the second short night.
    expect(q.getAlerts(139, 1).some((a) => a.rule.startsWith("standing_order"))).toBe(false);
    expect(alerts.some((a) => a.rule === "fatigue_error_risk")).toBe(true);
  });

  it("step 6: a real SEP is replayed on Day 120 and shows in the dose data with its source", () => {
    const dose = q.getDose(1, 143);
    const d120 = dose.find((d) => d.missionDay === 120)!;
    const typical = dose.filter((d) => d.missionDay >= 100 && d.missionDay < 118).map((d) => d.totalMSv);
    const mean = typical.reduce((a, b) => a + b, 0) / typical.length;
    expect(mean).toBeGreaterThan(1.8 * 0.85);
    expect(mean).toBeLessThan(1.8 * 1.15);
    expect(d120.source).toBe("real_replay");
    expect(d120.totalMSv).toBeGreaterThan(2 * mean);
    const storm = q.getTimeline().find((t) => t.kind === "solar_particle_event" && t.missionDay === 120)!;
    expect(storm.sourceUrl).toMatch(/ccmc\.gsfc\.nasa\.gov\/DONKI/);
    const alert = q.getAlerts(120, 1).find((a) => a.rule === "radiation_exposure")!;
    expect(alert.severity).toBe("red");
    expect(alert.sourceIds).toContain("nasa-donki");
    expect(q.getSpaceWeatherEvents().some((x) => x.kind === "SEP" && x.missionDay === 120)).toBe(true);
  });

  it("neutron channel is about 30 % of the modelled dose", () => {
    const quiet = q.getDose(2, 100).filter((d) => d.source === "model");
    const share = quiet.reduce((a, d) => a + d.neutronMSv, 0) / quiet.reduce((a, d) => a + d.totalMSv, 0);
    expect(share).toBeGreaterThan(0.27);
    expect(share).toBeLessThan(0.33);
  });

  it("earlier scripted episodes raise their early warnings", () => {
    const rulesOn = (day: number, astronaut: number) => q.getAlerts(day, astronaut).map((a) => a.rule);
    expect(rulesOn(63, 3)).toContain("infection_onset");
    expect(rulesOn(96, 4)).toContain("dehydration");
    expect(rulesOn(110, 4)).toContain("bone_muscle_trajectory");
    expect(rulesOn(81, 1)).toContain("cabin_air");
    expect(rulesOn(34, 2)).toContain("sleep_schedule_drift");
  });

  it("the private journal is not part of any shared or agent-facing query", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "server", "agent-tools.ts"), "utf8");
    expect(src).not.toMatch(/journal/i);
    const houston = fs.readFileSync(path.join(process.cwd(), "lib", "server", "houston.ts"), "utf8");
    expect(houston).not.toMatch(/journalEntries|getJournal/);
  });
});

describe("step 8: profile toggle", () => {
  it("Transit → Mars surface changes dose rate, kit, thresholds, delay and a triage step", async () => {
    const { PROFILES } = await import("@/lib/profiles");
    const { writeDose, loadReplay } = await import("@/lib/db/seed");
    const { getDb } = await import("@/lib/db/client");
    const { visibleNodes } = await import("@/lib/triage");
    writeDose(getDb(), "mars", 2026, loadReplay());
    const mars = q.getDose(1, 110).filter((d) => d.source === "model").map((d) => d.totalMSv);
    const mean = mars.reduce((a, b) => a + b, 0) / mars.length;
    expect(mean).toBeGreaterThan(0.67 * 0.85);
    expect(mean).toBeLessThan(0.67 * 1.15);
    writeDose(getDb(), "transit", 2026, loadReplay());

    expect(PROFILES.mars.comms.demo_one_way_s).toBe(PROFILES.transit.comms.demo_one_way_s);
    expect(PROFILES.lunar.comms.demo_one_way_s).toBeLessThan(PROFILES.transit.comms.demo_one_way_s);
    const transit = visibleNodes("chest_pain", PROFILES.transit);
    const marsNodes = visibleNodes("chest_pain", PROFILES.mars);
    expect(transit).not.toContain("ecg");
    expect(marsNodes).toContain("ecg");
    expect(marsNodes).toContain("recent_eva");
    expect(transit).not.toContain("recent_eva");
  });
});
