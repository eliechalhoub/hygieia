"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { savePvt, saveVision } from "@/lib/actions";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Cognitive readiness: a 60-second psychomotor vigilance test (PVT).
// A signal appears after a random wait; tap as fast as you can.
// ---------------------------------------------------------------------------

const PVT_SECONDS = 60;
const LAPSE_MS = 500;

export function PvtTest({ astronautId, baselineRt, seconds = PVT_SECONDS }: { astronautId: number; baselineRt: number | null; seconds?: number }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<"idle" | "wait" | "go" | "done">("idle");
  const [times, setTimes] = React.useState<number[]>([]);
  const [falseStarts, setFalseStarts] = React.useState(0);
  const [left, setLeft] = React.useState(seconds);
  const [lastRt, setLastRt] = React.useState<number | null>(null);
  const [saved, setSaved] = React.useState(false);
  const goAt = React.useRef(0);
  const endAt = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  const timesRef = React.useRef<number[]>([]);

  const clear = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };

  const finish = React.useCallback(() => {
    clear();
    setPhase("done");
  }, []);

  const arm = React.useCallback(() => {
    clear();
    if (performance.now() >= endAt.current) return finish();
    setPhase("wait");
    const wait = 1000 + Math.random() * 3000; // random interval 1–4 s
    timer.current = window.setTimeout(() => {
      if (performance.now() >= endAt.current) return finish();
      goAt.current = performance.now();
      setPhase("go");
    }, wait);
  }, [finish]);

  const start = () => {
    timesRef.current = [];
    setTimes([]);
    setFalseStarts(0);
    setLastRt(null);
    setSaved(false);
    setLeft(seconds);
    endAt.current = performance.now() + seconds * 1000;
    arm();
  };

  React.useEffect(() => {
    if (phase !== "wait" && phase !== "go") return;
    const t = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) finish();
    }, 200);
    return () => window.clearInterval(t);
  }, [phase, finish]);

  React.useEffect(() => () => clear(), []);

  const tap = () => {
    if (phase === "go") {
      const rt = Math.round(performance.now() - goAt.current);
      timesRef.current = [...timesRef.current, rt];
      setTimes(timesRef.current);
      setLastRt(rt);
      arm();
    } else if (phase === "wait") {
      setFalseStarts((n) => n + 1);
      arm();
    }
  };

  const mean = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const lapses = times.filter((t) => t > LAPSE_MS).length;

  const save = async () => {
    await savePvt(astronautId, { meanRtMs: mean, lapses, trials: times.length });
    setSaved(true);
    router.refresh();
  };

  return (
    <div data-testid="pvt" className="space-y-3">
      <p className="text-sm text-soft">
        {seconds}-second reaction test. Wait for the panel to turn teal, then tap it (or press Space) as fast as you can. A lapse is a reaction slower than {LAPSE_MS} ms.
      </p>
      {phase === "idle" && <Button data-testid="pvt-start" size="lg" onClick={start}>Start {seconds}-second test</Button>}
      {(phase === "wait" || phase === "go") && (
        <>
          <button
            type="button" data-testid="pvt-pad" data-phase={phase} onPointerDown={tap}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tap(); } }}
            autoFocus
            className={`flex h-64 w-full cursor-pointer select-none items-center justify-center rounded-2xl border-4 font-display text-4xl font-bold ${phase === "go" ? "border-teal bg-teal text-bg" : "border-line bg-bg-alt text-soft"}`}
          >
            {phase === "go" ? "TAP" : "Wait…"}
          </button>
          <p className="num text-sm text-soft">{left} s left · {times.length} taps{lastRt !== null ? ` · last ${lastRt} ms` : ""}{falseStarts ? ` · ${falseStarts} early` : ""}</p>
        </>
      )}
      {phase === "done" && (
        <div data-testid="pvt-result" className="rounded-lg border border-line bg-bg-alt/60 p-4">
          {times.length === 0 ? <p className="text-warn">No taps recorded. Try again.</p> : (
            <>
              <p className="num font-display text-3xl font-semibold">{mean} ms <span className="text-base font-normal text-soft">mean reaction time</span></p>
              <p className="num text-sm text-soft">{lapses} lapse{lapses === 1 ? "" : "s"} over {LAPSE_MS} ms · {times.length} taps · {falseStarts} early taps</p>
              {baselineRt !== null && (
                <p className="mt-1 text-sm text-ink">
                  Your usual: <span className="num">{Math.round(baselineRt)} ms</span>. Today is <span className="num">{Math.abs(mean - Math.round(baselineRt))} ms</span> {mean > baselineRt ? "slower" : "faster"}.
                </p>
              )}
              <p className="mt-1 text-xs text-soft">Screen and pointer timing vary between devices, so compare against your own baseline on this device only.</p>
            </>
          )}
          <div className="mt-3 flex gap-2">
            {times.length > 0 && !saved && <Button data-testid="pvt-save" onClick={save}>Save to my record</Button>}
            {saved && <span className="text-sm text-ok">Saved. Alerts re-checked.</span>}
            <Button variant="outline" onClick={start}>Run again</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vision self-check (SANS screening prompt, not a diagnosis):
// 30 s of acuity trials, an Amsler-style grid, and two yes/no questions.
// ---------------------------------------------------------------------------

const DIRECTIONS = ["up", "right", "down", "left"] as const;
type Dir = (typeof DIRECTIONS)[number];
const ROTATION: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };
const SIZES = [64, 48, 36, 28, 22, 17, 13, 10, 8, 6];
const ACUITY_SECONDS = 30;

function LandoltC({ size, dir }: { size: number; dir: Dir }) {
  // A ring with a gap; the gap points in `dir`.
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ transform: `rotate(${ROTATION[dir]}deg)` }}>
      <path d="M 88 62 A 40 40 0 1 1 88 38" fill="none" stroke="#eef2f8" strokeWidth="20" />
    </svg>
  );
}

export function VisionCheck({ astronautId, baseline }: { astronautId: number; baseline: number | null }) {
  const router = useRouter();
  const [step, setStep] = React.useState<"intro" | "acuity" | "grid" | "questions" | "done">("intro");
  const [trial, setTrial] = React.useState(0);
  const [dir, setDir] = React.useState<Dir>("right");
  const [smallest, setSmallest] = React.useState<number | null>(null);
  const [misses, setMisses] = React.useState(0);
  const [left, setLeft] = React.useState(ACUITY_SECONDS);
  const [grid, setGrid] = React.useState<boolean | null>(null);
  const [blur, setBlur] = React.useState<boolean | null>(null);
  const [headache, setHeadache] = React.useState<boolean | null>(null);
  const [score, setScore] = React.useState<number | null>(null);
  const endAt = React.useRef(0);

  const next = (t: number) => {
    setTrial(t);
    setDir(DIRECTIONS[Math.floor(Math.random() * 4)]);
  };

  const begin = () => {
    setSmallest(null);
    setMisses(0);
    setLeft(ACUITY_SECONDS);
    endAt.current = performance.now() + ACUITY_SECONDS * 1000;
    next(0);
    setStep("acuity");
  };

  React.useEffect(() => {
    if (step !== "acuity") return;
    const t = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) setStep("grid");
    }, 200);
    return () => window.clearInterval(t);
  }, [step]);

  const answer = (d: Dir) => {
    if (d === dir) {
      setSmallest(trial);
      if (trial >= SIZES.length - 1) return setStep("grid");
      next(trial + 1);
    } else {
      const m = misses + 1;
      setMisses(m);
      if (m >= 2) return setStep("grid");
      next(trial); // same size, new direction
    }
  };

  // Acuity score: how far down the size ladder the answers stayed correct.
  const acuityScore = smallest === null ? 30 : Math.round(40 + (60 * (smallest + 1)) / SIZES.length);

  const finish = async () => {
    const res = await saveVision(astronautId, { acuityScore, gridDistortion: grid === true, blurNear: blur === true, headache: headache === true });
    setScore(res.score);
    setStep("done");
    router.refresh();
  };

  const yesNo = (value: boolean | null, set: (v: boolean) => void, id: string) => (
    <div className="flex gap-2">
      <Button data-testid={`${id}-yes`} variant={value === true ? "coral" : "outline"} onClick={() => set(true)}>Yes</Button>
      <Button data-testid={`${id}-no`} variant={value === false ? "default" : "outline"} onClick={() => set(false)}>No</Button>
    </div>
  );

  return (
    <div data-testid="vision" className="space-y-3">
      <p className="text-sm text-soft">
        Vision self-check: 30 seconds of gap-direction trials, a grid, and two questions. Hold the screen at arm&apos;s length, one eye at a time if asked by the flight surgeon.
        This is a screening prompt, not a diagnosis.
      </p>
      {step === "intro" && <Button data-testid="vision-start" size="lg" onClick={begin}>Start vision check</Button>}

      {step === "acuity" && (
        <div className="rounded-lg border border-line bg-bg-alt/60 p-4">
          <p className="label">Which way does the gap point? · {left} s left</p>
          <div data-testid="vision-target" data-dir={dir} className="my-4 flex h-28 items-center justify-center"><LandoltC size={SIZES[trial]} dir={dir} /></div>
          <div className="mx-auto grid w-56 grid-cols-3 gap-2">
            <span />
            <Button data-testid="vision-up" variant="secondary" onClick={() => answer("up")}>↑ Up</Button>
            <span />
            <Button data-testid="vision-left" variant="secondary" onClick={() => answer("left")}>← Left</Button>
            <Button variant="ghost" onClick={() => setStep("grid")}>Can&apos;t tell</Button>
            <Button data-testid="vision-right" variant="secondary" onClick={() => answer("right")}>Right →</Button>
            <span />
            <Button data-testid="vision-down" variant="secondary" onClick={() => answer("down")}>↓ Down</Button>
            <span />
          </div>
        </div>
      )}

      {step === "grid" && (
        <div className="rounded-lg border border-line bg-bg-alt/60 p-4">
          <p className="text-sm text-ink">Look at the dot in the centre. Without moving your eye: do any lines look wavy, blurred or missing?</p>
          <svg viewBox="0 0 200 200" className="mx-auto my-3 h-56 w-56 bg-bg" role="img" aria-label="Grid of straight lines with a dot in the centre">
            {Array.from({ length: 21 }, (_, i) => (
              <g key={i} stroke="#eef2f8" strokeWidth="0.8">
                <line x1={i * 10} y1="0" x2={i * 10} y2="200" />
                <line x1="0" y1={i * 10} x2="200" y2={i * 10} />
              </g>
            ))}
            <circle cx="100" cy="100" r="4" fill="#ff8a5b" />
          </svg>
          {yesNo(grid, (v) => { setGrid(v); setStep("questions"); }, "grid")}
        </div>
      )}

      {step === "questions" && (
        <div className="space-y-3 rounded-lg border border-line bg-bg-alt/60 p-4">
          <div>
            <p className="mb-1 text-sm text-ink">1. Is close-up reading blurrier than last week?</p>
            {yesNo(blur, setBlur, "blur")}
          </div>
          <div>
            <p className="mb-1 text-sm text-ink">2. Any headache behind the eyes today?</p>
            {yesNo(headache, setHeadache, "eyeache")}
          </div>
          <Button data-testid="vision-finish" disabled={blur === null || headache === null} onClick={finish}>Save result</Button>
        </div>
      )}

      {step === "done" && score !== null && (
        <div data-testid="vision-result" className="rounded-lg border border-line bg-bg-alt/60 p-4">
          <p className="num font-display text-3xl font-semibold">{score} <span className="text-base font-normal text-soft">/ 100 screening score</span></p>
          {baseline !== null && <p className="text-sm text-ink">Your usual: <span className="num">{Math.round(baseline)}</span>.</p>}
          <p className="mt-1 text-sm text-soft">
            {grid || blur ? "You reported a change. Repeat tomorrow and share the result with the flight surgeon." : "No change reported."}{" "}
            Screening prompt only — it cannot diagnose SANS.
          </p>
          <Button className="mt-3" variant="outline" onClick={() => setStep("intro")}>Run again</Button>
        </div>
      )}
    </div>
  );
}
