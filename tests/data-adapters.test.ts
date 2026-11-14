import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPLAY_ANCHOR_DAY, currentSLevel, isGoesStorm, loadDonki, loadGoesProtons, pickAnchorSep, replayOntoMission, sLevelFromFlux,
  sepDoseIncrement, type SwEvent,
} from "@/lib/data/spaceWeather";
import { PROFILES, PROFILE_ORDER, engineConfigFor, plannedDose } from "@/lib/profiles";

const ev = (id: string, time: string, instruments: string[], kind: SwEvent["kind"] = "SEP"): SwEvent => ({ id, kind, time, instruments, link: `https://example.test/${id}` });

describe("NOAA S-scale", () => {
  it("maps ≥10 MeV proton flux to S-levels", () => {
    expect(sLevelFromFlux(0.4)).toBe(0);
    expect(sLevelFromFlux(10)).toBe(1);
    expect(sLevelFromFlux(99)).toBe(1);
    expect(sLevelFromFlux(100)).toBe(2);
    expect(sLevelFromFlux(1000)).toBe(3);
    expect(sLevelFromFlux(10000)).toBe(4);
    expect(sLevelFromFlux(250000)).toBe(5);
  });

  it("reads the current level from a GOES snapshot", () => {
    const res = currentSLevel({ fetched_at: null, source_url: "", credit: "", license: "", satellite: 18, energy: "", series: [{ time: "a", flux: 0.3 }, { time: "b", flux: 150 }, { time: "c", flux: 12 }] });
    expect(res.level).toBe(1);
    expect(res.peak?.flux).toBe(150);
  });
});

describe("space-weather replay", () => {
  const events = [
    ev("flare", "2026-09-05T15:04:00.000Z", ["GOES-P: EXIS 1.0-8.0"], "FLR"),
    ev("hard", "2026-09-05T15:45:00.000Z", ["GOES-P: SEISS >100 MeV"]),
    ev("storm", "2026-09-05T16:15:00.000Z", ["GOES-P: SEISS >10 MeV"]),
    ev("stereo", "2026-08-22T22:28:00.000Z", ["STEREO A: IMPACT 13-100 MeV"]),
    ev("old-storm", "2026-07-30T18:45:00.000Z", ["GOES-P: SEISS >10 MeV"]),
    ev("ancient", "2025-11-14T09:20:00.000Z", ["GOES-P: SEISS >10 MeV"]),
  ];

  it("recognises GOES ≥10 MeV events as crew-relevant storms", () => {
    expect(isGoesStorm(events[2])).toBe(true);
    expect(isGoesStorm(events[1])).toBe(false); // >100 MeV channel alone is not the S-scale channel
    expect(isGoesStorm(events[3])).toBe(false);
    expect(isGoesStorm(events[0])).toBe(false);
  });

  it("anchors the latest storm on Day 120 and keeps real day offsets", () => {
    const anchor = pickAnchorSep(events)!;
    expect(anchor.id).toBe("storm");
    const replay = replayOntoMission(events, anchor, 150);
    const by = Object.fromEntries(replay.map((e) => [e.id, e]));
    expect(by.storm.missionDay).toBe(REPLAY_ANCHOR_DAY);
    expect(by.flare.missionDay).toBe(120);
    expect(by["old-storm"].missionDay).toBe(120 - 37);
    expect(by.stereo.missionDay).toBe(120 - 14);
    expect(by.stereo.crewRelevant).toBe(false);
    expect(by.ancient.missionDay).toBeNull(); // before the mission started
    expect(by.storm.hardSpectrum).toBe(true);
    expect(sepDoseIncrement(by.storm, 120)).toBeGreaterThan(sepDoseIncrement(by.storm, 121));
    expect(sepDoseIncrement(by.storm, 122)).toBe(0);
    expect(sepDoseIncrement(by.stereo, by.stereo.missionDay!)).toBe(0);
  });
});

describe("committed snapshots", () => {
  it("every snapshot carries fetched_at, source_url and a credit/license", () => {
    const dir = path.join(process.cwd(), "data", "snapshots");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      expect(json.fetched_at, f).toBeTruthy();
      expect(json.source_url, f).toMatch(/^https:\/\//);
      expect(json.credit, f).toBeTruthy();
      expect(json.license, f).toBeTruthy();
    }
  });

  it("the DONKI snapshot contains a real GOES-measured SEP to replay", () => {
    const donki = loadDonki()!;
    expect(donki.credit).toBe("NASA/CCMC DONKI");
    const anchor = pickAnchorSep(donki.events);
    expect(anchor).not.toBeNull();
    expect(anchor!.link).toMatch(/^https:\/\/.*DONKI/);
  });

  it("the GOES snapshot is the ≥10 MeV integral proton channel", () => {
    const goes = loadGoesProtons()!;
    expect(goes.credit).toBe("NOAA SWPC");
    expect(goes.series.length).toBeGreaterThan(24);
    expect(goes.series.every((p) => typeof p.flux === "number" && p.flux >= 0)).toBe(true);
  });
});

describe("sources and profiles", () => {
  const sources = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "sources.json"), "utf8")).sources as { id: string; value: number | null; url: string; used_for: string; credit: string; kind: string }[];
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]));

  it("every source has the schema fields", () => {
    for (const s of sources) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.url.length).toBeGreaterThan(3);
      expect(s.used_for.length).toBeGreaterThan(10);
      expect(s.credit.length).toBeGreaterThan(2);
      expect(["paper", "api", "page", "dataset"]).toContain(s.kind);
    }
    expect(new Set(sources.map((s) => s.id)).size).toBe(sources.length);
  });

  it("each profile's dose rate is the value of its source", () => {
    expect(PROFILE_ORDER).toEqual(["transit", "station", "lunar", "mars", "clinic"]);
    for (const id of PROFILE_ORDER) {
      const p = PROFILES[id];
      expect(byId[p.dose.source_id], id).toBeDefined();
      expect(p.dose.mSv_per_day).toBe(byId[p.dose.source_id].value);
      expect(byId[p.comms.source_id], `${id} comms`).toBeDefined();
      expect(byId[p.exercise.source_id], `${id} exercise`).toBeDefined();
    }
    expect(PROFILES.transit.dose.mSv_per_day).toBe(1.8);
    expect(PROFILES.mars.dose.mSv_per_day).toBe(0.67);
    expect(PROFILES.lunar.dose.mSv_per_day).toBe(1.369);
  });

  it("profiles differ in kit, thresholds, delay and weights", () => {
    expect(PROFILES.transit.kit).not.toContain("ecg");
    expect(PROFILES.mars.kit).toContain("ecg");
    expect(PROFILES.station.comms.demo_one_way_s).toBeLessThan(PROFILES.transit.comms.demo_one_way_s);
    expect(engineConfigFor(PROFILES.mars).thresholds.hard.spo2?.redBelow).not.toBe(engineConfigFor(PROFILES.transit).thresholds.hard.spo2?.redBelow);
    for (const id of PROFILE_ORDER) {
      const w = PROFILES[id].region_weights;
      expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    }
  });

  it("most planned dose is received in transit", () => {
    const plan = plannedDose();
    expect(plan.transitShare).toBeGreaterThan(0.5);
    expect(plan.total).toBeCloseTo(360 * 1.8 + 500 * 0.67, 5);
  });
});

describe("environment adapters", () => {
  it("computes the NWS heat index and its categories", async () => {
    const { heatIndexC, heatCategory } = await import("@/lib/data/environment");
    // NWS chart: 90 °F at 70 % humidity is about 105–106 °F.
    const hiF = (heatIndexC((90 - 32) * 5 / 9, 70) * 9) / 5 + 32;
    expect(hiF).toBeGreaterThan(104);
    expect(hiF).toBeLessThan(107);
    expect(heatCategory(heatIndexC(20, 50)).level).toBe(0);
    expect(heatCategory((85 - 32) * 5 / 9).word).toBe("Caution");
    expect(heatCategory((95 - 32) * 5 / 9).word).toBe("Extreme caution");
    expect(heatCategory((110 - 32) * 5 / 9).word).toBe("Danger");
    expect(heatCategory((130 - 32) * 5 / 9).word).toBe("Extreme danger");
  });

  it("maps Kp to the NOAA G-scale", async () => {
    const { gLevelFromKp } = await import("@/lib/data/environment");
    expect([4.67, 5, 6.33, 7, 8, 9].map(gLevelFromKp)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("the JPL Horizons snapshot confirms the 22-minute worst case and interpolates by date", async () => {
    const { loadLightTime, marsLightMinutes, missionDate } = await import("@/lib/data/environment");
    const snap = loadLightTime()!;
    expect(snap.credit).toBe("NASA/JPL Horizons");
    expect(Math.floor(snap.mars.max_minutes)).toBe(22);
    expect(snap.mars.min_minutes).toBeGreaterThan(3);
    expect(snap.moon.mean_seconds).toBeGreaterThan(1.2);
    expect(snap.moon.mean_seconds).toBeLessThan(1.4);
    expect(missionDate(1)).toBe("2035-06-01");
    const a = snap.mars.series[3];
    const b = snap.mars.series[4];
    const mid = new Date((Date.parse(a.date) + Date.parse(b.date)) / 2).toISOString().slice(0, 10);
    const got = marsLightMinutes(snap, mid)!.minutes;
    expect(got).toBeGreaterThanOrEqual(Math.min(a.minutes, b.minutes) - 1e-9);
    expect(got).toBeLessThanOrEqual(Math.max(a.minutes, b.minutes) + 1e-9);
    expect(marsLightMinutes(snap, a.date)!.minutes).toBeCloseTo(a.minutes, 6);
  });

  it("the Remote clinic profile uses background dose and standard CPR", () => {
    expect(PROFILES.clinic.earth).toBe(true);
    expect(PROFILES.clinic.dose.mSv_per_day).toBeCloseTo(2.4 / 365, 3);
    expect(PROFILES.clinic.cpr_method).toBe("standard");
    expect(PROFILES.clinic.kit).toContain("oral_rehydration");
  });
});
