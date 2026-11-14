/**
 * More real datasets for `npm run fetch-data`:
 *  - NASA/JPL Horizons: Earth–Mars and Earth–Moon one-way light time
 *  - NOAA SWPC: planetary K index (geomagnetic activity)
 *  - NASA POWER: daily surface temperature and humidity for the Earth-mode clinic site
 * Same rule as the rest: on failure keep the previous snapshot and warn.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "snapshots");
const SOURCES = path.join(ROOT, "content", "sources.json");

const warn = (msg: string) => console.warn(`[fetch-data] WARNING: ${msg}`);
const info = (msg: string) => console.log(`[fetch-data] ${msg}`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function get(url: string, timeoutMs = 120_000): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "hygieia-demo-fetch/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function write(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + "\n");
  info(`wrote data/snapshots/${name}`);
}

function markFetched(ids: string[], when: string) {
  try {
    const json = JSON.parse(fs.readFileSync(SOURCES, "utf8")) as { sources: { id: string; fetched_at: string | null }[] };
    for (const s of json.sources) if (ids.includes(s.id)) s.fetched_at = when;
    fs.writeFileSync(SOURCES, JSON.stringify(json, null, 2) + "\n");
  } catch (err) {
    warn(`could not update content/sources.json: ${String(err)}`);
  }
}

// --- NASA/JPL Horizons: one-way light time ---------------------------------------------

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** Range (au) and one-way light time (minutes) of a body seen from Earth's centre. */
async function horizons(body: string, start: string, stop: string, step: string): Promise<{ date: string; au: number; minutes: number }[]> {
  const q = (v: string) => encodeURIComponent(`'${v}'`);
  const url =
    `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=${q(body)}&OBJ_DATA=${q("NO")}&MAKE_EPHEM=${q("YES")}` +
    `&EPHEM_TYPE=${q("OBSERVER")}&CENTER=${q("500@399")}&START_TIME=${q(start)}&STOP_TIME=${q(stop)}&STEP_SIZE=${q(step)}` +
    `&QUANTITIES=${q("20,21")}&CSV_FORMAT=${q("YES")}`;
  const text = await (await get(url)).text();
  const a = text.indexOf("$$SOE");
  const b = text.indexOf("$$EOE");
  if (a < 0 || b < 0) throw new Error("unexpected Horizons response");
  const rows: { date: string; au: number; minutes: number }[] = [];
  for (const line of text.slice(a + 5, b).split("\n")) {
    const cols = line.split(",").map((c) => c.trim());
    const m = cols[0]?.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})/);
    if (!m) continue;
    const au = Number(cols[3]);
    const minutes = Number(cols[5]);
    if (Number.isFinite(au) && Number.isFinite(minutes)) rows.push({ date: `${m[1]}-${MONTHS[m[2]]}-${m[3]}`, au: Number(au.toFixed(5)), minutes: Number(minutes.toFixed(3)) });
  }
  if (rows.length === 0) throw new Error("no rows parsed from Horizons");
  return rows;
}

export async function fetchLightTime(): Promise<void> {
  // Mission epoch is 2035-06-01 (lib/db/seed.ts). Cover Day 1 through a full Earth–Mars cycle after it.
  const mars = await horizons("499", "2035-06-01", "2037-12-01", "5d");
  const moon = await horizons("301", "2035-06-01", "2035-07-01", "1d");
  const mm = mars.map((r) => r.minutes);
  const ms = moon.map((r) => r.minutes * 60);
  const fetched_at = new Date().toISOString();
  write("light_time.json", {
    fetched_at,
    source_url: "https://ssd.jpl.nasa.gov/horizons/",
    credit: "NASA/JPL Horizons",
    license: "NASA/JPL Solar System Dynamics; public ephemeris service.",
    note: "Geocentric range and one-way light time. Mars every 5 days over one Earth–Mars cycle from the fictional mission start; Moon daily for one month.",
    mars: { min_minutes: Math.min(...mm), max_minutes: Math.max(...mm), series: mars },
    moon: { mean_seconds: Number((ms.reduce((x, y) => x + y, 0) / ms.length).toFixed(3)), min_seconds: Number(Math.min(...ms).toFixed(3)), max_seconds: Number(Math.max(...ms).toFixed(3)) },
  });
  markFetched(["jpl-horizons"], fetched_at);
}

// --- NOAA SWPC planetary K index --------------------------------------------------------

export async function fetchKp(): Promise<void> {
  const url = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
  const raw = (await (await get(url)).json()) as unknown[];
  const series = raw
    .map((r) => {
      if (Array.isArray(r)) return { time: String(r[0]), kp: Number(r[1]) };
      const o = r as { time_tag?: string; Kp?: number | string };
      return { time: String(o.time_tag), kp: Number(o.Kp) };
    })
    .filter((p) => Number.isFinite(p.kp))
    .map((p) => ({ time: p.time.replace(" ", "T").slice(0, 19) + "Z", kp: p.kp }));
  if (series.length === 0) throw new Error("no Kp rows");
  const fetched_at = new Date().toISOString();
  write("kp_index.json", {
    fetched_at,
    source_url: url,
    credit: "NOAA SWPC",
    license: "U.S. public domain (NOAA Space Weather Prediction Center).",
    note: "Planetary K index, 3-hourly. NOAA G-scale: G1 at Kp 5, G2 at 6, G3 at 7, G4 at 8, G5 at 9.",
    series,
  });
  markFetched(["noaa-swpc-kp"], fetched_at);
}

// --- NASA POWER: surface weather for the Earth-mode clinic site --------------------------

/** Demo site for Earth mode: a remote community in the Brazilian Amazon. */
export const CLINIC_SITE = { name: "São Gabriel da Cachoeira, Amazonas, Brazil", latitude: -0.13, longitude: -67.09 };

export async function fetchPower(): Promise<void> {
  // POWER lags real time by a few days, so ask for a window that ends a week ago.
  const end = new Date(Date.now() - 7 * 86400e3);
  const start = new Date(end.getTime() - 44 * 86400e3);
  const compact = (d: Date) => ymd(d).replace(/-/g, "");
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M,RH2M&community=SB` +
    `&longitude=${CLINIC_SITE.longitude}&latitude=${CLINIC_SITE.latitude}&start=${compact(start)}&end=${compact(end)}&format=JSON`;
  const json = (await (await get(url)).json()) as { properties: { parameter: Record<string, Record<string, number>> } };
  const p = json.properties.parameter;
  const days = Object.keys(p.T2M_MAX ?? {}).sort();
  const series = days
    .map((d) => ({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, t_max_c: p.T2M_MAX[d], t_mean_c: p.T2M?.[d], rh_pct: p.RH2M?.[d] }))
    .filter((r) => r.t_max_c > -900 && (r.rh_pct ?? -999) > -900);
  if (series.length === 0) throw new Error("no POWER rows");
  const fetched_at = new Date().toISOString();
  write("power_heat.json", {
    fetched_at,
    source_url: "https://power.larc.nasa.gov/",
    credit: "NASA POWER (NASA Langley Research Center)",
    license: "NASA open data; credit the NASA Langley Research Center POWER Project.",
    site: CLINIC_SITE,
    note: "Daily maximum and mean 2 m air temperature (°C) and mean 2 m relative humidity (%).",
    series,
  });
  markFetched(["nasa-power"], fetched_at);
}
