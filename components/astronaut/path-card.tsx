"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RESPONSE, describePlan, findPathToGreen, greenDayFor, simulatePlan, type SimState } from "@/lib/engine/counterfactual";
import { METRIC_BY_ID } from "@/lib/engine/metrics";
import type { RegionWeights, Thresholds } from "@/lib/engine/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/controls";
import { SERIES, useReducedMotion } from "@/components/charts/trend-chart";

interface Props {
  state: SimState;
  day: number;
  thresholds: Thresholds;
  weights: RegionWeights;
  firstName: string;
}

/**
 * Path back to green. The search and the slider both run in the browser on the
 * pure engine, so dragging the slider is instant and works offline.
 */
export function PathCard({ state, day, thresholds, weights, firstName }: Props) {
  const found = React.useMemo(() => findPathToGreen(state, day, thresholds, weights), [state, day, thresholds, weights]);
  const reduced = useReducedMotion();
  const [sleep, setSleep] = React.useState<number>(found.plan?.sleepHours ?? state.usualSleep);
  const [crew, setCrew] = React.useState<number>(found.plan?.crewTimeHours ?? 0);
  React.useEffect(() => {
    setSleep(found.plan?.sleepHours ?? state.usualSleep);
    setCrew(found.plan?.crewTimeHours ?? 0);
  }, [found, state.usualSleep]);

  if (found.alreadyGreen) {
    return (
      <Card data-testid="path-card">
        <CardHeader><CardTitle>Path back to green</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-ok">On your baseline. No change needed.</p>
          <p className="mt-1 text-xs text-soft">If a measure drifts, Hygieia will search for the smallest change that brings it back.</p>
        </CardContent>
      </Card>
    );
  }

  const cannot = found.unaddressable.map((m) => METRIC_BY_ID[m].plain);
  if (!found.plan || !found.result) {
    return (
      <Card data-testid="path-card">
        <CardHeader><CardTitle>Path back to green</CardTitle></CardHeader>
        <CardContent><p data-testid="path-summary" className="text-sm text-warn">{found.summary}</p></CardContent>
      </Card>
    );
  }

  const mine = { ...found.plan, sleepHours: sleep, crewTimeHours: crew };
  const sim = simulatePlan(state, mine, day, thresholds, weights);
  const myGreen = greenDayFor(sim, found.unaddressable);
  const isRecommended = sleep === found.plan.sleepHours && crew === found.plan.crewTimeHours;
  const rows = sim.days.map((d, i) => ({ day: d.day, plan: d.score, nothing: found.doNothing.days[i].score }));
  const nothingGreen = greenDayFor(found.doNothing, found.unaddressable);

  return (
    <Card data-testid="path-card">
      <CardHeader>
        <CardTitle>Path back to green</CardTitle>
        <span className="chip">Smallest change</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p data-testid="path-summary" className="mt-0.5 font-display text-lg font-semibold leading-snug text-ink">
            {cap(found.summary)}.
          </p>
          <p data-testid="path-green-day" className="mt-1 inline-flex items-center gap-2 rounded-full bg-teal/10 px-3 py-1 text-sm font-medium text-teal">Projected green by Day {found.result.greenDay}</p>
          <p className="mt-1 text-xs text-soft">
            If nothing changes: {nothingGreen ? `green on Day ${nothingGreen}` : "not green within 7 days"}.
            {cannot.length > 0 && ` Not moved by this plan: ${cannot.join(", ")}.`}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-bg-alt/60 p-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="sleep-slider" className="text-sm font-medium">Sleep tonight</label>
            <span data-testid="sleep-value" className="num text-sm">{sleep.toFixed(1)} h</span>
          </div>
          <Slider id="sleep-slider" data-testid="sleep-slider" aria-label="Sleep tonight, hours" min={4} max={9.5} step={0.5} value={[sleep]} onValueChange={(v) => setSleep(v[0])} className="mt-1" />
          <div className="mt-3 flex items-baseline justify-between">
            <label htmlFor="crew-slider" className="text-sm font-medium">Shared crew time</label>
            <span className="num text-sm">{crew.toFixed(1)} h/day</span>
          </div>
          <Slider id="crew-slider" data-testid="crew-slider" aria-label="Shared crew time, hours per day" min={0} max={2} step={0.5} value={[crew]} onValueChange={(v) => setCrew(v[0])} className="mt-1" />
          <p className="mt-3 text-sm">
            <span className="text-soft">With {describePlan(mine)}: </span>
            <span data-testid="projected-day" data-day={myGreen ?? ""} className={myGreen ? "num font-semibold text-ink" : "font-semibold text-warn"}>
              {myGreen ? `green on Day ${myGreen}` : "not green within 7 days"}
            </span>
            {!isRecommended && (
              <button type="button" className="ml-2 cursor-pointer text-xs text-teal underline" onClick={() => { setSleep(found.plan!.sleepHours); setCrew(found.plan!.crewTimeHours); }}>
                reset to suggested
              </button>
            )}
          </p>
        </div>

        <figure>
          <figcaption className="label mb-1">Projected readiness score, next 7 days</figcaption>
          <div style={{ height: 130 }} role="img" aria-label={`Projected readiness: with this plan ${rows.map((r) => r.plan).join(", ")}; if nothing changes ${rows.map((r) => r.nothing).join(", ")}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 6, right: 70, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={SERIES.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: SERIES.grid }} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} width={30} tickLine={false} axisLine={false} />
                <ReferenceLine y={80} stroke={SERIES.soft} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Tooltip
                  cursor={{ stroke: SERIES.soft, strokeOpacity: 0.5 }}
                  contentStyle={{ background: "#090e1d", border: "1px solid #2a3866", borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(d) => `Day ${d}`}
                  formatter={(v, name) => [String(v), name === "plan" ? "With this plan" : "If nothing changes"]}
                />
                <Line dataKey="nothing" stroke={SERIES.soft} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false}
                  label={(p: { index?: number; x?: number | string; y?: number | string }) => (p.index === rows.length - 1 ? <text x={Number(p.x) + 6} y={Number(p.y) + 4} fill={SERIES.soft} fontSize={10}>no change</text> : <g />)} />
                <Line dataKey="plan" stroke={SERIES.measured} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={!reduced} animationDuration={300}
                  label={(p: { index?: number; x?: number | string; y?: number | string }) => (p.index === rows.length - 1 ? <text x={Number(p.x) + 6} y={Number(p.y) + 4} fill={SERIES.ink} fontSize={10}>this plan</text> : <g />)} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <details className="text-xs text-soft">
          <summary className="cursor-pointer text-teal">How this is worked out</summary>
          <p className="mt-1">
            {firstName}&apos;s drifting measures are stepped forward day by day. Each hour of sleep above a short night, each hour of shared crew time, extra exercise and extra fluids pull specific measures back
            by fixed amounts (at most {RESPONSE.maxRecoveryPerDay} baseline width per day). A grid search tries every combination and keeps the one with the least effort that is green by the day after the plan ends.
            {found.evaluated.toLocaleString("en-US")} plans were checked. The plan then assumes your usual routine.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
