import fs from "node:fs";
import path from "node:path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SNAPSHOT_DIR } from "@/lib/data/spaceWeather";
import { getSources } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { api: "Live APIs, fetched into committed snapshots", paper: "Published measurements", dataset: "Open datasets", page: "Agency pages and references" };
const ORDER = ["api", "paper", "dataset", "page"];

interface SnapshotMeta { file: string; fetched_at: string | null; source_url: string; credit: string; license: string; bytes: number }

function snapshots(): SnapshotMeta[] {
  try {
    return fs.readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json")).map((file) => {
      const full = path.join(SNAPSHOT_DIR, file);
      const json = JSON.parse(fs.readFileSync(full, "utf8"));
      return { file, fetched_at: json.fetched_at ?? null, source_url: json.source_url ?? "", credit: json.credit ?? "", license: json.license ?? "", bytes: fs.statSync(full).size };
    });
  } catch {
    return [];
  }
}

export default function SourcesPage() {
  const sources = getSources().filter((s) => s.id !== "demo-thresholds");
  const snaps = snapshots();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="label">Data provenance and credits</p>
        <h1 className="font-display text-2xl font-semibold">Sources</h1>
        <p className="mt-1 text-sm text-soft">
          Every sourced number in Hygieia links here. The app never goes online at run time:
          <code className="mx-1 font-mono text-ink">npm run fetch-data</code> writes the snapshots below, and the app reads only those files.
        </p>
        <p className="mt-2 text-sm text-ink">Credits: NASA/CCMC DONKI · NOAA SWPC · NASA OSDR · ESA HREDA · CSA · MSL RAD (NASA/JPL-Caltech/SwRI) · Chang&apos;E 4 LND.</p>
      </div>

      <Card data-testid="snapshots-card">
        <CardHeader><CardTitle>Committed snapshots</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-soft"><tr><th className="py-1 font-normal">File</th><th className="font-normal">Fetched (UTC)</th><th className="font-normal">Credit</th><th className="font-normal">Licence</th><th className="font-normal">Source</th></tr></thead>
              <tbody>
                {snaps.map((s) => (
                  <tr key={s.file} className="border-t border-line align-top">
                    <td className="num py-1.5 text-ink">data/snapshots/{s.file}<span className="block text-xs text-soft">{(s.bytes / 1024).toFixed(0)} kB</span></td>
                    <td className="num text-soft">{s.fetched_at?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                    <td className="text-ink">{s.credit}</td>
                    <td className="text-soft">{s.license}</td>
                    <td><a className="src-link" href={s.source_url} target="_blank" rel="noreferrer">open ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {ORDER.map((kind) => {
        const rows = sources.filter((s) => s.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} aria-label={KIND[kind]} className="space-y-3">
            <h2 className="font-display text-lg font-semibold">{KIND[kind]}</h2>
            {rows.map((s) => (
              <article key={s.id} id={s.id} data-testid="source" className="scroll-mt-20 rounded-xl border border-line bg-panel/90 px-5 py-4 target:border-teal target:shadow-[0_0_0_1px_#3dd6c4]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="label">{s.agency} · <span className="normal-case">#{s.id}</span></p>
                    <h3 className="font-display text-base font-semibold text-ink">{s.title}</h3>
                  </div>
                  {s.value !== null && (
                    <p className="num text-right font-display text-xl font-semibold text-ink">{s.value} <span className="text-sm font-normal text-soft">{s.unit}</span></p>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink"><span className="label mr-1.5">Used for</span>{s.usedFor}</p>
                <p className="mt-1 text-sm text-soft"><span className="label mr-1.5">Credit</span>{s.credit}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-soft">
                  {s.url.startsWith("http") ? <a className="src-link" href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\//, "").slice(0, 70)} ↗</a> : <a className="src-link" href={s.url}>{s.url}</a>}
                  <span>{s.fetchedAt ? <>Snapshot fetched <span className="num">{s.fetchedAt.slice(0, 16).replace("T", " ")} UTC</span></> : "Linked reference, not fetched"}</span>
                </p>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
