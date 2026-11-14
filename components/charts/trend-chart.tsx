"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Direction, ForecastPoint, Status } from "@/lib/engine/types";
import { StatusPill } from "@/components/ui/status-pill";

export const SERIES = { measured: "#3dd6c4", forecast: "#ff8a5b", grid: "#2a3866", ink: "#eef2f8", soft: "#b4c0d6", amber: "#f5b841", red: "#ff5c6c" };

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export interface TrendChartProps {
  metric: string;
  title: string;
  unit: string;
  decimals: number;
  points: { day: number; value: number }[];
  baseline: { median: number; scale: number; sufficient: boolean };
  direction: Direction;
  zAmber: number;
  zRed: number;
  forecast: { abstained: boolean; reason: string; points: ForecastPoint[] } | null;
  status: Status;
  reason: string;
  markers?: { day: number; label: string }[];
  height?: number;
}

interface Row {
  day: number;
  value?: number;
  fc?: number;
  band?: [number, number];
}

function TrendTooltip({ active, payload, unit, decimals }: { active?: boolean; payload?: { payload: Row }[]; unit: string; decimals: number }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const f = (n: number) => n.toFixed(decimals);
  return (
    <div className="rounded-md border border-line bg-bg px-3 py-2 text-xs shadow-lg">
      <p className="label">Day {row.day}</p>
      {row.value !== undefined && <p className="num text-ink">{f(row.value)} {unit}</p>}
      {row.fc !== undefined && row.value === undefined && (
        <p className="num text-ink">Forecast {f(row.fc)} {unit}{row.band ? ` (80%: ${f(row.band[0])}–${f(row.band[1])})` : ""}</p>
      )}
    </div>
  );
}

/** One metric over time: readings, personal baseline, amber/red zones and the 7-day forecast band. */
export function TrendChart(props: TrendChartProps) {
  const { title, unit, decimals, points, baseline, direction, zAmber, zRed, forecast, status, reason, markers = [], height = 190 } = props;
  const reduced = useReducedMotion();
  const last = points[points.length - 1];
  const fcPoints = forecast && !forecast.abstained ? forecast.points : [];

  const rows: Row[] = points.map((p) => ({ day: p.day, value: p.value }));
  // The forecast is drawn as its own dashed segment: Holt smooths the level, so
  // it need not start exactly at the last reading.
  for (const p of fcPoints) rows.push({ day: p.day, fc: p.value, band: [p.lo, p.hi] });

  const { median, scale, sufficient } = baseline;
  const all = [...points.map((p) => p.value), ...fcPoints.flatMap((p) => [p.lo, p.hi])];
  if (sufficient) all.push(median - (zRed + 0.6) * scale * (direction === "high" ? 0.3 : 1), median + (zRed + 0.6) * scale * (direction === "low" ? 0.3 : 1));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.06 || 1;
  const domain: [number, number] = [lo - pad, hi + pad];
  const f = (n: number) => n.toFixed(decimals);

  const zones: { y1: number; y2: number; color: string; key: string }[] = [];
  if (sufficient) {
    if (direction !== "high") {
      zones.push({ key: "amber-low", y1: median - zRed * scale, y2: median - zAmber * scale, color: SERIES.amber });
      zones.push({ key: "red-low", y1: domain[0], y2: median - zRed * scale, color: SERIES.red });
    }
    if (direction !== "low") {
      zones.push({ key: "amber-high", y1: median + zAmber * scale, y2: median + zRed * scale, color: SERIES.amber });
      zones.push({ key: "red-high", y1: median + zRed * scale, y2: domain[1], color: SERIES.red });
    }
  }

  const summary = `${title}. Latest ${last ? `${f(last.value)} ${unit} on Day ${last.day}` : "no reading"}. ${sufficient ? `Usual ${f(median)} ${unit}.` : ""} ${forecast ? (forecast.abstained ? `No forecast: ${forecast.reason}` : `Forecast for Day ${fcPoints[fcPoints.length - 1]?.day}: ${f(fcPoints[fcPoints.length - 1]?.value ?? 0)} ${unit}.`) : ""}`;

  return (
    <figure data-testid={`chart-${props.metric}`} title={reason} className="card card-hover p-4">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-display text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-2">
          {last && <span className="num text-sm text-ink">{f(last.value)} <span className="text-soft">{unit}</span></span>}
          <StatusPill status={status} />
        </span>
      </figcaption>
      <div style={{ height }} role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={SERIES.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" type="number" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={{ stroke: SERIES.grid }} tickCount={6} allowDecimals={false} />
            <YAxis domain={domain} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(Math.min(decimals, 1)))} tickCount={5} />
            {zones.map((z) => (<ReferenceArea key={z.key} y1={z.y1} y2={z.y2} fill={z.color} fillOpacity={0.09} stroke="none" ifOverflow="hidden" />))}
            {sufficient && <ReferenceLine y={median} stroke={SERIES.soft} strokeDasharray="4 4" strokeOpacity={0.7} />}
            {markers.map((m) => (<ReferenceLine key={m.day} x={m.day} stroke={SERIES.red} strokeDasharray="3 3" label={{ value: m.label, position: "insideTopLeft", fill: SERIES.ink, fontSize: 10 }} />))}
            <Tooltip content={<TrendTooltip unit={unit} decimals={decimals} />} cursor={{ stroke: SERIES.soft, strokeOpacity: 0.5 }} />
            <Area dataKey="band" stroke="none" fill={SERIES.forecast} fillOpacity={0.18} isAnimationActive={false} connectNulls />
            <Line dataKey="value" stroke={SERIES.measured} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#141e3d", strokeWidth: 2 }} isAnimationActive={!reduced} animationDuration={700} />
            <Line dataKey="fc" stroke={SERIES.forecast} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, stroke: "#141e3d", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-soft">
        <span className="flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-4" style={{ background: SERIES.measured }} /> readings</span>
        {sufficient && <span className="flex items-center gap-1"><span aria-hidden className="inline-block w-4 border-t border-dashed border-soft" /> your usual {f(median)}</span>}
        {fcPoints.length > 0 && <span className="flex items-center gap-1"><span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: SERIES.forecast }} /> 7-day forecast</span>}
        {forecast?.abstained && <span data-testid="forecast-abstained">No forecast: {forecast.reason}</span>}
      </div>
      <details className="mt-1 text-xs text-soft">
        <summary className="cursor-pointer text-teal">Data table</summary>
        <table className="num mt-1 w-full text-left">
          <thead><tr><th className="font-normal">Day</th><th className="font-normal">Reading</th><th className="font-normal">Forecast (80% band)</th></tr></thead>
          <tbody>
            {rows.slice(-14).map((r) => (
              <tr key={r.day}><td>{r.day}</td><td>{r.value !== undefined ? f(r.value) : "—"}</td><td>{r.value === undefined && r.fc !== undefined ? `${f(r.fc)} (${f(r.band![0])}–${f(r.band![1])})` : "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
