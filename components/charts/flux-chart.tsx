"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERIES, useReducedMotion } from "./trend-chart";

/** GOES ≥10 MeV integral proton flux on a log axis, with the NOAA S1 storm line at 10 pfu. */
export function FluxChart({ series }: { series: { time: string; flux: number }[] }) {
  const reduced = useReducedMotion();
  const rows = series.map((p) => ({ t: Date.parse(p.time), flux: Math.max(p.flux, 0.01) }));
  const peak = rows.reduce((a, r) => Math.max(a, r.flux), 0);
  const top = peak >= 10 ? 10 ** Math.ceil(Math.log10(peak * 1.5)) : 100;
  const ticks: number[] = [];
  for (let v = 0.1; v <= top; v *= 10) ticks.push(Number(v.toPrecision(1)));
  const fmtDay = (t: number) => new Date(t).toISOString().slice(5, 10);
  return (
    <div style={{ height: 220 }} role="img" aria-label={`GOES proton flux at 10 MeV and above over ${rows.length} hours. Peak ${peak.toFixed(2)} pfu. The S1 storm threshold is 10 pfu.`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={SERIES.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtDay} tickLine={false} axisLine={{ stroke: SERIES.grid }} tickCount={8} />
          <YAxis scale="log" domain={[0.1, top]} ticks={ticks} allowDataOverflow width={44} tickLine={false} axisLine={false} tickFormatter={(v: number) => String(v)} />
          <ReferenceLine y={10} stroke={SERIES.red} strokeDasharray="5 4" label={{ value: "S1 storm threshold · 10 pfu", position: "insideTopRight", fill: SERIES.ink, fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: SERIES.soft, strokeOpacity: 0.5 }}
            contentStyle={{ background: "#090e1d", border: "1px solid #2a3866", borderRadius: 6, fontSize: 12 }}
            labelFormatter={(t) => `${new Date(Number(t)).toISOString().slice(0, 16).replace("T", " ")} UTC`}
            formatter={(v) => [`${Number(v).toFixed(2)} pfu`, "≥10 MeV protons"]}
          />
          <Line dataKey="flux" stroke={SERIES.measured} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#141e3d", strokeWidth: 2 }} isAnimationActive={!reduced} animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
