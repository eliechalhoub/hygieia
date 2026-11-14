/**
 * npm run fetch-data
 *
 * Fetches real public space-agency data into data/snapshots/*.json. The app
 * itself never goes online: it only reads these committed snapshots.
 *
 * If a fetch fails, the previous snapshot is kept and a warning is logged.
 * This script never exits with an error, so it can never fail a build.
 */
import fs from "node:fs";
import path from "node:path";
import { fetchKp, fetchLightTime, fetchPower } from "./fetch-extra";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "snapshots");
const SOURCES = path.join(ROOT, "content", "sources.json");
const NASA_API_KEY = process.env.NASA_API_KEY ?? "";
const DAYS_BACK = 365;
const WINDOW_DAYS = 60; // DONKI rejects ranges longer than 60 days.

fs.mkdirSync(OUT, { recursive: true });

const warn = (msg: string) => console.warn(`[fetch-data] WARNING: ${msg}`);
const info = (msg: string) => console.log(`[fetch-data] ${msg}`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function getJson<T>(url: string, timeoutMs = 90_000, tries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", "user-agent": "hygieia-demo-fetch/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function writeSnapshot(name: string, data: unknown): void {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + "\n");
  info(`wrote data/snapshots/${name}`);
}

function markFetched(ids: string[], when: string): void {
  try {
    const json = JSON.parse(fs.readFileSync(SOURCES, "utf8")) as { sources: { id: string; fetched_at: string | null }[] };
    for (const s of json.sources) if (ids.includes(s.id)) s.fetched_at = when;
    fs.writeFileSync(SOURCES, JSON.stringify(json, null, 2) + "\n");
  } catch (err) {
    warn(`could not update content/sources.json: ${String(err)}`);
  }
}

// --- NASA DONKI -------------------------------------------------------------------

type Kind = "SEP" | "FLR" | "GST";

/** Endpoints are tried in this order (the API moved in late 2026). */
function donkiUrls(kind: Kind, start: string, end: string): { label: string; url: string }[] {
  const q = `startDate=${start}&endDate=${end}`;
  const urls = [{ label: "ccmc.gsfc.nasa.gov/DONKI-API", url: `https://ccmc.gsfc.nasa.gov/DONKI-API/get/${kind}?${q}` }];
  if (NASA_API_KEY) urls.push({ label: "api.nasa.gov/DONKI", url: `https://api.nasa.gov/DONKI/${kind}?${q}&api_key=${NASA_API_KEY}` });
  urls.push({ label: "kauai.ccmc.gsfc.nasa.gov/DONKI/WS", url: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/${kind}?${q}` });
  return urls;
}

interface RawDonki {
  sepID?: string; flrID?: string; gstID?: string;
  eventTime?: string; beginTime?: string; peakTime?: string; startTime?: string;
  classType?: string; sourceLocation?: string; activeRegionNum?: number | null;
  instruments?: { displayName: string }[] | null;
  linkedEvents?: { activityID: string }[] | null;
  allKpIndex?: { kpIndex: number }[] | null;
  link?: string;
}

async function fetchDonkiKind(kind: Kind, used: Set<string>): Promise<RawDonki[]> {
  const out: RawDonki[] = [];
  const end = new Date();
  const first = new Date(end.getTime() - DAYS_BACK * 86400e3);
  for (let t = first.getTime(); t < end.getTime(); t += WINDOW_DAYS * 86400e3) {
    const a = ymd(new Date(t));
    const b = ymd(new Date(Math.min(end.getTime(), t + (WINDOW_DAYS - 1) * 86400e3)));
    let ok = false;
    for (const { label, url } of donkiUrls(kind, a, b)) {
      try {
        const rows = await getJson<RawDonki[]>(url, 60_000, 1);
        out.push(...(Array.isArray(rows) ? rows : []));
        used.add(label);
        ok = true;
        break;
      } catch (err) {
        warn(`DONKI ${kind} ${a}..${b} via ${label} failed (${String(err)})`);
      }
    }
    if (!ok) throw new Error(`all DONKI endpoints failed for ${kind} ${a}..${b}`);
  }
  return out;
}

async function fetchDonki(): Promise<void> {
  const used = new Set<string>();
  const [sep, flr, gst] = [await fetchDonkiKind("SEP", used), await fetchDonkiKind("FLR", used), await fetchDonkiKind("GST", used)];
  const iso = (t?: string) => (t ? new Date(t.replace(/Z$/, ":00Z").replace(/:00:00Z$/, ":00Z")).toISOString() : "");
  const fix = (t?: string) => {
    if (!t) return "";
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? iso(t) : d.toISOString();
  };
  const events = [
    ...sep.map((e) => ({
      id: e.sepID!, kind: "SEP", time: fix(e.eventTime), classType: null,
      instruments: (e.instruments ?? []).map((i) => i.displayName), link: e.link ?? "",
      linked: (e.linkedEvents ?? []).map((l) => l.activityID),
    })),
    // Keep M- and X-class flares; thousands of smaller flares would bloat the snapshot.
    ...flr.filter((e) => /^[MX]/.test(e.classType ?? "")).map((e) => ({
      id: e.flrID!, kind: "FLR", time: fix(e.peakTime ?? e.beginTime), classType: e.classType ?? null,
      note: [e.sourceLocation, e.activeRegionNum ? `AR ${e.activeRegionNum}` : null].filter(Boolean).join(", "),
      instruments: (e.instruments ?? []).map((i) => i.displayName), link: e.link ?? "",
      linked: (e.linkedEvents ?? []).map((l) => l.activityID),
    })),
    ...gst.map((e) => ({
      id: e.gstID!, kind: "GST", time: fix(e.startTime),
      classType: e.allKpIndex?.length ? `Kp ${Math.max(...e.allKpIndex.map((k) => k.kpIndex))}` : null,
      link: e.link ?? "", linked: (e.linkedEvents ?? []).map((l) => l.activityID),
    })),
  ].filter((e) => e.id && e.time);
  const seen = new Set<string>();
  const unique = events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => a.time.localeCompare(b.time));
  const fetched_at = new Date().toISOString();
  writeSnapshot("donki.json", {
    fetched_at,
    source_url: "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
    credit: "NASA/CCMC DONKI",
    license: "NASA open data; credit NASA/CCMC DONKI.",
    window: { start: ymd(new Date(Date.now() - DAYS_BACK * 86400e3)), end: ymd(new Date()) },
    endpoint_used: [...used].join(", "),
    counts: { SEP: sep.length, FLR_all: flr.length, FLR_M_or_X: unique.filter((e) => e.kind === "FLR").length, GST: gst.length },
    events: unique,
  });
  markFetched(["nasa-donki"], fetched_at);
}

// --- NOAA SWPC GOES protons ---------------------------------------------------------

async function fetchGoes(): Promise<void> {
  const url = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json";
  const rows = await getJson<{ time_tag: string; satellite: number; flux: number; energy: string }[]>(url, 180_000);
  const p10 = rows.filter((r) => r.energy === ">=10 MeV");
  if (p10.length === 0) throw new Error("no >=10 MeV rows in GOES file");
  // Hourly maximum keeps the snapshot small without hiding a storm onset.
  const byHour = new Map<string, number>();
  for (const r of p10) {
    const hour = r.time_tag.slice(0, 13) + ":00:00Z";
    byHour.set(hour, Math.max(byHour.get(hour) ?? 0, r.flux));
  }
  const series = [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([time, flux]) => ({ time, flux: Number(flux.toPrecision(4)) }));
  const fetched_at = new Date().toISOString();
  writeSnapshot("goes_protons.json", {
    fetched_at,
    source_url: url,
    credit: "NOAA SWPC",
    license: "U.S. public domain (NOAA Space Weather Prediction Center).",
    satellite: p10[0].satellite,
    energy: ">=10 MeV integral proton flux, pfu (hourly maximum of 5-minute values)",
    series,
  });
  markFetched(["noaa-swpc-protons"], fetched_at);
}

// --- NASA OSDR study metadata ---------------------------------------------------------

const OSDR_TAGS: { tag: string; pattern: RegExp }[] = [
  { tag: "human", pattern: /inspiration4|twins? study|astronaut/i },
  { tag: "bone", pattern: /\bbone|femur|tibia\b|calvari|skeletal(?! muscle)|osteo/i },
  { tag: "muscle", pattern: /muscle|soleus|gastrocnemius|quadriceps|tibialis/i },
  { tag: "immune", pattern: /immune|spleen|thymus|lymph|pbmc|t-cell/i },
  { tag: "eye", pattern: /retina|\beye\b|ocular|optic/i },
  { tag: "microbiome", pattern: /microbio|metagenom|microbial/i },
  { tag: "cardiovascular", pattern: /heart|cardiac|cardio|aorta|vascular/i },
  { tag: "radiation", pattern: /radiation|irradiat|hze|proton|gamma/i },
  { tag: "sleep", pattern: /circadian|sleep/i },
  { tag: "nutrition", pattern: /diet|nutrition|liver/i },
];

async function fetchOsdr(): Promise<void> {
  const base = "https://visualization.osdr.nasa.gov/biodata/api/v2/query/datasets/";
  const cols = ["investigation.study.study%20title", "study.characteristics.organism"];
  let rows: Record<string, string>[];
  try {
    rows = await getJson(`${base}?format=json.records&${[...cols, "study.characteristics.material%20type"].join("&")}`, 180_000);
  } catch {
    rows = await getJson(`${base}?format=json.records&${cols.join("&")}`, 180_000);
  }
  const merged = new Map<string, { osd_id: string; title: string; organisms: Set<string>; tissues: Set<string> }>();
  for (const r of rows) {
    const id = r["id.accession"];
    const title = r["investigation.study.study title"];
    if (!id || !title) continue;
    if (!merged.has(id)) merged.set(id, { osd_id: id, title: title.replace(/�/g, " ").trim(), organisms: new Set(), tissues: new Set() });
    const m = merged.get(id)!;
    if (r["study.characteristics.organism"] && r["study.characteristics.organism"] !== "Not Applicable") m.organisms.add(r["study.characteristics.organism"]);
    if (r["study.characteristics.material type"]) m.tissues.add(r["study.characteristics.material type"]);
  }
  const studies = [...merged.values()].map((m) => {
    const organisms = [...m.organisms];
    const tissues = [...m.tissues];
    const text = `${m.title} ${tissues.join(" ")}`;
    return {
      osd_id: m.osd_id, title: m.title, organism: organisms.join(", "), tissue: tissues.slice(0, 4).join(", "),
      link: `https://osdr.nasa.gov/bio/repo/data/studies/${m.osd_id}`,
      tags: OSDR_TAGS.filter((t) => t.pattern.test(text)).map((t) => t.tag),
      human: organisms.some((o) => /homo sapiens/i.test(o)),
      rodent: organisms.some((o) => /mus musculus|rattus/i.test(o)),
      spaceflight: /spaceflight|space flight|\biss\b|space station|microgravity|inspiration4|rodent research|rr-?\d|bion|sts-|twins/i.test(m.title),
    };
  });
  // Keep a small, relevant set: human spaceflight datasets, plus rodent
  // spaceflight studies for each knowledge-base theme.
  const num = (id: string) => Number(id.replace(/\D/g, ""));
  const keep = new Map<string, (typeof studies)[number]>();
  for (const s of studies.filter((x) => x.human && /inspiration4|twins|astronaut/i.test(x.title))) keep.set(s.osd_id, s);
  for (const tag of OSDR_TAGS.map((t) => t.tag)) {
    const picks = studies.filter((x) => x.rodent && x.spaceflight && x.tags.includes(tag)).sort((a, b) => num(a.osd_id) - num(b.osd_id)).slice(0, 4);
    for (const p of picks) keep.set(p.osd_id, p);
  }
  if (keep.size === 0) throw new Error("no OSDR studies matched");
  const fetched_at = new Date().toISOString();
  writeSnapshot("osdr_studies.json", {
    fetched_at,
    source_url: "https://visualization.osdr.nasa.gov/biodata/api/",
    credit: "NASA Open Science Data Repository (OSDR)",
    license: "NASA open data. Metadata only; no raw omics are downloaded.",
    total_datasets_seen: merged.size,
    studies: [...keep.values()].sort((a, b) => num(a.osd_id) - num(b.osd_id)).map(({ human, rodent, spaceflight, ...rest }) => {
      void human; void rodent; void spaceflight;
      return rest;
    }),
  });
  markFetched(["nasa-osdr-biodata"], fetched_at);
}

// --- Run ---------------------------------------------------------------------------

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    warn(`${name} failed — keeping the previous snapshot. (${String(err)})`);
  }
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const want = (n: string) => only.length === 0 || only.includes(n);
  if (want("donki")) await step("NASA DONKI", fetchDonki);
  if (want("goes")) await step("NOAA SWPC GOES protons", fetchGoes);
  if (want("osdr")) await step("NASA OSDR study metadata", fetchOsdr);
  if (want("horizons")) await step("NASA/JPL Horizons light time", fetchLightTime);
  if (want("kp")) await step("NOAA SWPC planetary K index", fetchKp);
  if (want("power")) await step("NASA POWER surface weather", fetchPower);
  info("done. Linked only (no snapshot): NASA OSDR RadLab, NASA OSDR EDA, ESA HREDA — see content/sources.json.");
}

main().catch((err) => warn(String(err))).finally(() => process.exit(0));
