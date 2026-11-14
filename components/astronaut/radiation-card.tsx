"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceLink } from "@/components/source-link";
import { SERIES } from "@/components/charts/trend-chart";

export interface RadiationCardProps {
  day: number;
  profileLabel: string;
  rate: number;
  rateSourceId: string;
  neutronShare: number;
  neutronDemo: boolean;
  dose: { day: number; total: number; neutron: number; replay: boolean }[];
  storms: { day: number; realDate: string; sourceUrl: string | null }[];
  /** Earth mode: natural background only, no mission plan. */
  earth?: boolean;
  plan: { phases: { id: string; label: string; days: number; mSv: number; rate: number; source_id: string; profile: string }[]; total: number; transitShare: number; note: string };
}

/** Personal dosimeter: daily dose, neutron channel, mission-to-date total against the plan. */
export function RadiationCard(p: RadiationCardProps) {
  const cumulative = p.dose.reduce((a, d) => a + d.total, 0);
  const neutron = p.dose.reduce((a, d) => a + d.neutron, 0);
  const planToDate = p.rate * p.day;
  const today = p.dose[p.dose.length - 1];
  const recent = p.dose.slice(-45);
  const stormInView = p.storms.filter((s) => recent.some((d) => d.day === s.day));
  const diffPct = ((cumulative - planToDate) / planToDate) * 100;

  return (
    <Card data-testid="radiation-card">
      <CardHeader>
        <CardTitle>Radiation</CardTitle>
        <span className="chip">{p.earth ? "Natural background" : "Personal dosimeter"}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Today" value={`${today ? today.total.toFixed(2) : "—"} mSv`} />
          <Stat label={`${p.profileLabel} rate`} value={`${p.rate} mSv/day`} extra={<SourceLink id={p.rateSourceId} />} testid="dose-rate" />
          <Stat label="Mission to date" value={`${cumulative.toFixed(0)} mSv`} extra={<span className="text-xs text-soft">plan {planToDate.toFixed(0)} mSv ({diffPct >= 0 ? "+" : ""}{diffPct.toFixed(0)}%)</span>} />
          <Stat label="Neutron channel" value={`${neutron.toFixed(0)} mSv`} extra={<><span className="text-xs text-soft">≈{Math.round(p.neutronShare * 100)}% </span><SourceLink id="csa-neutrons" /></>} />
        </dl>

        <figure>
          <figcaption className="label mb-1">Daily dose equivalent, last {recent.length} days (mSv)</figcaption>
          <div style={{ height: 170 }} role="img" aria-label={`Daily dose for the last ${recent.length} days. Typical day about ${p.rate} mSv.${stormInView.map((s) => ` Spike on Day ${s.day} from the solar particle event of ${s.realDate}.`).join("")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recent} margin={{ top: 14, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                <CartesianGrid stroke={SERIES.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: SERIES.grid }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis width={34} tickLine={false} axisLine={false} tickCount={4} />
                <Tooltip
                  cursor={{ fill: "#ffffff", fillOpacity: 0.05 }}
                  contentStyle={{ background: "#090e1d", border: "1px solid #2a3866", borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(d) => `Day ${d}`}
                  formatter={(v, _n, item) => [`${Number(v).toFixed(2)} mSv${(item?.payload as { replay?: boolean })?.replay ? " (solar particle event)" : ""}`, "Dose"]}
                />
                <ReferenceLine y={p.rate} stroke={SERIES.soft} strokeDasharray="4 4" strokeOpacity={0.6} />
                {stormInView.map((s) => (
                  <ReferenceLine key={s.day} x={s.day} stroke="none" label={{ value: `SEP · ${s.realDate}`, position: "top", fill: SERIES.ink, fontSize: 10 }} />
                ))}
                <Bar dataKey="total" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {recent.map((d) => (<Cell key={d.day} fill={d.replay ? SERIES.forecast : SERIES.measured} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-soft">
            <span className="flex items-center gap-1"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.measured }} /> daily dose</span>
            <span className="flex items-center gap-1"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.forecast }} /> solar particle event</span>
            <span className="flex items-center gap-1"><span aria-hidden className="inline-block w-4 border-t border-dashed border-soft" /> sourced rate</span>
          </p>
          {stormInView.map((s) => (
            <p key={s.day} data-testid="sep-note" className="mt-1 text-xs text-soft">
              Day {s.day} · solar energetic particle event of {s.realDate} UTC.{" "}
              {s.sourceUrl && <a className="src-link" href={s.sourceUrl} target="_blank" rel="noreferrer">NASA/CCMC DONKI record ↗</a>}{" "}
              <SourceLink id="noaa-swpc-protons" label="NOAA S-scale" />
            </p>
          ))}
        </figure>

        {p.earth ? (
          <p data-testid="earth-dose-note" className="text-sm text-soft">
            On Earth the dose shown is the world-average natural background. For scale, one day in transit to Mars ({(1.8).toFixed(1)} mSv <SourceLink id="msl-rad-cruise" />) is about{" "}
            <span className="num text-ink">{Math.round(1.8 / p.rate)}</span> days of background.
          </p>
        ) : (
        <figure>
          <figcaption className="label mb-1">Planned mission dose by phase</figcaption>
          <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={p.plan.phases.map((ph) => `${ph.label}: ${ph.mSv.toFixed(0)} millisieverts`).join("; ")}>
            {p.plan.phases.map((ph) => (
              <div key={ph.id} style={{ width: `${(ph.mSv / p.plan.total) * 100}%`, background: ph.profile === "transit" ? SERIES.measured : "#7c8bd6" }} className="flex items-center justify-center overflow-hidden">
                <span className="num truncate px-1 text-[11px] font-semibold text-bg">{ph.mSv.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-soft sm:grid-cols-3">
            {p.plan.phases.map((ph) => (
              <li key={ph.id}>
                <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: ph.profile === "transit" ? SERIES.measured : "#7c8bd6" }} />
                {ph.label}: <span className="num text-ink">{ph.days} d × {ph.rate}</span> mSv/day <SourceLink id={ph.source_id} />
              </li>
            ))}
          </ul>
          <p data-testid="transit-share" className="mt-1.5 text-sm text-ink">
            Most dose is received in transit: <span className="num">{Math.round(p.plan.transitShare * 100)}%</span> of a planned <span className="num">{p.plan.total.toFixed(0)} mSv</span>.
          </p>
        </figure>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, extra, testid }: { label: string; value: string; extra?: React.ReactNode; testid?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-alt/60 p-3">
      <dt className="label">{label}</dt>
      <dd data-testid={testid} className="num text-lg font-semibold text-ink">{value}</dd>
      {extra && <dd className="leading-tight">{extra}</dd>}
    </div>
  );
}
