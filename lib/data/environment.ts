import { readSnapshot } from "./spaceWeather";

// Adapters for the environment snapshots: JPL Horizons light time, NOAA
// planetary K index, and NASA POWER surface weather. Snapshots only.

/** Fictional mission start (UTC). Mission Day 1 begins here. */
export const MISSION_EPOCH_MS = Date.UTC(2035, 5, 1);

export function missionDate(day: number): string {
  return new Date(MISSION_EPOCH_MS + (day - 1) * 86400e3).toISOString().slice(0, 10);
}

// --- Light time -------------------------------------------------------------------------

export interface LightTimeSnapshot {
  fetched_at: string | null;
  source_url: string;
  credit: string;
  license: string;
  mars: { min_minutes: number; max_minutes: number; series: { date: string; au: number; minutes: number }[] };
  moon: { mean_seconds: number; min_seconds: number; max_seconds: number };
}

export function loadLightTime(): LightTimeSnapshot | null {
  return readSnapshot<LightTimeSnapshot>("light_time.json");
}

/** Real Earth–Mars one-way light time on a calendar date, linearly interpolated between ephemeris points. */
export function marsLightMinutes(snapshot: LightTimeSnapshot | null, dateIso: string): { minutes: number; au: number } | null {
  const series = snapshot?.mars.series ?? [];
  if (series.length === 0) return null;
  const t = Date.parse(dateIso + "T00:00:00Z");
  const times = series.map((p) => Date.parse(p.date + "T00:00:00Z"));
  if (t <= times[0]) return { minutes: series[0].minutes, au: series[0].au };
  const last = series.length - 1;
  if (t >= times[last]) return { minutes: series[last].minutes, au: series[last].au };
  let i = 1;
  while (times[i] < t) i++;
  const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return {
    minutes: series[i - 1].minutes + f * (series[i].minutes - series[i - 1].minutes),
    au: series[i - 1].au + f * (series[i].au - series[i - 1].au),
  };
}

// --- Geomagnetic activity -----------------------------------------------------------------

export interface KpSnapshot {
  fetched_at: string | null;
  source_url: string;
  credit: string;
  license: string;
  series: { time: string; kp: number }[];
}

export function loadKp(): KpSnapshot | null {
  return readSnapshot<KpSnapshot>("kp_index.json");
}

/** NOAA G-scale from the planetary K index: G1 at Kp 5 … G5 at Kp 9. 0 = below storm level. */
export function gLevelFromKp(kp: number): number {
  if (kp >= 9) return 5;
  if (kp >= 8) return 4;
  if (kp >= 7) return 3;
  if (kp >= 6) return 2;
  if (kp >= 5) return 1;
  return 0;
}

// --- Outdoor heat (Earth mode) ---------------------------------------------------------------

export interface PowerSnapshot {
  fetched_at: string | null;
  source_url: string;
  credit: string;
  license: string;
  site: { name: string; latitude: number; longitude: number };
  series: { date: string; t_max_c: number; t_mean_c?: number; rh_pct: number }[];
}

export function loadPower(): PowerSnapshot | null {
  return readSnapshot<PowerSnapshot>("power_heat.json");
}

/**
 * Heat index (apparent temperature) from air temperature and relative
 * humidity, using the U.S. National Weather Service procedure: the simple
 * Steadman form first, then the Rothfusz regression with its two adjustments
 * when the result is 80 °F or more. Returns °C.
 */
export function heatIndexC(tempC: number, rhPct: number): number {
  const T = (tempC * 9) / 5 + 32;
  const R = rhPct;
  let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + R * 0.094);
  if ((hi + T) / 2 >= 80) {
    hi =
      -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 6.83783e-3 * T * T - 5.481717e-2 * R * R +
      1.22874e-3 * T * T * R + 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
    if (R < 13 && T >= 80 && T <= 112) hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    else if (R > 85 && T >= 80 && T <= 87) hi += ((R - 85) / 10) * ((87 - T) / 5);
  }
  return ((hi - 32) * 5) / 9;
}

export interface HeatCategory {
  level: 0 | 1 | 2 | 3 | 4;
  word: string;
  status: "green" | "amber" | "red";
}

/** NWS heat-index categories (thresholds in °F: 80, 90, 103, 125). */
export function heatCategory(heatIndexCelsius: number): HeatCategory {
  const f = (heatIndexCelsius * 9) / 5 + 32;
  if (f >= 125) return { level: 4, word: "Extreme danger", status: "red" };
  if (f >= 103) return { level: 3, word: "Danger", status: "red" };
  if (f >= 90) return { level: 2, word: "Extreme caution", status: "amber" };
  if (f >= 80) return { level: 1, word: "Caution", status: "amber" };
  return { level: 0, word: "No heat alert", status: "green" };
}
