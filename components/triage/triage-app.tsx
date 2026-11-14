"use client";

import * as React from "react";
import Link from "next/link";
import {
  TREES, TREE_ORDER, VITAL_LABELS, kitFor, matchTree, matchVoice, resolveNode,
  type IncidentReport, type TriageLogEntry, type TriageNode, type TriageTree,
} from "@/lib/triage";
import { cn, formatBytes, formatDelay } from "@/lib/utils";
import { IconBack, IconMic, IconX } from "@/components/icons";
import { CPR_BPM, EvettsRussomanoDiagram, SurfaceKneelingDiagram, useMetronome } from "./cpr";

export interface TriageProfile {
  id: string;
  label: string;
  kit: string[];
  triage_extras: string[];
  cpr_method: "evetts_russomano" | "surface_kneeling" | "standard";
  spo2RedBelow: number;
}

interface Props {
  profile: TriageProfile;
  kitLabels: Record<string, string>;
  crew: { id: number; name: string }[];
  initialAstronautId: number | null;
  missionDay: number;
  delaySeconds: number;
  cabin: { co2: number | null; co2Amber: number };
}

interface Receipt {
  rawBytes: number;
  gzipBytes: number;
  queued: boolean;
  deliverAt: number | null;
  sentAt: number;
}

const PENDING_KEY = "hygieia_pending_reports";

/** gzip in the browser with CompressionStream; returns the bytes and their base64 form. */
async function gzip(text: string): Promise<{ bytes: Uint8Array; b64: string }> {
  const raw = new TextEncoder().encode(text);
  let bytes = raw;
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { bytes, b64: btoa(bin) };
}

function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

type Recognition = { start: () => void; stop: () => void; abort: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

export function TriageApp({ profile, kitLabels, crew, initialAstronautId, missionDay, delaySeconds, cabin }: Props) {
  const [treeId, setTreeId] = React.useState<string | null>(null);
  const [nodeId, setNodeId] = React.useState<string>("");
  const [history, setHistory] = React.useState<string[]>([]);
  const [log, setLog] = React.useState<TriageLogEntry[]>([]);
  const [vitals, setVitals] = React.useState<Record<string, string>>({});
  const [causes, setCauses] = React.useState<string[]>([]);
  const [patientId, setPatientId] = React.useState<number | null>(initialAstronautId);
  const [speechOn, setSpeechOn] = React.useState(true);
  const [listening, setListening] = React.useState(false);
  const [voiceNote, setVoiceNote] = React.useState<string | null>(null);
  const [heard, setHeard] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const startedAt = React.useRef<string>(new Date().toISOString());
  const cprInfo = React.useRef({ started: false, compressions: 0, seconds: 0 });
  const recRef = React.useRef<Recognition | null>(null);
  const wantListen = React.useRef(false);

  const tree: TriageTree | null = treeId ? TREES[treeId] : null;
  const resolved = tree && nodeId ? resolveNode(tree, nodeId, profile) : null;
  const node: TriageNode | null = resolved?.node ?? null;
  const isCpr = node?.type === "cpr";
  const isEnd = node?.type === "end";
  const metronome = useMetronome(Boolean(isCpr));
  const patient = crew.find((c) => c.id === patientId)?.name ?? "Unidentified crew member";

  React.useEffect(() => {
    if (isCpr) cprInfo.current = { started: true, compressions: metronome.count, seconds: metronome.seconds };
  }, [isCpr, metronome.count, metronome.seconds]);

  const append = React.useCallback((entry: Omit<TriageLogEntry, "ts">) => {
    setLog((l) => [...l, { ts: new Date().toISOString(), ...entry }]);
  }, []);

  const goTo = React.useCallback((t: TriageTree, target: string, from: string | null) => {
    const r = resolveNode(t, target, profile);
    for (const skipped of r.skipped) {
      append({ node: skipped, prompt: t.nodes[skipped].prompt, answer: "Skipped", detail: `Not available in the ${profile.label} profile.` });
    }
    if (r.node.cause) setCauses((c) => (c.includes(r.node.cause!) ? c : [...c, r.node.cause!]));
    if (from) setHistory((h) => [...h, from]);
    setNodeId(r.id);
  }, [append, profile]);

  const startTree = React.useCallback((id: string, how: string) => {
    const t = TREES[id];
    startedAt.current = new Date().toISOString();
    setTreeId(id);
    setHistory([]);
    setCauses([]);
    setVitals({});
    setReceipt(null);
    cprInfo.current = { started: false, compressions: 0, seconds: 0 };
    setLog([{ ts: new Date().toISOString(), node: "start", prompt: `Triage started: ${t.title}`, answer: how, detail: `Patient: ${patient}. Profile: ${profile.label}. Mission Day ${missionDay}.` }]);
    const r = resolveNode(t, t.start, profile);
    setNodeId(r.id);
  }, [missionDay, patient, profile]);

  const choose = React.useCallback((index: number, how = "tap") => {
    if (!tree || !node || !resolved) return;
    const option = node.options[index];
    if (!option) return;
    let detail: string | undefined;
    if (node.capture_vitals) {
      const parts = node.capture_vitals.filter((k) => vitals[k]).map((k) => `${VITAL_LABELS[k].label} ${vitals[k]} ${VITAL_LABELS[k].unit}`);
      detail = parts.length ? parts.join(", ") : "No vital signs entered.";
    }
    if (isCpr) detail = `${cprInfo.current.compressions} compressions in ${cprInfo.current.seconds} s at ${CPR_BPM} per minute.`;
    append({ node: resolved.id, prompt: node.prompt, answer: `${option.label}${how === "voice" ? " (voice)" : ""}`, detail });
    goTo(tree, option.next, resolved.id);
  }, [append, goTo, isCpr, node, resolved, tree, vitals]);

  const back = React.useCallback(() => {
    if (!tree) return;
    if (history.length === 0) { setTreeId(null); setNodeId(""); return; }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    append({ node: nodeId, prompt: node?.prompt ?? "", answer: "Back" });
    setNodeId(prev);
  }, [append, history, node, nodeId, tree]);

  const startCpr = React.useCallback((how: string) => {
    const t = tree ?? TREES.chest_pain;
    if (!tree) startTree("chest_pain", how);
    append({ node: resolved?.id ?? "start", prompt: "Start CPR", answer: `Start CPR${how === "voice" ? " (voice)" : ""}` });
    if (resolved) setHistory((h) => [...h, resolved.id]);
    setTreeId(t.id);
    setNodeId("cpr");
  }, [append, resolved, startTree, tree]);

  /** One entry point for spoken and typed commands. */
  const command = React.useCallback((transcript: string, how: "voice" | "typed") => {
    const text = transcript.trim();
    if (!text) return;
    setHeard(text);
    if (!tree || !node) {
      if (/\bcpr\b/i.test(text)) return startCpr(how === "voice" ? "voice" : "typed");
      const id = matchTree(text);
      if (id) startTree(id, how === "voice" ? `Voice: “${text}”` : `Typed: “${text}”`);
      return;
    }
    const m = matchVoice(text, node);
    if (!m) return;
    if (m.kind === "back") back();
    else if (m.kind === "repeat") speak(`${node.prompt} ${node.help ?? ""}`, true);
    else if (m.kind === "cpr") { if (!isCpr) startCpr("voice"); }
    else if (m.kind === "option") choose(m.index, "voice");
  }, [back, choose, isCpr, node, startCpr, startTree, tree]);

  // Read each prompt aloud.
  React.useEffect(() => {
    if (node && !isEnd) speak(`${node.prompt} ${node.help ?? ""}`, speechOn);
  }, [node, isEnd, speechOn]);
  React.useEffect(() => {
    if (!treeId) speak("Emergency. What is happening? Say chest pain, or after E V A.", speechOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId]);

  // Voice recognition (Chrome/Edge). Buttons and typed commands always work without it.
  const commandRef = React.useRef(command);
  React.useEffect(() => { commandRef.current = command; }, [command]);
  const toggleListening = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setVoiceNote("Voice input is not supported in this browser. Use the buttons."); return; }
    if (listening) { wantListen.current = false; recRef.current?.stop(); setListening(false); return; }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) commandRef.current(e.results[i][0].transcript, "voice");
    };
    rec.onerror = (e) => {
      if (e.error === "network") setVoiceNote("This browser sends speech to a server, so voice input needs a network. Buttons work offline.");
      else if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceNote("Microphone blocked. Use the buttons.");
      if (e.error !== "no-speech") { wantListen.current = false; setListening(false); }
    };
    rec.onend = () => { if (wantListen.current) { try { rec.start(); } catch { /* already started */ } } };
    recRef.current = rec;
    wantListen.current = true;
    setVoiceNote(null);
    try { rec.start(); setListening(true); } catch { setVoiceNote("Could not start voice input. Use the buttons."); }
  };
  React.useEffect(() => () => { wantListen.current = false; recRef.current?.abort(); window.speechSynthesis?.cancel(); }, []);

  // When the tree ends: build the report, gzip it, queue it for Houston.
  React.useEffect(() => {
    if (!isEnd || !tree || receipt) return;
    let cancelled = false;
    (async () => {
      const endedAt = new Date().toISOString();
      const numericVitals = Object.fromEntries(Object.entries(vitals).filter(([, v]) => v !== "" && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)]));
      const report: IncidentReport = {
        version: 1, tree: tree.id, title: tree.title, profile: profile.id, astronautId: patientId, patient, missionDay,
        startedAt: startedAt.current, endedAt, likelyCauses: causes, vitals: numericVitals, cpr: cprInfo.current, log,
        note: "Generated on board by Hygieia triage.",
      };
      const json = JSON.stringify(report);
      const rawBytes = new TextEncoder().encode(json).length;
      const packed = await gzip(json);
      const vit = Object.entries(numericVitals).map(([k, v]) => `${VITAL_LABELS[k]?.label ?? k} ${v}`).join(", ");
      const summary = `${tree.title}. Patient: ${patient}. ${causes.length ? `Likely: ${causes.join("; ")}. ` : ""}${vit ? `Vitals: ${vit}. ` : ""}${cprInfo.current.started ? `CPR given: ${cprInfo.current.compressions} compressions in ${cprInfo.current.seconds} s. ` : "No CPR. "}${log.length} logged steps.`;
      const body = { tree: tree.id, title: tree.title, astronautId: patientId, patient, profile: profile.id, startedAt: startedAt.current, endedAt, summary, rawBytes, gzipBytes: packed.bytes.length, payloadB64: packed.b64, log };
      const sentAt = Date.now();
      try {
        const res = await fetch("/api/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setReceipt({ rawBytes, gzipBytes: packed.bytes.length, queued: true, deliverAt: Date.parse(data.deliverAt), sentAt });
      } catch {
        // Server unreachable: keep the report on this device and send it later.
        try {
          const pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]");
          pending.push(body);
          window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        } catch { /* storage unavailable */ }
        if (!cancelled) setReceipt({ rawBytes, gzipBytes: packed.bytes.length, queued: false, deliverAt: null, sentAt });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnd]);

  // Send any reports saved while the server was unreachable.
  React.useEffect(() => {
    (async () => {
      try {
        const pending: unknown[] = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]");
        if (!pending.length) return;
        const left: unknown[] = [];
        for (const body of pending) {
          const res = await fetch("/api/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
          if (!res?.ok) left.push(body);
        }
        window.localStorage.setItem(PENDING_KEY, JSON.stringify(left));
      } catch { /* ignore */ }
    })();
  }, []);

  React.useEffect(() => {
    if (!receipt?.deliverAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [receipt]);

  const kit = node ? kitFor(node, profile) : { have: [], missing: [] };
  const lowSpo2 = vitals.spo2 !== undefined && vitals.spo2 !== "" && Number(vitals.spo2) < profile.spo2RedBelow;
  const bigButton = "flex min-h-[124px] w-full cursor-pointer items-center justify-center rounded-2xl px-6 py-5 text-center font-display text-3xl font-bold transition-transform active:scale-[0.99] sm:text-4xl";

  return (
    <div data-testid="triage" className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b-2 border-bad bg-bad/10 px-4 py-3">
        <span className="rounded bg-bad px-2.5 py-1 font-display text-sm font-bold uppercase tracking-wide text-bg">Emergency</span>
        <span className="font-display text-lg font-semibold">{tree ? tree.title : "Triage"}</span>
        <span className="label">{profile.label} · Day {missionDay}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-soft">
            Patient
            <select data-testid="patient-select" value={patientId ?? ""} onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)} className="h-9 rounded-md border border-line bg-bg-alt px-2 text-ink">
              <option value="">Not identified</option>
              {crew.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          <button type="button" onClick={() => setSpeechOn((v) => !v)} aria-pressed={speechOn} className="h-9 cursor-pointer rounded-md border border-line px-3 text-sm text-ink">{speechOn ? "Reading aloud: on" : "Reading aloud: off"}</button>
          <button type="button" data-testid="voice-toggle" onClick={toggleListening} aria-pressed={listening} className={cn("flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm", listening ? "border-teal bg-teal/20 text-ink" : "border-line text-ink")}>
            <IconMic /> {listening ? "Listening…" : "Voice commands"}
          </button>
          <Link href={patientId ? `/astronaut/${patientId}` : "/"} data-testid="triage-exit" className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-sm text-soft hover:text-ink"><IconX /> Exit</Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6">
        {!tree && (
          <>
            <h1 data-testid="triage-prompt" className="font-display text-4xl font-bold leading-tight sm:text-5xl">What is happening?</h1>
            <div className="grid gap-4">
              {TREE_ORDER.map((id) => (
                <button key={id} type="button" data-testid={`triage-tree-${id}`} onClick={() => startTree(id, "tap")} className={cn(bigButton, "bg-bad text-bg")}>{TREES[id].title}</button>
              ))}
              <button type="button" data-testid="triage-cpr-now" onClick={() => startCpr("tap")} className={cn(bigButton, "border-4 border-bad text-ink")}>Not breathing — start CPR</button>
            </div>
          </>
        )}

        {tree && node && !isCpr && !isEnd && (
          <>
            <div>
              <p className="label">Step {history.length + 1}</p>
              <h1 data-testid="triage-prompt" data-node={resolved?.id} className="mt-1 font-display text-4xl font-bold leading-tight sm:text-5xl">{node.prompt}</h1>
              {node.help && <p className="mt-3 text-xl text-soft">{node.help}</p>}
            </div>

            {node.cause && <p data-testid="triage-cause" className="rounded-lg border border-warn/60 bg-warn/10 px-4 py-2 text-lg text-warn">{node.cause}. This is a prompt for action, not a diagnosis.</p>}

            {(kit.have.length > 0 || kit.missing.length > 0) && (
              <div data-testid="triage-kit" className="rounded-lg border border-line bg-panel px-4 py-3">
                <p className="label">Kit for this step</p>
                <ul className="mt-1 flex flex-wrap gap-2 text-base">
                  {kit.have.map((k) => (<li key={k} className="rounded-md border border-ok/50 bg-ok/10 px-2.5 py-1 text-ok">✓ {kitLabels[k] ?? k}</li>))}
                  {kit.missing.map((k) => (<li key={k} className="rounded-md border border-line px-2.5 py-1 text-soft line-through decoration-soft/60">{kitLabels[k] ?? k} <span className="no-underline">(not on board)</span></li>))}
                </ul>
              </div>
            )}

            {resolved?.id === "cabin_air" && cabin.co2 !== null && (
              <p data-testid="triage-cabin" className="rounded-lg border border-line bg-panel px-4 py-3 text-lg">
                Cabin CO₂ now: <span className="num font-semibold">{cabin.co2.toFixed(1)} mmHg</span> <span className="text-soft">(alert line {cabin.co2Amber} mmHg)</span> — {cabin.co2 >= cabin.co2Amber ? <span className="text-bad">HIGH</span> : <span className="text-ok">normal</span>}
              </p>
            )}

            {node.capture_vitals && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {node.capture_vitals.map((k) => (
                  <label key={k} className="flex flex-col gap-1">
                    <span className="text-base text-soft">{VITAL_LABELS[k].label} ({VITAL_LABELS[k].unit})</span>
                    <input
                      data-testid={`vital-${k}`} inputMode="numeric" type="number" min={VITAL_LABELS[k].min} max={VITAL_LABELS[k].max}
                      value={vitals[k] ?? ""} onChange={(e) => setVitals((v) => ({ ...v, [k]: e.target.value }))}
                      className="num h-16 rounded-xl border-2 border-line bg-bg-alt px-3 text-3xl text-ink"
                    />
                  </label>
                ))}
                {lowSpo2 && <p data-testid="triage-low-spo2" className="col-span-full rounded-lg border border-bad bg-bad/10 px-4 py-2 text-lg text-bad">Oxygen level is below {profile.spo2RedBelow}% ({profile.label} limit). Give oxygen if available.</p>}
              </div>
            )}

            <div className={cn("grid gap-4", node.options.length > 1 && "sm:grid-cols-2")}>
              {node.options.map((o, i) => (
                <button key={o.label} type="button" data-testid={`triage-option-${i}`} onClick={() => choose(i)} className={cn(bigButton, o.action === "start_cpr" ? "bg-bad text-bg" : i === 0 ? "bg-teal text-bg" : "border-4 border-line bg-panel text-ink")}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" data-testid="triage-back" onClick={back} className="flex h-14 cursor-pointer items-center gap-2 rounded-xl border-2 border-line px-5 text-lg text-ink"><IconBack /> Back</button>
              <button type="button" onClick={() => speak(`${node.prompt} ${node.help ?? ""}`, true)} className="h-14 cursor-pointer rounded-xl border-2 border-line px-5 text-lg text-ink">Repeat</button>
              <button type="button" data-testid="triage-start-cpr" onClick={() => startCpr("tap")} className="ml-auto h-14 cursor-pointer rounded-xl border-2 border-bad px-5 text-lg font-semibold text-bad">Start CPR</button>
            </div>
          </>
        )}

        {tree && isCpr && node && (
          <div data-testid="cpr-screen" className="flex flex-col gap-5">
            <h1 data-testid="triage-prompt" data-node="cpr" className="font-display text-4xl font-bold sm:text-5xl">Push to the beat.</h1>
            <div className="grid items-center gap-5 md:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-2">
                <div key={metronome.count} className="flex h-44 w-44 items-center justify-center rounded-full border-8 border-bad bg-bad/20 motion-safe:animate-[heartbeat_0.545s_ease-out]">
                  <span data-testid="cpr-count" className="num font-display text-6xl font-bold">{metronome.count}</span>
                </div>
                <p className="num text-lg text-soft"><span data-testid="cpr-bpm">{CPR_BPM}</span> per minute · {Math.floor(metronome.seconds / 60)}:{String(metronome.seconds % 60).padStart(2, "0")}</p>
                {!metronome.audioOk && <p className="text-sm text-warn">Sound is blocked. Follow the pulsing circle.</p>}
              </div>
              <div className="rounded-xl border border-line bg-panel p-4">
                {profile.cpr_method === "evetts_russomano" ? (
                  <>
                    <p data-testid="cpr-method" className="font-display text-2xl font-semibold">Evetts-Russomano method</p>
                    <p className="mt-1 text-lg text-soft">Microgravity. Wrap your legs around the patient&apos;s torso. Lock your arms. Compress with your upper body.</p>
                    <EvettsRussomanoDiagram />
                  </>
                ) : profile.cpr_method === "standard" ? (
                  <>
                    <p data-testid="cpr-method" className="font-display text-2xl font-semibold">Chest compressions</p>
                    <p className="mt-1 text-lg text-soft">Kneel beside the patient. Lock your arms. Push hard and fast in the centre of the chest.</p>
                    <SurfaceKneelingDiagram />
                  </>
                ) : (
                  <>
                    <p data-testid="cpr-method" className="font-display text-2xl font-semibold">Kneeling CPR ({profile.label})</p>
                    <p className="mt-1 text-lg text-soft">Surface gravity. Kneel beside the patient. Lock your arms. Your body weighs less here, so push harder.</p>
                    <SurfaceKneelingDiagram />
                  </>
                )}
              </div>
            </div>
            <p className="text-xl text-soft">{node.help}</p>
            {kit.have.includes("aed") && <p className="rounded-lg border border-ok/50 bg-ok/10 px-4 py-2 text-lg text-ok">✓ {kitLabels.aed} on board — attach it and follow its prompts.</p>}
            <button type="button" data-testid="cpr-stop" onClick={() => choose(0)} className={cn(bigButton, "border-4 border-line bg-panel text-ink")}>Stop CPR</button>
          </div>
        )}

        {tree && isEnd && (
          <div data-testid="triage-report" className="flex flex-col gap-4">
            <h1 data-testid="triage-prompt" data-node="end" className="font-display text-4xl font-bold">Report for Houston</h1>
            {!receipt ? <p className="text-xl text-soft">Compressing the log…</p> : (
              <>
                <div className="rounded-xl border border-line bg-panel p-4">
                  <p className="label">Compressed in the browser (gzip)</p>
                  <p data-testid="report-sizes" data-raw={receipt.rawBytes} data-gzip={receipt.gzipBytes} className="num mt-1 font-display text-3xl font-semibold">
                    {formatBytes(receipt.rawBytes)} → {formatBytes(receipt.gzipBytes)}
                  </p>
                  <p className="text-soft">{Math.max(0, Math.round((1 - receipt.gzipBytes / receipt.rawBytes) * 100))}% smaller. {log.length} logged steps with timestamps.</p>
                </div>
                {receipt.queued && receipt.deliverAt ? (
                  <div data-testid="report-transit" data-state={now >= receipt.deliverAt ? "delivered" : "in_transit"} className="rounded-xl border border-coral/60 bg-coral/5 p-4">
                    {now < receipt.deliverAt ? (
                      <>
                        <p className="font-display text-2xl font-semibold">In transit to Earth</p>
                        <p className="num text-lg text-soft">Arrives in {Math.max(0, Math.ceil((receipt.deliverAt - now) / 1000))} s · one-way delay {formatDelay(delaySeconds)}</p>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-line"><div className="transit-bar h-full" style={{ width: `${Math.min(100, ((now - receipt.sentAt) / Math.max(1, receipt.deliverAt - receipt.sentAt)) * 100)}%` }} /></div>
                      </>
                    ) : (
                      <p className="font-display text-2xl font-semibold text-ok">Delivered to Houston.</p>
                    )}
                  </div>
                ) : (
                  <p data-testid="report-saved-locally" className="rounded-xl border border-warn/60 bg-warn/10 p-4 text-lg text-warn">The onboard server is unreachable. The report is saved on this device and will be queued when it is back.</p>
                )}
                <details className="rounded-xl border border-line bg-panel p-4" open>
                  <summary className="cursor-pointer font-display text-lg font-semibold">Step log</summary>
                  <ol data-testid="triage-log" className="mt-2 space-y-1.5 text-sm">
                    {log.map((e, i) => (
                      <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-2">
                        <span className="num text-soft">{e.ts.slice(11, 19)}</span>
                        <span><span className="text-ink">{e.prompt}</span> <span className="text-teal">→ {e.answer}</span>{e.detail && <span className="block text-soft">{e.detail}</span>}</span>
                      </li>
                    ))}
                  </ol>
                </details>
                <div className="flex flex-wrap gap-3">
                  <Link href="/houston#inbox" className="flex h-14 items-center rounded-xl bg-teal px-5 text-lg font-semibold text-bg">See it arrive at Houston</Link>
                  <button type="button" onClick={() => { setTreeId(null); setNodeId(""); setReceipt(null); }} className="h-14 cursor-pointer rounded-xl border-2 border-line px-5 text-lg text-ink">New triage</button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-3">
        <form className="mx-auto flex max-w-4xl flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); command(typed, "typed"); setTyped(""); }}>
          <label htmlFor="triage-command" className="text-sm text-soft">Say or type: <span className="text-ink">yes · no · back · repeat · start CPR</span></label>
          <input id="triage-command" data-testid="triage-command" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tree ? "yes" : "chest pain"} className="h-10 w-44 rounded-md border border-line bg-bg-alt px-3 text-ink" autoComplete="off" />
          {heard && <span data-testid="triage-heard" className="font-mono text-xs text-teal">heard: “{heard}”</span>}
          {voiceNote && <span data-testid="voice-note" className="text-xs text-warn">{voiceNote}</span>}
          <span className="ml-auto text-xs text-soft">{(tree ?? TREES.chest_pain).disclaimer} No AI and no network are used here.</span>
        </form>
      </footer>
    </div>
  );
}
