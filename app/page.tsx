import Link from "next/link";
import { AlertsList } from "@/components/alerts-list";
import { HeatCard, RealDelayNote } from "@/components/environment-cards";
import { EcgStrip } from "@/components/heart/heart-card";
import { ComposeMessage } from "@/components/houston/forms";
import { LinkQueue } from "@/components/houston/link-queue";
import { ScoreRing } from "@/components/score-ring";
import { SourceLink } from "@/components/source-link";
import { SpaceWeatherPanel } from "@/components/space-weather-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_HEX, StatusPill } from "@/components/ui/status-pill";
import { REGIONS, type Status } from "@/lib/engine";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/server/lang";
import { getAlerts, getCrewAnalyses, getEnvironment, getMessages, getMission, getTeamGoals, getTimeline, getUpcomingTasks } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const TASK_WORD: Record<string, string> = { EVA: "Spacewalk", docking: "Docking", gravity_transition: "Gravity transition" };

export default async function CrewDashboard() {
  const t = translator(await getLang());
  const mission = getMission();
  const day = mission.currentDay;
  const crew = getCrewAnalyses(mission);
  const tasks = getUpcomingTasks(mission, crew);
  const timeline = getTimeline();
  const allAlerts = getAlerts(day);
  const cabinAlerts = allAlerts.filter((a) => a.astronautId === null);
  const names = new Map(crew.map((c) => [c.astronaut.id, c.astronaut.shortName]));
  const counts = crew.reduce<Record<Status, number>>((acc, c) => ({ ...acc, [c.analysis.status]: (acc[c.analysis.status] ?? 0) + 1 }), { green: 0, amber: 0, red: 0, unknown: 0 });

  const goals = getTeamGoals(mission, crew);
  const nowIso = new Date().toISOString();
  const fromHouston = getMessages().filter((m) => m.direction === "to_ship" && m.deliverAt <= nowIso).slice(0, 3);
  const env = getEnvironment(day, 1);
  const avg = (f: (e: (typeof env)[number]) => number) => (env.length ? env.reduce((a, e) => a + f(e), 0) / env.length : NaN);
  const cabin = mission.profile.thresholds.cabin;
  const co2 = avg((e) => e.co2MmHg);
  const pressure = avg((e) => e.pressureKpa);
  const temp = avg((e) => e.tempC);
  const noise = Math.max(...env.map((e) => e.noiseDba), 0);
  const light = Math.max(...env.map((e) => e.lightLux), 0);
  const show = (n: number, dp: number) => (Number.isFinite(n) ? n.toFixed(dp) : "—");
  const cabinTiles: { label: string; value: string; unit: string; status: Status; limit: string; source?: string }[] = [
    { label: "CO₂", value: show(co2, 1), unit: "mmHg", status: co2 >= cabin.co2_mmHg.red ? "red" : co2 >= cabin.co2_mmHg.amber ? "amber" : "green", limit: `Amber at ${cabin.co2_mmHg.amber} mmHg`, source: "nasa-std-3001-co2" },
    { label: "Pressure", value: show(pressure, 1), unit: "kPa", status: pressure < cabin.pressure_kPa.low || pressure > cabin.pressure_kPa.high ? "amber" : "green", limit: `${cabin.pressure_kPa.low}–${cabin.pressure_kPa.high} kPa` },
    { label: "Temperature", value: show(temp, 1), unit: "°C", status: temp < cabin.temp_C.low || temp > cabin.temp_C.high ? "amber" : "green", limit: `${cabin.temp_C.low}–${cabin.temp_C.high} °C` },
    { label: "Noise peak", value: show(noise, 0), unit: "dBA", status: noise >= cabin.noise_dBA.red ? "red" : noise >= cabin.noise_dBA.amber ? "amber" : "green", limit: `Amber at ${cabin.noise_dBA.amber} dBA` },
    { label: "Light peak", value: show(light, 0), unit: "lux", status: light < cabin.light_lux_day.low ? "amber" : "green", limit: `At least ${cabin.light_lux_day.low} lux` },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{mission.name}</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">{t("crew.title")} <span className="num gradient-text" data-testid="current-day">{day}</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">{mission.profile.label}</span>
          <span className="chip">{mission.profile.gravity_label}</span>
          <span className="chip">Link {mission.profile.comms.label.toLowerCase()}</span>
          <p data-testid="crew-summary" className="chip !text-ink">
            <span className="text-ok">{counts.green} green</span>, <span className="text-warn">{counts.amber} amber</span>, <span className="text-bad">{counts.red} red</span>
          </p>
        </div>
      </div>

      {mission.profile.earth && <HeatCard t={t} />}

      <section aria-label="Crew roster" className="stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {crew.map(({ astronaut, analysis }) => {
          const hr = analysis.metrics.hr.value;
          const heart = analysis.regions.heart.status;
          const drifting = REGIONS.filter((r) => analysis.regions[r.id].status === "amber" || analysis.regions[r.id].status === "red");
          return (
            <Link key={astronaut.id} href={`/astronaut/${astronaut.id}`} data-testid={`crew-card-${astronaut.shortName.toLowerCase()}`} data-status={analysis.status} className="group block rounded-[1.125rem] focus-visible:outline-2">
              <Card className="card-hover h-full overflow-hidden">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${STATUS_HEX[analysis.status]}, transparent)` }} />
                <CardContent className="pt-5">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={analysis.score.score} status={analysis.score.status} size={78} />
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg font-semibold">{astronaut.name}</h2>
                      <p className="truncate text-xs text-soft">{astronaut.role}</p>
                      <div className="mt-1.5"><StatusPill status={analysis.status} /></div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-line/70 bg-bg/50 px-3 pt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="label">Heart</span>
                      <span className="num text-sm text-ink">{hr ? Math.round(hr) : "—"} <span className="text-xs text-soft">bpm</span></span>
                    </div>
                    <EcgStrip bpm={hr} color={STATUS_HEX[heart]} height={44} />
                  </div>

                  <p className="mt-3 line-clamp-2 min-h-10 text-sm text-soft">{drifting.length ? analysis.explanation : "On personal baseline."}</p>
                  {drifting.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Regions">
                      {drifting.map((r) => (<li key={r.id}><StatusPill status={analysis.regions[r.id].status} label={r.label} className="normal-case" /></li>))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card data-testid="tasks-card">
          <CardHeader><CardTitle>{t("crew.tasks")}</CardTitle><span className="chip">Next 7 days</span></CardHeader>
          <CardContent>
            {tasks.length === 0 ? <p className="text-sm text-soft">No crewed tasks in the next 7 days.</p> : (
              <ul className="space-y-3">
                {tasks.map((task) => (
                  <li key={task.task.id} data-testid={`task-${task.task.kind}-${task.task.missionDay}`} data-go={task.go} className="rounded-xl border border-line bg-bg-alt/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink"><span className="num text-teal">Day {task.task.missionDay}</span> · {TASK_WORD[task.task.kind] ?? task.task.kind} · {task.task.title}</p>
                      <StatusPill status={task.go ? "green" : "red"} label={task.go ? "Go" : "No-go"} />
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {task.crew.map((c) => (
                        <li key={c.astronautId} title={c.reason} className={`chip ${c.go ? "!border-ok/40 !text-ok" : "!border-bad/50 !text-bad"}`}>
                          <span aria-hidden>{c.go ? "✓" : "✕"}</span> {c.name} <span className="sr-only">{c.go ? "ready" : "not ready"}. {c.reason}</span>
                        </li>
                      ))}
                    </ul>
                    {task.swaps.map((s) => (
                      <p key={s.out} data-testid="swap-suggestion" title={s.reason} className="mt-2.5 rounded-lg border border-teal/40 bg-teal/5 px-3 py-1.5 text-sm text-ink">
                        Suggested swap: <strong>{s.inName}</strong> for {s.outName}
                      </p>
                    ))}
                    {!task.go && task.swaps.length === 0 && <p className="mt-2 text-sm text-warn">No green, trained crew member is free to swap in.</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <SpaceWeatherPanel day={day} timeline={timeline} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card data-testid="crew-alerts-card">
          <CardHeader><CardTitle>{t("crew.alerts")}</CardTitle><span className="chip">{allAlerts.length}</span></CardHeader>
          <CardContent>
            <AlertsList alerts={[...cabinAlerts, ...allAlerts.filter((a) => a.astronautId !== null)].map((a) => ({ ...a, who: a.astronautId ? names.get(a.astronautId) : "Cabin" }))} />
          </CardContent>
        </Card>
        <Card data-testid="cabin-card">
          <CardHeader><CardTitle>{t("crew.cabin")}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2.5">
              {cabinTiles.map((r) => (
                <div key={r.label} title={r.limit} className="rounded-xl border border-line bg-bg-alt/60 p-3">
                  <dt className="flex items-center justify-between">
                    <span className="label">{r.label}</span>
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[r.status], boxShadow: `0 0 8px ${STATUS_HEX[r.status]}` }} />
                  </dt>
                  <dd className="mt-0.5"><span className="num font-display text-xl font-semibold text-ink">{r.value}</span> <span className="text-xs text-soft">{r.unit}</span> <span className="sr-only">{r.status}</span></dd>
                  <dd className="text-[11px] text-soft">{r.limit} {r.source && <SourceLink id={r.source} />}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="team-goals-card">
        <CardHeader><CardTitle>{t("crew.goals")}</CardTitle><span className="chip">Together, no leaderboard</span></CardHeader>
        <CardContent>
          <ul className="grid gap-3 md:grid-cols-3">
            {goals.map((g) => (
              <li key={g.id} data-testid={`goal-${g.id}`} title={g.note} className="flex items-center gap-4 rounded-xl border border-line bg-bg-alt/60 p-4">
                <span className="num font-display text-4xl font-semibold" style={{ color: g.metToday ? STATUS_HEX.green : STATUS_HEX.amber }}>{g.streak}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{g.title}</p>
                  <p className="text-xs text-soft">day streak · {g.metToday ? "met today" : "not yet today"}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="earth-link-card">
        <CardHeader><CardTitle>{t("crew.link")}</CardTitle></CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-3"><RealDelayNote profile={mission.profile} day={day} /></div>
          <div>
            <p className="label mb-1.5">In transit</p>
            <LinkQueue delaySeconds={mission.commsDelaySeconds} realLabel={mission.profile.comms.label} />
          </div>
          <div>
            <p className="label mb-1.5">From Houston</p>
            {fromHouston.length === 0 ? <p className="text-sm text-soft">No messages yet.</p> : (
              <ul className="space-y-2">
                {fromHouston.map((m) => (
                  <li key={m.id} data-testid="from-houston" className="rounded-xl border border-line bg-bg-alt/60 px-3 py-2 text-sm">
                    <p className="font-medium text-ink">{m.subject}</p>
                    <p className="line-clamp-2 text-soft">{m.body}</p>
                    <p className="mt-0.5 text-xs text-soft">{m.author} · Day {m.missionDay}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="label mb-1.5">Message Houston</p>
            <ComposeMessage direction="to_earth" author="Crew" label="Send" testid="compose-to-earth" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
