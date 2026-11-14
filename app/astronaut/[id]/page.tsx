import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertsList } from "@/components/alerts-list";
import { AstronautDashboard } from "@/components/astronaut/dashboard";
import { PathCard } from "@/components/astronaut/path-card";
import { RadiationCard } from "@/components/astronaut/radiation-card";
import { RemindersCard, SharingCard } from "@/components/astronaut/side-cards";
import type { BodyRegion } from "@/components/body-map";
import type { TrendChartProps } from "@/components/charts/trend-chart";
import { HeartCard, type HeartVital } from "@/components/heart/heart-card";
import { ScoreRing } from "@/components/score-ring";
import { SourceLink } from "@/components/source-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { METRICS, METRIC_BY_ID, REGIONS, REGION_LABEL, SCORE_CONFIG, buildSimState, type MetricId, type RegionId, type Status } from "@/lib/engine";
import { KIT_LABELS, MISSION_PLAN, engineConfigFor, plannedDose } from "@/lib/profiles";
import { SHARING_CATEGORIES } from "@/lib/sharing";
import { getAlerts, getCrewAnalyses, getDose, getMission, getReminders, getSharingPrefs, getSpaceWeatherEvents, getTimeline, getUpcomingTasks } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const RANK: Record<Status, number> = { unknown: 0, green: 1, amber: 2, red: 3 };
const CARDIAC_KIT = ["ecg", "aed", "bp_cuff", "pulse_oximeter", "oxygen", "aspirin"];
const SECTIONS = [
  { href: "#heart", label: "Heart" },
  { href: "#body", label: "Body map" },
  { href: "#recovery", label: "Recovery plan" },
  { href: "#trends", label: "Trends" },
  { href: "#alerts", label: "Alerts" },
  { href: "#radiation", label: "Radiation" },
];

export default async function AstronautPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mission = getMission();
  const crew = getCrewAnalyses(mission);
  const me = crew.find((c) => c.astronaut.id === Number(id));
  if (!me) notFound();
  const { astronaut, analysis, series } = me;
  const day = mission.currentDay;
  const config = engineConfigFor(mission.profile);

  const regions: BodyRegion[] = REGIONS.map((r) => {
    const st = analysis.regions[r.id];
    return { id: r.id, label: r.label, covers: r.covers, status: st.status, note: st.worst ? analysis.metrics[st.worst].reason : r.covers };
  });

  const timeline = getTimeline();
  // Solar particle events do not reach the ground: none are shown in Earth mode.
  const storms = mission.profile.earth ? [] : timeline.filter((t) => t.kind === "solar_particle_event" && t.missionDay <= day);
  const swByUrl = new Map(getSpaceWeatherEvents().map((e) => [e.sourceUrl, e]));

  const charts: (TrendChartProps & { region: RegionId })[] = METRICS.filter((m) => series[m.id]?.length).map((m) => {
    const st = analysis.metrics[m.id];
    const span = m.cadence === "weekly" ? 84 : 30;
    const fc = analysis.forecasts[m.id];
    return {
      metric: m.id, region: m.region, title: m.label, unit: m.unit, decimals: m.decimals,
      points: (series[m.id] ?? []).filter((p) => p.day > day - span && p.day <= day).map((p) => ({ day: p.day, value: p.value })),
      baseline: { median: st.baseline.median, scale: st.baseline.scale, sufficient: st.baseline.sufficient },
      direction: m.direction, zAmber: config.thresholds.zAmber, zRed: config.thresholds.zRed,
      forecast: fc ? { abstained: fc.abstained, reason: fc.reason, points: fc.points } : null,
      status: st.status, reason: st.reason,
      markers: m.id === "dose_daily" ? storms.filter((s) => s.missionDay > day - span).map((s) => ({ day: s.missionDay, label: "SEP" })) : [],
    };
  });

  // ---- Heart: rate, variability, pressure and oxygen against the personal baseline.
  const M = analysis.metrics;
  const fmt = (m: MetricId, v: number | null) => (v === null ? "—" : v.toFixed(METRIC_BY_ID[m].decimals));
  const spark = (m: MetricId) => (series[m] ?? []).filter((p) => p.day > day - 14 && p.day <= day).map((p) => p.value);
  const versus = (m: MetricId) => {
    const s = M[m];
    if (s.value === null || !s.baseline.sufficient) return "building baseline";
    const d = s.value - s.baseline.median;
    const dp = METRIC_BY_ID[m].decimals;
    const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
    return `${sign}${Math.abs(d).toFixed(dp)} vs usual ${s.baseline.median.toFixed(dp)}`;
  };
  const worse = (a: Status, b: Status): Status => (RANK[a] >= RANK[b] ? a : b);
  const bpStatus = worse(M.bp_sys.status, M.bp_dia.status);
  const vitals: HeartVital[] = [
    { id: "hr", label: "Resting rate", value: fmt("hr", M.hr.value), unit: "bpm", versus: versus("hr"), status: M.hr.status, spark: spark("hr") },
    { id: "hrv", label: "Variability (HRV)", value: fmt("hrv", M.hrv.value), unit: "ms", versus: versus("hrv"), status: M.hrv.status, spark: spark("hrv") },
    {
      id: "bp", label: "Blood pressure", value: `${fmt("bp_sys", M.bp_sys.value)}/${fmt("bp_dia", M.bp_dia.value)}`, unit: "mmHg",
      versus: M.bp_sys.baseline.sufficient ? `usual ${M.bp_sys.baseline.median.toFixed(0)}/${M.bp_dia.baseline.median.toFixed(0)}` : "building baseline",
      status: bpStatus, spark: spark("bp_sys"),
    },
    { id: "spo2", label: "Blood oxygen", value: fmt("spo2", M.spo2.value), unit: "%", versus: versus("spo2"), status: M.spo2.status, spark: spark("spo2") },
  ];
  const heartStatus = vitals.reduce<Status>((a, v) => worse(a, v.status), "unknown");
  const heartWorst = (["hrv", "hr", "bp_sys", "bp_dia", "spo2"] as MetricId[])
    .filter((m) => M[m].status === "amber" || M[m].status === "red")
    .sort((a, b) => M[b].badness - M[a].badness)[0];
  const heartVerdict = heartWorst
    ? M[heartWorst].reason
    : heartStatus === "unknown" ? "No heart readings yet today." : `Rate, variability, pressure and oxygen are all on ${astronaut.shortName}'s own baseline.`;

  const contributions = analysis.score.contributions
    .map((c) => ({ region: c.region, label: REGION_LABEL[c.region], weightPct: Math.round(c.weight * 100), points: c.points, worst: c.worstMetric ? METRIC_BY_ID[c.worstMetric].label : null, isWorstRegion: c.region === analysis.score.worstRegion }))
    .filter((c) => c.points >= 0.5).sort((a, b) => b.points - a.points);

  const alerts = getAlerts(day, astronaut.id);
  const reminders = getReminders(day, astronaut.id).filter((r) => !r.done || r.missionDay === day);
  const dose = getDose(astronaut.id, day);
  const plan = plannedDose();
  const tasks = getUpcomingTasks(mission, crew).filter((t) => t.task.assigned.includes(astronaut.id));
  const simState = buildSimState(analysis.metrics, series, day);

  return (
    <div className="space-y-8">
      {/* Who, how ready, and why — in one glance. */}
      <section className="card flex flex-wrap items-center gap-6 p-6" data-testid="score-card">
        <ScoreRing score={analysis.score.score} status={analysis.score.status} size={116} label="readiness" testid="score" />
        <div className="min-w-[240px] flex-1">
          <p className="label">{astronaut.role} · Day {day} · {mission.profile.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold" data-testid="astronaut-name">{astronaut.name}</h1>
            <StatusPill status={analysis.status} className="text-sm" />
            {analysis.anomaly.available && analysis.anomaly.isAnomaly && (
              <span data-testid="anomaly" title={analysis.anomaly.reason} className="chip !border-warn/50 !text-warn">Unusual overall pattern</span>
            )}
          </div>
          <p data-testid="explanation" className="mt-2 max-w-2xl text-sm leading-relaxed text-soft">{analysis.explanation}</p>
          <details className="mt-2 text-sm" data-testid="why-panel">
            <summary className="cursor-pointer text-teal">Why this score</summary>
            <div className="mt-2 max-w-xl rounded-xl border border-line bg-bg-alt/70 p-3">
              {contributions.length === 0 ? (
                <p className="text-soft">No region is past its amber line, so no points are removed.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-soft"><tr><th className="py-1 font-normal">Region</th><th className="font-normal">Worst measure</th><th className="font-normal">Weight</th><th className="text-right font-normal">Points lost</th></tr></thead>
                  <tbody>
                    {contributions.map((c) => (
                      <tr key={c.region} className="border-t border-line">
                        <td className="py-1 text-ink">{c.label}</td>
                        <td className="text-soft">{c.worst ?? "—"}</td>
                        <td className="num text-soft">{c.weightPct}%</td>
                        <td className="num text-right text-ink">−{c.points.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-xs text-soft">
                Score = 100 − points lost. {Math.round(SCORE_CONFIG.blend.worst * 100)}% follows the single worst region; the rest is a weighted mix. {mission.profile.label}: {mission.profile.weights_note}
              </p>
            </div>
          </details>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild size="sm" className="rounded-full"><Link href={`/astronaut/${astronaut.id}/check`}>Daily check</Link></Button>
          <Button asChild variant="secondary" size="sm" className="rounded-full"><Link href={`/astronaut/${astronaut.id}/check?tab=pvt`}>Reaction test</Link></Button>
          <Button asChild variant="secondary" size="sm" className="rounded-full"><Link href={`/astronaut/${astronaut.id}/check?tab=vision`}>Vision check</Link></Button>
        </div>
      </section>

      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (<a key={s.href} href={s.href} className="chip transition-colors hover:border-teal hover:text-teal">{s.label}</a>))}
      </nav>

      {tasks.map((t) => {
        const row = t.crew.find((c) => c.astronautId === astronaut.id)!;
        const swap = t.swaps.find((s) => s.out === astronaut.id);
        return (
          <div key={t.task.id} data-testid="readiness-banner" data-go={row.go} title={row.reason} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border px-5 py-3 text-sm ${row.go ? "border-ok/50 bg-ok/5" : "border-bad/60 bg-bad/5"}`}>
            <StatusPill status={row.go ? "green" : "red"} label={row.go ? "Go" : "No-go"} />
            <span className="font-semibold text-ink">Day {t.task.missionDay} {t.task.kind === "EVA" ? "spacewalk" : t.task.kind.replace("_", " ")} · {t.task.title}: {row.go ? "ready" : "not ready"}</span>
            {swap && <span data-testid="swap-suggestion" className="text-teal">Suggested swap: {swap.inName}</span>}
          </div>
        );
      })}

      <HeartCard
        status={heartStatus}
        bpm={M.hr.value}
        verdict={heartVerdict}
        vitals={vitals}
        kit={mission.profile.kit.filter((k) => CARDIAC_KIT.includes(k)).map((k) => KIT_LABELS[k] ?? k)}
      />

      <AstronautDashboard regions={regions} charts={charts} defaultMetrics={["hrv", "hr", "sleep_hours", "mood", "bp_sys", "dose_daily"]}>
        <PathCard state={simState} day={day} thresholds={config.thresholds} weights={config.regionWeights} firstName={astronaut.shortName} />
      </AstronautDashboard>

      <div id="alerts" className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card data-testid="alerts-card">
          <CardHeader><CardTitle>Alerts</CardTitle><span className="chip">Day {day}</span></CardHeader>
          <CardContent><AlertsList alerts={alerts} empty="No alerts today." /></CardContent>
        </Card>
        <RemindersCard reminders={reminders} day={day} />
      </div>

      <div id="radiation" className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <RadiationCard
          day={day}
          profileLabel={mission.profile.label}
          rate={mission.profile.dose.mSv_per_day}
          rateSourceId={mission.profile.dose.source_id}
          neutronShare={mission.profile.dose.neutron_share}
          neutronDemo={mission.profile.dose.neutron_share_demo}
          dose={dose.map((d) => ({ day: d.missionDay, total: d.totalMSv, neutron: d.neutronMSv, replay: d.source === "real_replay" }))}
          storms={storms.map((s) => ({ day: s.missionDay, realDate: swByUrl.get(s.sourceUrl ?? "")?.realTime.slice(0, 10) ?? "", sourceUrl: s.sourceUrl }))}
          plan={{ ...plan, note: MISSION_PLAN.note }}
          earth={Boolean(mission.profile.earth)}
        />
        <div className="space-y-6">
          <Card data-testid="profile-card">
            <CardHeader>
              <CardTitle>{mission.profile.label}</CardTitle>
              <span className="chip">{mission.profile.gravity_label}</span>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-bg-alt/60 p-3" title={mission.profile.comms.note}>
                  <dt className="label">Link to Earth</dt>
                  <dd className="mt-0.5 text-ink">{mission.profile.comms.label} <SourceLink id={mission.profile.comms.source_id} /></dd>
                </div>
                <div className="rounded-xl border border-line bg-bg-alt/60 p-3" title={mission.profile.exercise.note}>
                  <dt className="label">Exercise</dt>
                  <dd className="mt-0.5 text-ink"><span className="num">{mission.profile.exercise.prescription_min} min/day</span> <SourceLink id={mission.profile.exercise.source_id} /></dd>
                </div>
              </dl>
              <div>
                <p className="label mb-1.5">Checks</p>
                <ul className="flex flex-wrap gap-1.5">
                  {mission.profile.checks.map((c) => (<li key={c.id} className="chip !text-ink" title={c.when}>{c.label}</li>))}
                </ul>
              </div>
              <div>
                <p className="label mb-1.5">Medical kit</p>
                <ul data-testid="kit-list" className="flex flex-wrap gap-1.5">
                  {mission.profile.kit.map((k) => (<li key={k} className="chip">{KIT_LABELS[k] ?? k}</li>))}
                </ul>
              </div>
            </CardContent>
          </Card>
          <SharingCard astronautId={astronaut.id} categories={SHARING_CATEGORIES.map((c) => ({ id: c.id, label: c.label, note: c.note }))} prefs={getSharingPrefs(astronaut.id)} />
        </div>
      </div>
    </div>
  );
}
