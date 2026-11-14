import { FluxChart } from "@/components/charts/flux-chart";
import { Checklist } from "@/components/checklist";
import { KpCard } from "@/components/environment-cards";
import { SourceLink } from "@/components/source-link";
import { sLevelText } from "@/components/space-weather-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { SEP_DOSE_DEMO, S_SCALE, currentSLevel, loadDonki, loadGoesProtons } from "@/lib/data/spaceWeather";
import { getCrew, getDose, getMission, getSpaceWeatherEvents, getTimeline } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { SEP: "Solar energetic particles", FLR: "Solar flare", GST: "Geomagnetic storm", CME: "Coronal mass ejection" };

export default function SpaceWeatherPage() {
  const mission = getMission();
  const day = mission.currentDay;
  const goes = loadGoesProtons();
  const donki = loadDonki();
  const s = currentSLevel(goes);
  const events = getSpaceWeatherEvents();
  const timeline = getTimeline();
  const storms = timeline.filter((t) => t.kind === "solar_particle_event" && t.missionDay <= day).sort((a, b) => b.missionDay - a.missionDay);
  const byUrl = new Map(events.map((e) => [e.sourceUrl, e]));
  const crew = getCrew();
  const doses = crew.map((c) => ({ c, dose: getDose(c.id, day) }));
  const active = storms.find((t) => day - t.missionDay <= 1);

  const impact = storms.map((t) => {
    const rows = doses.map(({ c, dose }) => {
      const on = dose.find((d) => d.missionDay === t.missionDay);
      const next = dose.find((d) => d.missionDay === t.missionDay + 1);
      const before = dose.filter((d) => d.missionDay < t.missionDay && d.missionDay >= t.missionDay - 14).map((d) => d.totalMSv);
      const typical = before.length ? before.reduce((a, b) => a + b, 0) / before.length : mission.profile.dose.mSv_per_day;
      return { name: c.shortName, on: on?.totalMSv ?? null, next: next?.totalMSv ?? null, typical };
    });
    return { t, rows, real: byUrl.get(t.sourceUrl ?? "") };
  });

  const replayed = events.filter((e) => e.missionDay !== null && e.missionDay <= day).sort((a, b) => b.missionDay! - a.missionDay! || b.realTime.localeCompare(a.realTime));
  const latest = events.slice(0, 12);

  return (
    <div className="space-y-5">
      <div>
        <p className="label">Real data from NASA/CCMC DONKI and NOAA SWPC · read from committed snapshots</p>
        <h1 className="font-display text-2xl font-semibold">Space weather</h1>
      </div>

      {active && (
        <div data-testid="sep-banner" className="rounded-lg border border-bad/60 bg-bad/10 px-4 py-3">
          <p className="font-display text-lg font-semibold">Solar particle event on Day {active.missionDay}. Go to the storm shelter.</p>
          <p className="text-sm text-soft">{active.detail}</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader><CardTitle>NOAA S-level now</CardTitle><SourceLink id="noaa-swpc-protons" /></CardHeader>
          <CardContent className="space-y-3">
            <p data-testid="s-level-now" className="num font-display text-4xl font-semibold">{sLevelText(s.level)}</p>
            <p className="text-sm text-soft">
              Latest real reading: <span className="num text-ink">{s.latest ? `${s.latest.flux.toFixed(2)} pfu` : "—"}</span> of ≥10 MeV protons
              {s.latest && <> at <span className="num">{s.latest.time.slice(0, 16).replace("T", " ")} UTC</span></>} (GOES-{goes?.satellite ?? "?"}).
              7-day peak: <span className="num text-ink">{s.peak ? `${s.peak.flux.toFixed(2)} pfu` : "—"}</span>.
            </p>
            <table className="w-full text-sm">
              <caption className="label mb-1 text-left">NOAA solar radiation storm scale <SourceLink id="noaa-s-scale" /></caption>
              <tbody>
                {S_SCALE.map((row) => (
                  <tr key={row.level} className={`border-t border-line ${s.level === row.level ? "bg-panel-hi" : ""}`}>
                    <th scope="row" className="num py-1 text-left font-semibold text-ink">S{row.level}</th>
                    <td className="text-soft">{row.word}</td>
                    <td className="num text-right text-ink">≥ {row.pfu.toLocaleString("en-US")} pfu</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-soft">Snapshot fetched {goes?.fetched_at?.slice(0, 16).replace("T", " ") ?? "—"} UTC. Run <code className="font-mono">npm run fetch-data</code> to refresh. Credit: NOAA SWPC.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>GOES proton flux, ≥10 MeV — last 7 days of real data</CardTitle>
              <p className="text-xs text-soft">Hourly maximum, particle flux units (pfu), log scale.</p>
            </div>
            <SourceLink id="noaa-swpc-protons" />
          </CardHeader>
          <CardContent>{goes ? <FluxChart series={goes.series} /> : <p className="text-sm text-soft">No GOES snapshot. Run npm run fetch-data.</p>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card data-testid="dose-impact">
          <CardHeader>
            <div>
              <CardTitle>Dose impact of replayed events</CardTitle>
              <p className="text-xs text-soft">Event timing follows NASA DONKI records. Onboard dose spike: +{SEP_DOSE_DEMO.standard[0]} mSv, or +{SEP_DOSE_DEMO.hardSpectrum[0]} mSv when GOES also saw &gt;100 MeV protons.</p>
            </div>
          </CardHeader>
          <CardContent>
            {impact.length === 0 ? <p className="text-sm text-soft">No solar particle event has been replayed up to Day {day}.</p> : (
              <div className="space-y-4">
                {impact.map(({ t, rows, real }) => (
                  <div key={t.id} data-testid={`impact-day-${t.missionDay}`}>
                    <p className="text-sm">
                      <span className="num font-semibold text-ink">Day {t.missionDay}</span>{" "}
                      <span className="text-soft">— replay of the real event of {real?.realTime.slice(0, 16).replace("T", " ")} UTC ({real?.note}). NOAA S1 or higher.</span>{" "}
                      {t.sourceUrl && <a className="src-link" href={t.sourceUrl} target="_blank" rel="noreferrer">NASA/CCMC DONKI record ↗</a>}
                    </p>
                    <table className="mt-1 w-full text-sm">
                      <thead className="text-left text-xs text-soft"><tr><th className="py-1 font-normal">Crew</th><th className="font-normal">Typical day</th><th className="font-normal">Event day</th><th className="font-normal">Day after</th><th className="text-right font-normal">× typical</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.name} className="border-t border-line">
                            <th scope="row" className="py-1 text-left font-normal text-ink">{r.name}</th>
                            <td className="num text-soft">{r.typical.toFixed(2)} mSv</td>
                            <td className="num text-ink">{r.on?.toFixed(2) ?? "—"} mSv</td>
                            <td className="num text-soft">{r.next?.toFixed(2) ?? "—"} mSv</td>
                            <td className="num text-right text-ink">{r.on ? `${(r.on / r.typical).toFixed(1)}×` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-soft">Typical day uses the {mission.profile.label} rate of <span className="num">{mission.profile.dose.mSv_per_day} mSv/day</span> <SourceLink id={mission.profile.dose.source_id} /> with ±15% day-to-day variation.</p>
          </CardContent>
        </Card>
        <Card id="shelter">
          <CardHeader>
            <div>
              <CardTitle>Storm-shelter checklist</CardTitle>
              <p className="text-xs text-soft">Shown when a solar particle event starts.</p>
            </div>
            {active ? <StatusPill status="red" label="Active" /> : <StatusPill status="green" label="Standby" />}
          </CardHeader>
          <CardContent>
            <Checklist id="shelter" items={[
              { title: "Stop outside work", detail: "Any spacewalk ends now. Crew return inside." },
              { title: "Move to the storm shelter", detail: "The most shielded part of the cabin, behind water and stores." },
              { title: "Log your personal dosimeter", detail: "Total and neutron channel, at the start and every 6 hours." },
              { title: "Count the crew", detail: "Everyone is in the shelter and answering." },
              { title: "Stay until the all-clear", detail: "Proton flux back below the S1 line (10 pfu)." },
              { title: "Send dose readings to Houston", detail: "They travel on the delayed link." },
            ]} />
          </CardContent>
        </Card>
      </div>

      <KpCard />

      <Card data-testid="events-card">
        <CardHeader>
          <div>
            <CardTitle>Real events replayed on this mission (up to Day {day})</CardTitle>
            <p className="text-xs text-soft">
              Replay mode: the latest real GOES-measured particle event is placed on Day 120, and every other real event keeps its real distance in days from it.
              Only particle events measured near Earth by GOES at ≥10 MeV raise an onboard alert.
            </p>
          </div>
          <SourceLink id="nasa-donki" />
        </CardHeader>
        <CardContent>
          <EventsTable rows={replayed.slice(0, 40)} showDay />
          {replayed.length > 40 && <p className="mt-2 text-xs text-soft">Showing the 40 most recent of {replayed.length} replayed events.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Latest real events in the snapshot</CardTitle>
            <p className="text-xs text-soft">
              {donki ? <>{donki.events.length} events from {donki.window?.start} to {donki.window?.end}: particle events, M- and X-class flares, geomagnetic storms. Fetched {donki.fetched_at?.slice(0, 10)} via {donki.endpoint_used}.</> : "No DONKI snapshot."}
            </p>
          </div>
          <SourceLink id="nasa-donki" />
        </CardHeader>
        <CardContent><EventsTable rows={latest} /></CardContent>
      </Card>
    </div>
  );
}

function EventsTable({ rows, showDay = false }: { rows: { id: string; kind: string; realTime: string; missionDay: number | null; classType: string | null; note: string | null; sLevel: number | null; sourceUrl: string }[]; showDay?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-soft">Nothing to show.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-soft">
          <tr>{showDay && <th className="py-1 font-normal">Mission day</th>}<th className="py-1 font-normal">Real time (UTC)</th><th className="font-normal">Event</th><th className="font-normal">Detail</th><th className="font-normal">Onboard effect</th><th className="font-normal">Source</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-line align-top">
              {showDay && <td className="num py-1.5 text-ink">Day {e.missionDay}</td>}
              <td className="num py-1.5 text-soft">{e.realTime.slice(0, 16).replace("T", " ")}</td>
              <td className="text-ink">{KIND[e.kind] ?? e.kind}{e.classType ? ` ${e.classType}` : ""}</td>
              <td className="text-soft">{e.note}</td>
              <td>{e.sLevel ? <span className="text-bad">Radiation alert · S{e.sLevel} or higher</span> : <span className="text-soft">Listed only</span>}</td>
              <td><a className="src-link" href={e.sourceUrl} target="_blank" rel="noreferrer">DONKI ↗</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
