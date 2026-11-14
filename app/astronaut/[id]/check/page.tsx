import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckTabs } from "@/components/check/check-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { METRICS, formatValue } from "@/lib/engine";
import { getCheckin, getCrewAnalyses, getJournal, getMission } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function CheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const mission = getMission();
  const me = getCrewAnalyses(mission).find((c) => c.astronaut.id === Number(id));
  if (!me) notFound();
  const { astronaut, analysis, series } = me;
  const day = mission.currentDay;
  const today: Record<string, number | null> = {};
  const usual: Record<string, number | null> = {};
  for (const m of METRICS) {
    today[m.id] = (series[m.id] ?? []).find((s) => s.day === day)?.value ?? null;
    const b = analysis.metrics[m.id].baseline;
    usual[m.id] = b.sufficient ? Number(formatValue(m.id, b.median)) : null;
  }
  const tab = ["log", "pvt", "vision", "journal"].includes(sp.tab ?? "") ? sp.tab! : "log";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Daily check · Day {day}</p>
          <h1 className="font-display text-2xl font-semibold">{astronaut.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={analysis.status} />
          <Link href={`/astronaut/${astronaut.id}`} className="text-sm text-teal hover:underline">← Back to dashboard</Link>
        </div>
      </div>
      <Card>
        <CardContent className="pt-5">
          <CheckTabs
            astronautId={astronaut.id}
            name={astronaut.name}
            day={day}
            initialTab={tab}
            today={today}
            usual={usual}
            metrics={METRICS.filter((m) => m.id !== "dose_daily").map((m) => ({ id: m.id, label: m.label, unit: m.unit }))}
            journal={getJournal(astronaut.id).map((j) => ({ id: j.id, missionDay: j.missionDay, body: j.body }))}
            crewTimeToday={getCheckin(astronaut.id, day)?.crewTimeHours ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
