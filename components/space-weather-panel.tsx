import Link from "next/link";
import { SourceLink } from "@/components/source-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { S_SCALE, currentSLevel, loadDonki, loadGoesProtons } from "@/lib/data/spaceWeather";
import type { TimelineEvent } from "@/lib/server/queries";

export function sLevelText(level: number): string {
  if (level === 0) return "S0 · no storm";
  return `S${level} · ${S_SCALE[level - 1].word.toLowerCase()} storm`;
}

/** Compact space-weather summary for the crew dashboard. Reads snapshots only. */
export function SpaceWeatherPanel({ day, timeline }: { day: number; timeline: TimelineEvent[] }) {
  const goes = loadGoesProtons();
  const donki = loadDonki();
  const s = currentSLevel(goes);
  const storms = timeline.filter((t) => t.kind === "solar_particle_event" && t.missionDay <= day).sort((a, b) => b.missionDay - a.missionDay);
  const active = storms.find((t) => day - t.missionDay <= 1);
  const latestFlares = (donki?.events ?? []).filter((e) => e.kind === "FLR").slice(-3).reverse();

  return (
    <Card data-testid="space-weather-panel">
      <CardHeader>
        <CardTitle>Space weather</CardTitle>
        <Link href="/space-weather" className="text-sm text-teal hover:underline">Details →</Link>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {active && (
          <p data-testid="sep-active" className="rounded-md border border-bad/60 bg-bad/10 px-3 py-2 text-ink">
            <span className="font-semibold">Solar particle event on Day {active.missionDay}.</span> Go to the storm shelter and log dosimeters.{" "}
            <Link className="text-teal underline" href="/space-weather#shelter">Checklist</Link>
          </p>
        )}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label">NOAA S-level now</p>
            <p data-testid="s-level" className="num font-display text-2xl font-semibold">{sLevelText(s.level)}</p>
          </div>
          <p className="text-right text-xs text-soft">
            ≥10 MeV protons: <span className="num text-ink">{s.latest ? s.latest.flux.toFixed(2) : "—"} pfu</span><br />
            S1 starts at <span className="num">10 pfu</span> <SourceLink id="noaa-swpc-protons" />
          </p>
        </div>
        <div>
          <p className="label mb-1">Solar particle events this mission</p>
          {storms.length === 0 ? <p className="text-soft">No solar particle event so far on this mission.</p> : (
            <ul className="space-y-1">
              {storms.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <span className="num text-ink">Day {t.missionDay}</span> <span className="text-soft">· {t.detail?.split(" (")[0]}</span>{" "}
                  {t.sourceUrl && <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="src-link">DONKI ↗</a>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {latestFlares.length > 0 && (
          <p className="text-xs text-soft">
            Latest flares: {latestFlares.map((f) => `${f.classType} (${f.time.slice(0, 10)})`).join(", ")}. <SourceLink id="nasa-donki" />
          </p>
        )}
        <p className="text-xs text-soft">Data as of <span className="num">{goes?.fetched_at?.slice(0, 10) ?? "—"}</span></p>
      </CardContent>
    </Card>
  );
}
