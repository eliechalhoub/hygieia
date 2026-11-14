"use client";

import * as React from "react";
import type { RegionId, Status } from "@/lib/engine/types";
import { BodyMap, type BodyRegion } from "@/components/body-map";
import { TrendChart, type TrendChartProps } from "@/components/charts/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ScoreView {
  score: number;
  status: Status;
  blendWorstPct: number;
  contributions: { region: RegionId; label: string; weightPct: number; points: number; worst: string | null; isWorstRegion: boolean }[];
  weightsNote: string;
}

interface Props {
  regions: BodyRegion[];
  charts: (TrendChartProps & { region: RegionId })[];
  defaultMetrics: string[];
  children?: React.ReactNode;
}

/** Body map beside the recovery plan, then the trend charts for the selected region. */
export function AstronautDashboard({ regions, charts, defaultMetrics, children }: Props) {
  const [region, setRegion] = React.useState<RegionId | null>(null);
  const drifting = charts.filter((c) => c.status === "amber" || c.status === "red").map((c) => c.metric);
  const shown = region
    ? charts.filter((c) => c.region === region)
    : charts.filter((c) => drifting.includes(c.metric) || defaultMetrics.includes(c.metric))
        .sort((a, b) => Number(drifting.includes(b.metric)) - Number(drifting.includes(a.metric)))
        .slice(0, 6);
  const regionLabel = region ? regions.find((r) => r.id === region)?.label : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card id="body">
          <CardHeader>
            <CardTitle>Body map</CardTitle>
            <span className="chip">Tap a region</span>
          </CardHeader>
          <CardContent><BodyMap regions={regions} selected={region} onSelect={setRegion} /></CardContent>
        </Card>
        <div id="recovery" className="space-y-6">{children}</div>
      </div>

      <section id="trends" aria-label="Trends">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">{regionLabel ? `Trends · ${regionLabel}` : "Trends"}</h2>
          {region
            ? <button type="button" onClick={() => setRegion(null)} className="chip cursor-pointer !text-teal hover:border-teal">Show all regions ✕</button>
            : <span className="chip">Drifting measures first</span>}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-soft">No readings for this region yet.</p>
        ) : (
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (<TrendChart key={c.metric} {...c} />))}
          </div>
        )}
      </section>
    </div>
  );
}
