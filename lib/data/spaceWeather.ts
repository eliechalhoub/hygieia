import fs from "node:fs";
import path from "node:path";

// Adapters for the committed space-weather snapshots (data/snapshots/).
// The app never calls NASA or NOAA at runtime: `npm run fetch-data` refreshes
// the snapshots, and everything below reads only those files.

export type SwKind = "SEP" | "FLR" | "CME" | "GST";

export interface SwEvent {
  id: string;
  kind: SwKind;
  /** ISO time of the event (UTC). */
  time: string;
  classType?: string | null;
  instruments?: string[];
  note?: string | null;
  link: string;
  linked?: string[];
}

export interface DonkiSnapshot {
  fetched_at: string | null;
  source_url: string;
  credit: string;
  license: string;
  window: { start: string; end: string } | null;
  endpoint_used: string | null;
  events: SwEvent[];
}

export interface ProtonPoint {
  time: string;
  /** ≥10 MeV integral proton flux, pfu. */
  flux: number;
}

export interface GoesSnapshot {
  fetched_at: string | null;
  source_url: string;
  credit: string;
  license: string;
  satellite: number | null;
  energy: string;
  series: ProtonPoint[];
}

export const SNAPSHOT_DIR = path.join(process.cwd(), "data", "snapshots");

export function readSnapshot<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, name), "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadDonki(): DonkiSnapshot | null {
  return readSnapshot<DonkiSnapshot>("donki.json");
}

export function loadGoesProtons(): GoesSnapshot | null {
  return readSnapshot<GoesSnapshot>("goes_protons.json");
}

/** NOAA S-scale thresholds for ≥10 MeV integral proton flux, in pfu. */
export const S_SCALE = [
  { level: 1, pfu: 10, word: "Minor" },
  { level: 2, pfu: 100, word: "Moderate" },
  { level: 3, pfu: 1000, word: "Strong" },
  { level: 4, pfu: 10000, word: "Severe" },
  { level: 5, pfu: 100000, word: "Extreme" },
];

/** 0 means below the S1 storm threshold. */
export function sLevelFromFlux(pfu: number): number {
  let level = 0;
  for (const s of S_SCALE) if (pfu >= s.pfu) level = s.level;
  return level;
}

export function currentSLevel(goes: GoesSnapshot | null): { level: number; latest: ProtonPoint | null; peak: ProtonPoint | null } {
  if (!goes || goes.series.length === 0) return { level: 0, latest: null, peak: null };
  const latest = goes.series[goes.series.length - 1];
  let peak = goes.series[0];
  for (const p of goes.series) if (p.flux > peak.flux) peak = p;
  return { level: sLevelFromFlux(latest.flux), latest, peak };
}

/** A SEP record measured near Earth by GOES at ≥10 MeV: an S1-or-higher storm. */
export function isGoesStorm(e: SwEvent): boolean {
  return e.kind === "SEP" && (e.instruments ?? []).some((i) => /GOES/i.test(i) && />\s*10\s*MeV/i.test(i));
}

export function hasHardSpectrum(events: SwEvent[], around: SwEvent): boolean {
  const t = Date.parse(around.time);
  return events.some(
    (e) => e.kind === "SEP" && Math.abs(Date.parse(e.time) - t) < 12 * 3600e3 && (e.instruments ?? []).some((i) => /GOES/i.test(i) && />\s*100\s*MeV/i.test(i)),
  );
}

/** The real event replayed on the anchor day: the latest GOES ≥10 MeV SEP. */
export function pickAnchorSep(events: SwEvent[]): SwEvent | null {
  const storms = events.filter(isGoesStorm).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return storms.length ? storms[storms.length - 1] : null;
}

export interface ReplayedEvent extends SwEvent {
  /** Mission day the real event is replayed on, or null if outside the mission. */
  missionDay: number | null;
  sLevel: number | null;
  /** True for SEP records that drive an onboard alert and a dose spike. */
  crewRelevant: boolean;
  hardSpectrum: boolean;
}

export const REPLAY_ANCHOR_DAY = 120;

/**
 * Replay mode: real dates are mapped onto the synthetic mission clock so that
 * the anchor event lands on `anchorDay`. Every other real event keeps its real
 * offset in days from the anchor ("event on real date X is replayed on Day Y").
 */
export function replayOntoMission(
  events: SwEvent[],
  anchor: SwEvent | null,
  maxDay: number,
  anchorDay: number = REPLAY_ANCHOR_DAY,
): ReplayedEvent[] {
  const anchorMidnight = anchor ? Date.parse(anchor.time.slice(0, 10) + "T00:00:00Z") : null;
  return events.map((e) => {
    let missionDay: number | null = null;
    if (anchorMidnight !== null) {
      const d = anchorDay + Math.floor((Date.parse(e.time) - anchorMidnight) / 86400e3);
      if (d >= 1 && d <= maxDay) missionDay = d;
    }
    const storm = isGoesStorm(e);
    return {
      ...e,
      missionDay,
      sLevel: storm ? 1 : null,
      crewRelevant: storm && missionDay !== null,
      hardSpectrum: storm ? hasHardSpectrum(events, e) : false,
    };
  });
}

/** Demo values: extra dose (mSv) on the event day and the day after. */
export const SEP_DOSE_DEMO = {
  demoValue: true,
  standard: [2.0, 0.7],
  hardSpectrum: [4.0, 1.4],
};

export function sepDoseIncrement(e: ReplayedEvent, day: number): number {
  if (!e.crewRelevant || e.missionDay === null) return 0;
  const table = e.hardSpectrum ? SEP_DOSE_DEMO.hardSpectrum : SEP_DOSE_DEMO.standard;
  const offset = day - e.missionDay;
  return offset >= 0 && offset < table.length ? table[offset] : 0;
}
