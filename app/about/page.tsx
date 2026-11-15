import Link from "next/link";
import { SourceLink } from "@/components/source-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadKb } from "@/lib/server/kb";

export const dynamic = "force-dynamic";

const HAZARDS: { hazard: string; response: string }[] = [
  { hazard: "Space radiation", response: "Dose model per environment built on published measurements, a neutron channel, cumulative dose against the plan, real solar particle events replayed from NASA DONKI, and a storm-shelter checklist." },
  { hazard: "Isolation and confinement", response: "Mood check-in, sleep and light tracking, shared crew time as a recovery lever, cooperative team goals, and a journal that stays private." },
  { hazard: "Distance from Earth", response: "Triage that works with no network, standing orders written in advance, a delayed-link queue, and compressed incident reports." },
  { hazard: "Gravity fields", response: "Exercise-prescription tracking, balance and eye regions on the body map, and gravity-transition checks in the surface profiles." },
  { hazard: "Hostile/closed environments", response: "Cabin CO₂, pressure, temperature, noise and light feed alerts and triage, plus an infection early warning." },
];

const HONESTY = [
  "Radiation, space-weather and link-delay figures come from space-agency data, and each one links to its source.",
  "Bone loss is inferred from exercise adherence. It is not measured.",
  "The AI chat uses a cloud API that a Mars crew would not have. It stands in for a future onboard model. Triage, alerts, standing orders and scoring never depend on it.",
  "The 22-minute delay is the worst-case one-way Earth–Mars light time. The app shortens the wait to 20 seconds so it can be watched.",
  "Solar particle events on the mission timeline follow the timing of real events recorded by NASA DONKI.",
  "Voice commands use the browser's speech recognition, which in Chrome and Edge needs a network. Buttons, typed commands and read-aloud prompts work offline.",
  "The triage trees follow general first-aid logic. A flight surgeon would approve the protocols flown on a mission.",
];

const SI_USE = [
  "Code: most of the application code, tests and the data-fetch scripts were written and debugged with Claude Code (Anthropic), directed and reviewed by the team.",
  "Visual design: the interface, the body map, the heart graphic and trace, and the logo are SI-generated, drawn as code (SVG and CSS). No image-generation model was used.",
  "Writing and translation: the README, the documentation, the knowledge-base notes and the French and Arabic interface text were drafted with SI.",
  "Research: SI was used to check each dataset and link on the Sources page against its original page.",
  "In the app: the Ask Hygieia chat is answered by an OpenAI language model. Its responses are SI-generated. Scoring, alerts, forecasts, standing orders and triage are ordinary code and do not use SI.",
];

const TEAM = ["Joelle El Homsi", "Elie Chalhoub", "Rahma Bezzaouia", "Ahmad Abu Zainab"];

const BUILT_WITH: { name: string; use: string }[] = [
  { name: "Google Cloud", use: "The app runs as a container on Cloud Run. The database is rebuilt from the seed on every cold start." },
  { name: "GoDaddy", use: "Domain name pointing at the hosted app, and hosting for the static project page." },
  { name: "Microsoft", use: "GitHub Copilot and Teams for the team; an optional mirror on Azure." },
  { name: "Miro", use: "Architecture and storyline boards for the pitch." },
  { name: "Meteomatics", use: "Not used. Earth mode takes its outdoor heat data from NASA POWER, which needs no account." },
];

const COVERAGE = [
  { id: "monitored", title: "Monitored", note: "Tracked every day against each astronaut's own baseline." },
  { id: "self-check", title: "Self-check or triage only", note: "Hygieia prompts a check or guides an emergency; it has no continuous measurement." },
  { id: "knowledge-base", title: "Knowledge base only", note: "Explained, not observed." },
];

export default function AboutPage() {
  const risks = loadKb().filter((n) => n.kind === "risk");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="label">NASA Space Apps 2026 · Create Health Monitoring Software for Astronauts on Space Missions</p>
        <h1 className="font-display text-3xl font-semibold">About Hygieia</h1>
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink">
          Hygieia is named after the Greek goddess of health. It is an onboard crew-health assistant for deep-space missions, where the flight surgeon
          can be up to 22 minutes away each way. It learns each astronaut&apos;s personal baseline, says in plain words when they drift from it and why,
          proposes the smallest change that brings them back to green, checks who is fit for upcoming tasks, and guides the crew through a medical
          emergency without waiting for Earth.
        </p>
        <p className="mt-2 text-sm text-soft">The challenge was authored by the Brazilian Space Agency (AEB).</p>
      </div>

      <Card id="honesty" className="scroll-mt-20">
        <CardHeader><CardTitle>How it works, and its limits</CardTitle></CardHeader>
        <CardContent>
          <ul data-testid="honesty-notes" className="list-disc space-y-1.5 pl-5 text-sm text-ink">{HONESTY.map((h) => (<li key={h}>{h}</li>))}</ul>
          <p className="mt-3 text-sm text-soft">Out of scope: sign-in, encryption, real device integration, regulatory compliance. See every source on the <Link href="/sources" className="text-teal hover:underline">Sources page</Link>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>NASA&apos;s five hazards of human spaceflight, and what Hygieia does about each</CardTitle>
          <SourceLink id="nasa-hrp-hazards" />
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {HAZARDS.map((h) => (
                <tr key={h.hazard} className="border-t border-line align-top first:border-t-0">
                  <th scope="row" className="w-48 py-2 pr-4 text-left font-display font-semibold text-ink">{h.hazard}</th>
                  <td className="py-2 text-soft">{h.response}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card data-testid="risks-card">
        <CardHeader>
          <div>
            <CardTitle>NASA&apos;s 17 human research risks: honest coverage</CardTitle>
            <p className="text-xs text-soft">Each links to its knowledge-base note.</p>
          </div>
          <SourceLink id="nasa-hrp-risks" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {COVERAGE.map((c) => {
            const list = risks.filter((r) => r.coverage === c.id);
            return (
              <div key={c.id}>
                <h3 className="font-display text-sm font-semibold text-ink">{c.title} <span className="num text-soft">({list.length})</span></h3>
                <p className="text-xs text-soft">{c.note}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {list.map((r) => (<li key={r.slug}><Link href={`/kb#${r.slug}`} className="text-teal hover:underline">{r.title.replace(/^Risk of /, "")}</Link></li>))}
                </ul>
              </div>
            );
          })}
          <p className="text-xs text-soft md:col-span-3">
            Bone changes are followed through exercise adherence, which is a proxy. Radiation-induced cancer is covered by dose tracking only.
            NASA describes SANS as its leading spaceflight-related health risk; Hygieia offers a self-check, not a measurement.
          </p>
        </CardContent>
      </Card>

      <Card id="si" className="scroll-mt-20" data-testid="si-use">
        <CardHeader><CardTitle>Use of SI</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            {SI_USE.map((s) => (<li key={s}>{s}</li>))}
          </ul>
          <p className="mt-3 text-xs text-soft">No SI-generated content uses NASA logos, flags or mission identifiers. Crew members and their health readings are simulated.</p>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Team Jovian Elites</CardTitle></CardHeader>
          <CardContent>
            <ul data-testid="team" className="space-y-1 text-sm text-ink">{TEAM.map((t) => (<li key={t}>{t}</li>))}</ul>
            <p className="mt-3 text-sm text-soft">
              The same engine and offline triage serve remote communities on Earth, where a clinician is also far away: choose the Remote clinic profile to try it.
              See also the Canadian Space Agency on why space science matters on the ground. <SourceLink id="csa-why-science" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Built with</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {BUILT_WITH.map((b) => (<li key={b.name}><span className="font-semibold text-ink">{b.name}.</span> <span className="text-soft">{b.use}</span></li>))}
            </ul>
            <p className="mt-3 text-xs text-soft">Next.js, React, TypeScript, Tailwind CSS, Recharts, SQLite with Drizzle, the OpenAI API for chat.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
