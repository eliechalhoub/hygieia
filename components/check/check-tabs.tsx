"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addJournal, logMetrics, saveCheckin } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Slider, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui/controls";
import { IconLock } from "@/components/icons";
import { PvtTest, VisionCheck } from "./self-tests";

interface Props {
  astronautId: number;
  name: string;
  day: number;
  initialTab: string;
  today: Record<string, number | null>;
  usual: Record<string, number | null>;
  metrics: { id: string; label: string; unit: string }[];
  journal: { id: number; missionDay: number; body: string }[];
  crewTimeToday: number | null;
}

const TIPS = [
  "Keep one shared meal a day with the crew, even a short one.",
  "Hold a fixed wake time. Bright light in the first hour awake.",
  "Do one thing today that is not on the timeline: music, a photo, a message home.",
  "If your mood stays low for three days, say so in a note to the flight surgeon. That is what the link is for.",
];

export function CheckTabs(p: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [saved, setSaved] = React.useState<string | null>(null);
  const [hydration, setHydration] = React.useState(String(p.today.hydration ?? ""));
  const [calories, setCalories] = React.useState(String(p.today.calories ?? ""));
  const [exercise, setExercise] = React.useState(String(p.today.exercise_min ?? ""));
  const [mood, setMood] = React.useState<number>(p.today.mood ?? 7);
  const [headache, setHeadache] = React.useState(false);
  const [crewTime, setCrewTime] = React.useState(String(p.crewTimeToday ?? 1));
  const [manualMetric, setManualMetric] = React.useState("sleep_hours");
  const [manualValue, setManualValue] = React.useState("");
  const [entry, setEntry] = React.useState("");

  const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

  const saveLog = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const values: Record<string, number> = {};
      const h = num(hydration); if (h !== null) values.hydration = h;
      const c = num(calories); if (c !== null) values.calories = c;
      const x = num(exercise); if (x !== null) values.exercise_min = x;
      if (Object.keys(values).length) await logMetrics(p.astronautId, values);
      await saveCheckin(p.astronautId, { mood, headache, crewTimeHours: num(crewTime) ?? 0 });
      setSaved("Saved. Rules and standing orders re-checked.");
      router.refresh();
    });
  };

  const saveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const v = num(manualValue);
    if (v === null) return;
    start(async () => {
      await logMetrics(p.astronautId, { [manualMetric]: v });
      setManualValue("");
      setSaved(`Saved ${p.metrics.find((m) => m.id === manualMetric)?.label}. Rules and standing orders re-checked.`);
      router.refresh();
    });
  };

  const hint = (id: string, unit: string) => (p.usual[id] !== null && p.usual[id] !== undefined ? `Your usual: ${p.usual[id]} ${unit}` : undefined);

  return (
    <Tabs defaultValue={p.initialTab}>
      <TabsList>
        <TabsTrigger value="log" data-testid="tab-log">Daily log</TabsTrigger>
        <TabsTrigger value="pvt" data-testid="tab-pvt">Reaction test</TabsTrigger>
        <TabsTrigger value="vision" data-testid="tab-vision">Vision check</TabsTrigger>
        <TabsTrigger value="journal" data-testid="tab-journal">Private journal</TabsTrigger>
      </TabsList>

      <TabsContent value="log" className="space-y-6">
        <form onSubmit={saveLog} data-testid="log-form" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fluids today (L)" hint={hint("hydration", "L")}><Input data-testid="log-hydration" type="number" step="any" min={0} max={8} value={hydration} onChange={(e) => setHydration(e.target.value)} /></Field>
            <Field label="Energy intake (kcal)" hint={hint("calories", "kcal")}><Input data-testid="log-calories" type="number" step="any" min={0} max={6000} value={calories} onChange={(e) => setCalories(e.target.value)} /></Field>
            <Field label="Exercise (min)" hint={hint("exercise_min", "min")}><Input data-testid="log-exercise" type="number" step="any" min={0} max={300} value={exercise} onChange={(e) => setExercise(e.target.value)} /></Field>
          </div>
          <div className="rounded-lg border border-line bg-bg-alt/60 p-3">
            <div className="flex items-baseline justify-between">
              <label htmlFor="mood-slider" className="text-sm font-medium">Mood check-in</label>
              <span className="num text-sm" data-testid="mood-value">{mood.toFixed(1)} / 10</span>
            </div>
            <Slider id="mood-slider" aria-label="Mood, 1 to 10" min={1} max={10} step={0.5} value={[mood]} onValueChange={(v) => setMood(v[0])} className="mt-1" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Shared crew time today (h)" hint="Meals, games, talk. A recovery lever."><Input type="number" step="any" min={0} max={12} value={crewTime} onChange={(e) => setCrewTime(e.target.value)} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={headache} onChange={(e) => setHeadache(e.target.checked)} className="h-4 w-4 accent-[#3dd6c4]" />
                Headache today (feeds the cabin-air check)
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" data-testid="log-save" disabled={pending}>{pending ? "Saving…" : `Save Day ${p.day} log`}</Button>
            {saved && <span data-testid="log-saved" className="text-sm text-ok">{saved}</span>}
          </div>
        </form>

        <form onSubmit={saveManual} data-testid="manual-form" className="rounded-lg border border-line p-3">
          <h3 className="font-display text-sm font-semibold">Enter a reading by hand</h3>
          <p className="mb-2 text-xs text-soft">Use it when a sensor is off. A new reading re-runs the rules and standing orders at once.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Measure">
              <Select data-testid="manual-metric" value={manualMetric} onChange={(e) => setManualMetric(e.target.value)}>
                {p.metrics.map((m) => (<option key={m.id} value={m.id}>{m.label}{m.unit ? ` (${m.unit})` : ""}</option>))}
              </Select>
            </Field>
            <Field label="Value" hint={hint(manualMetric, p.metrics.find((m) => m.id === manualMetric)?.unit ?? "")}>
              <Input data-testid="manual-value" type="number" step="any" required value={manualValue} onChange={(e) => setManualValue(e.target.value)} className="w-32" />
            </Field>
            <Button type="submit" variant="secondary" data-testid="manual-save" disabled={pending}>Save reading</Button>
          </div>
        </form>

        <div className="rounded-lg border border-line p-3">
          <h3 className="font-display text-sm font-semibold">If the days feel long</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-soft">{TIPS.map((t) => (<li key={t}>{t}</li>))}</ul>
          <p className="mt-2 text-xs text-soft">General coping tips for isolation, not medical advice.</p>
        </div>
      </TabsContent>

      <TabsContent value="pvt"><PvtTest astronautId={p.astronautId} baselineRt={p.usual.pvt_rt ?? null} /></TabsContent>
      <TabsContent value="vision"><VisionCheck astronautId={p.astronautId} baseline={p.usual.vision_score ?? null} /></TabsContent>

      <TabsContent value="journal" className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-soft"><IconLock /> Private to {p.name}. Never shared with Earth. Houston and the AI assistant have no way to read it.</p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!entry.trim()) return; start(async () => { await addJournal(p.astronautId, entry); setEntry(""); router.refresh(); }); }}
          className="space-y-2"
        >
          <Textarea data-testid="journal-input" aria-label="Journal entry" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder={`Day ${p.day}…`} className="min-h-28" />
          <Button type="submit" data-testid="journal-save" disabled={pending || !entry.trim()}>Save entry</Button>
        </form>
        <ul className="space-y-2">
          {p.journal.map((j) => (
            <li key={j.id} className="rounded-lg border border-line bg-bg-alt/60 px-3 py-2 text-sm">
              <span className="label">Day {j.missionDay}</span>
              <p className="mt-0.5 whitespace-pre-wrap text-ink">{j.body}</p>
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
