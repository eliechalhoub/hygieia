"use client";

import * as React from "react";

export const CPR_BPM = 110;

/**
 * Web Audio metronome. Clicks are scheduled slightly ahead on the audio clock,
 * so the beat stays steady even when the page is busy. No network, no files.
 */
export function useMetronome(running: boolean, bpm = CPR_BPM) {
  const [count, setCount] = React.useState(0);
  const [seconds, setSeconds] = React.useState(0);
  const [audioOk, setAudioOk] = React.useState(true);

  React.useEffect(() => {
    if (!running) return;
    setCount(0);
    setSeconds(0);
    const interval = 60 / bpm;
    const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try {
      ctx = Ctor ? new Ctor() : null;
      ctx?.resume().catch(() => setAudioOk(false));
    } catch {
      ctx = null;
    }
    if (!ctx) setAudioOk(false);

    const started = performance.now();
    let nextAudio = ctx ? ctx.currentTime + 0.05 : 0;
    let beats = 0;
    const tick = () => {
      // Visual count follows wall-clock time, so it works even if audio is blocked.
      const elapsed = (performance.now() - started) / 1000;
      const due = Math.floor(elapsed / interval) + 1;
      if (due !== beats) { beats = due; setCount(due); }
      setSeconds(Math.floor(elapsed));
      if (ctx && ctx.state === "running") {
        while (nextAudio < ctx.currentTime + 0.12) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, nextAudio);
          gain.gain.exponentialRampToValueAtTime(0.5, nextAudio + 0.005);
          gain.gain.exponentialRampToValueAtTime(0.0001, nextAudio + 0.07);
          osc.connect(gain).connect(ctx.destination);
          osc.start(nextAudio);
          osc.stop(nextAudio + 0.08);
          nextAudio += interval;
        }
        setAudioOk(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 25);
    return () => {
      window.clearInterval(timer);
      ctx?.close().catch(() => {});
    };
  }, [running, bpm]);

  return { count, seconds, audioOk };
}

/** Evetts-Russomano method: the default microgravity CPR position. */
export function EvettsRussomanoDiagram() {
  return (
    <svg viewBox="0 0 320 210" className="h-auto w-full max-w-md" role="img" aria-label="Diagram of the Evetts-Russomano CPR method: the rescuer's legs are wrapped around the patient's torso, arms locked straight, pressing on the centre of the chest.">
      {/* Patient, lying across the frame */}
      <g stroke="#b4c0d6" strokeWidth="3" fill="#1b2850" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="42" cy="150" r="17" />
        <rect x="62" y="134" width="120" height="34" rx="15" />
        <path d="M182 144h78M182 160h78" fill="none" strokeWidth="13" stroke="#1b2850" />
        <path d="M182 144h78M182 160h78" fill="none" />
        <path d="M84 168l-6 26M150 168l8 26" fill="none" />
      </g>
      {/* Rescuer */}
      <g stroke="#3dd6c4" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="118" cy="30" r="15" fill="#0e1530" />
        <path d="M118 46l2 44" />
        {/* arms locked straight to the centre of the chest */}
        <path d="M112 54L104 132M124 54l8 78" />
        {/* legs wrapped around the torso, ankles crossed behind the back */}
        <path d="M120 90c-34 6-58 30-60 62 0 20 24 28 60 30" />
        <path d="M120 90c36 6 62 30 64 62 0 20-26 28-64 30" />
        <path d="M112 178l14 8M126 178l-14 8" />
      </g>
      <g fill="#ff8a5b">
        <circle cx="118" cy="134" r="6" />
      </g>
      <g fontFamily="var(--font-mono)" fontSize="10" fill="#eef2f8">
        <text x="140" y="60">arms locked</text>
        <text x="190" y="112">legs around torso</text>
        <text x="132" y="128" fill="#ff8a5b">push here</text>
        <text x="208" y="190" fill="#b4c0d6">patient</text>
      </g>
    </svg>
  );
}

/** Kneeling CPR for surface habitats (partial gravity). */
export function SurfaceKneelingDiagram() {
  return (
    <svg viewBox="0 0 320 190" className="h-auto w-full max-w-md" role="img" aria-label="Diagram of kneeling CPR on a surface: the rescuer kneels beside the patient with arms locked straight over the centre of the chest.">
      <path d="M10 172h300" stroke="#2a3866" strokeWidth="3" />
      <g stroke="#b4c0d6" strokeWidth="3" fill="#1b2850" strokeLinecap="round">
        <circle cx="46" cy="150" r="16" />
        <rect x="64" y="136" width="120" height="30" rx="14" />
        <path d="M184 146h86M184 160h86" fill="none" />
      </g>
      <g stroke="#3dd6c4" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="150" cy="36" r="15" fill="#0e1530" />
        <path d="M152 52l22 54" />
        <path d="M148 58L122 134M160 58l-28 76" />
        <path d="M174 106l34 20-6 44M174 106l52 30v34" />
      </g>
      <circle cx="126" cy="136" r="6" fill="#ff8a5b" />
      <g fontFamily="var(--font-mono)" fontSize="10" fill="#eef2f8">
        <text x="60" y="84">arms locked</text>
        <text x="216" y="108">kneel beside</text>
        <text x="72" y="128" fill="#ff8a5b">push here</text>
      </g>
    </svg>
  );
}
