import { TriageApp } from "@/components/triage/triage-app";
import { KIT_LABELS } from "@/lib/profiles";
import { getCrew, getEnvironment, getMission } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

/** Emergency mode. After this page has loaded it needs no network and no AI. */
export default async function TriagePage({ searchParams }: { searchParams: Promise<{ astronaut?: string }> }) {
  const sp = await searchParams;
  const mission = getMission();
  const crew = getCrew();
  const env = getEnvironment(mission.currentDay, 1);
  const co2 = env.length ? env.reduce((a, e) => a + e.co2MmHg, 0) / env.length : null;
  const id = Number(sp.astronaut);
  return (
    <TriageApp
      profile={{
        id: mission.profile.id, label: mission.profile.label, kit: mission.profile.kit, triage_extras: mission.profile.triage_extras,
        cpr_method: mission.profile.cpr_method, spo2RedBelow: mission.profile.thresholds.hard.spo2?.redBelow ?? 90,
      }}
      kitLabels={KIT_LABELS}
      crew={crew.map((c) => ({ id: c.id, name: c.name }))}
      initialAstronautId={crew.some((c) => c.id === id) ? id : null}
      missionDay={mission.currentDay}
      delaySeconds={mission.commsDelaySeconds}
      cabin={{ co2, co2Amber: mission.profile.thresholds.cabin.co2_mmHg.amber }}
    />
  );
}
