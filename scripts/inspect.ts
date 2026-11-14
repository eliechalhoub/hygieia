/**
 * npm run inspect [-- --day 143]
 * Prints what the engine concludes for each crew member: a quick way to check
 * the scripted storyline after changing the seed or the engine.
 */
import { getHandle } from "@/lib/db/client";
import { METRICS, buildSimState, findPathToGreen, greenDayFor, simulatePlan } from "@/lib/engine";
import { engineConfigFor } from "@/lib/profiles";
import { getCrewAnalyses, getMission, getUpcomingTasks, getAlerts } from "@/lib/server/queries";

const i = process.argv.indexOf("--day");
const handle = getHandle();
const base = getMission();
const mission = { ...base, currentDay: i >= 0 ? Number(process.argv[i + 1]) : base.currentDay };
const config = engineConfigFor(mission.profile);
const crew = getCrewAnalyses(mission);
console.log(`Day ${mission.currentDay} — profile ${mission.profile.id}`);
for (const c of crew) {
  const a = c.analysis;
  console.log(`\n${c.astronaut.shortName}: ${a.status.toUpperCase()} score ${a.score.score}`);
  for (const def of METRICS) {
    const m = a.metrics[def.id];
    if (m.status === "amber" || m.status === "red" || process.argv.includes("--all")) {
      const fc = a.forecasts[def.id];
      console.log(`  ${def.id.padEnd(18)} ${String(m.value).padStart(7)} z=${m.z?.toFixed(2)} bad=${m.badness.toFixed(2)} ${m.status} base=${m.baseline.median.toFixed(2)}±${m.baseline.scale.toFixed(2)} fc=${fc ? (fc.abstained ? "abstain" : fc.points.map((p) => p.value.toFixed(1)).join(",")) : "-"}`);
    }
  }
  console.log(`  anomaly: d2=${a.anomaly.distance2.toFixed(1)} cutoff=${a.anomaly.cutoff.toFixed(1)} ${a.anomaly.isAnomaly ? "ANOMALY" : "ok"} ${a.anomaly.contributors.map((x) => `${x.metric}:${x.share.toFixed(2)}`).join(" ")}`);
  console.log(`  explain: ${a.explanation}`);
  const state = buildSimState(a.metrics, c.series, mission.currentDay);
  const path = findPathToGreen(state, mission.currentDay, config.thresholds, config.regionWeights);
  console.log(`  path: ${path.summary} -> green ${path.result?.greenDay ?? "-"} effort ${path.effort.toFixed(2)} (do nothing: ${greenDayFor(path.doNothing, path.unaddressable) ?? "never in 7 d"})`);
  if (path.plan) {
    for (const h of [5, 6, 6.5, 7, 7.5, 8, 9]) {
      const r = simulatePlan(state, { ...path.plan, sleepHours: h }, mission.currentDay, config.thresholds, config.regionWeights);
      console.log(`    slider sleep ${h} h -> green ${greenDayFor(r, path.unaddressable) ?? "none"}  scores ${r.days.map((d) => d.score).join(",")}`);
    }
  }
  for (const al of getAlerts(mission.currentDay, c.astronaut.id)) console.log(`  ALERT [${al.severity}] ${al.title} — ${al.reason}`);
}
for (const t of getUpcomingTasks(mission, crew)) {
  console.log(`\nTASK Day ${t.task.missionDay} ${t.task.kind} "${t.task.title}": ${t.go ? "GO" : "NO-GO"} (needs ${t.threshold})`);
  for (const r of t.crew) console.log(`  ${r.name}: ${r.go ? "go" : "not ready"} — ${r.reason}`);
  for (const s of t.swaps) console.log(`  swap ${s.outName} -> ${s.inName}: ${s.reason}`);
}
handle.sqlite.close();
