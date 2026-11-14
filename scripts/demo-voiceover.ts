/**
 * npm run demo:voice
 *
 * Adds a spoken narration to demo.mp4 and writes demo-voiced.mp4.
 *
 * By default the voice is one of Microsoft's natural ("neural") voices, the
 * ones behind Edge's Read Aloud. That needs the internet, and it sends the
 * narration text below to Microsoft's speech service. Nothing else is sent.
 *
 *   npm run demo:voice                        natural voice (online)
 *   npm run demo:voice -- --offline           built-in Windows voice, no network
 *   npm run demo:voice -- --voice en-US-AndrewMultilingualNeural
 *
 * Each line is spoken into its own file, placed at the moment its card or
 * scene starts, and sped up slightly if it would run into the next line.
 * Run `npm run demo:video` first: it writes the cue times this script reads.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { BODY_S, INTRO_S, INTRO_TOTAL_S, TEAM, TOTAL_S } from "./demo-timing";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const OFFLINE = args.includes("--offline");
const VOICE = opt("voice", OFFLINE ? "Microsoft Zira Desktop" : "en-US-AvaMultilingualNeural");

const WORK = path.join(process.cwd(), "demo-video");
const VOICE_DIR = path.join(WORK, "voice");
const IN = path.join(process.cwd(), "demo.mp4");
const OUT = path.join(process.cwd(), "demo-voiced.mp4");
/** Silence kept between the end of one line and the start of the next. */
const GAP_S = 0.25;

// --- What is said -------------------------------------------------------------------------
// Written to be spoken: shorter than the captions, no symbols.

/** One line per intro card: the name, the challenge, the team. */
const INTRO_LINES = [
  "This is Hygieia, named after the Greek goddess of health.",
  "It is our answer to a NASA Space Apps challenge: health monitoring software for astronauts on space missions.",
  `We are team Jovian Elites: ${TEAM.slice(0, -1).join(", ")} and ${TEAM[TEAM.length - 1]}.`,
];
/** One line per scene, in the same order as the scenes in demo-video.ts. */
const SCENE_LINES = [
  "Day 143. Three crew are green, Leila Haddad is red.",
  "Not ready to spacewalk. Sato swaps in.",
  "The body map shows where: her head is red, and her heart is amber.",
  "Each trend is compared with her own baseline, with a seven day forecast.",
  "Readiness: 37 out of 100.",
  "The fix: seven hours of sleep for two nights, plus crew time.",
  "Drag tonight's sleep, and the recovery day moves. Less sleep means a later recovery.",
  "A standing order from the flight surgeon fired on board, with no wait for Earth.",
  "Her radiation record uses real NASA data: a solar storm from September 2026.",
  "She decides what is shared with Earth.",
  "An optional AI assistant can read the same shared data.",
  "In an emergency, there is one red button.",
  "Triage needs no network and no AI. Big buttons, few words.",
  "A metronome paces CPR at 110 beats a minute, with a method made for microgravity.",
  "The log is compressed and sent to Houston on the delayed link.",
];
const END_LINE = "Thank you for watching, and thank you to NASA Space Apps and the Brazilian Space Agency for the challenge.";

interface Cue { start: number; limit: number; text: string; file: string }

// --- Speaking ---------------------------------------------------------------------------------

/** Natural voice: Microsoft's online neural voices. */
async function speakNeural(cues: Cue[]): Promise<void> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  for (const c of cues) {
    const { audioStream } = await tts.toStream(c.text);
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(path.join(VOICE_DIR, c.file));
      audioStream.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
      audioStream.pipe(out);
    });
  }
  tts.close();
}

/** Offline voice: the speech engine built into Windows. */
function speakWindows(cues: Cue[]): void {
  if (process.platform !== "win32") throw new Error("--offline uses the Windows speech engine. On other systems, drop --offline or record your own voiceover (see the README).");
  fs.writeFileSync(path.join(VOICE_DIR, "lines.json"), JSON.stringify(cues.map((c) => ({ file: c.file, text: c.text }))), "utf8");
  fs.writeFileSync(path.join(VOICE_DIR, "speak.ps1"), [
    "param([string]$Dir, [string]$Voice)",
    "Add-Type -AssemblyName System.Speech",
    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$synth.SelectVoice($Voice)",
    "$synth.Rate = 2",
    "$lines = Get-Content -Raw -Encoding UTF8 (Join-Path $Dir 'lines.json') | ConvertFrom-Json",
    "foreach ($line in $lines) {",
    "  $synth.SetOutputToWaveFile((Join-Path $Dir $line.file))",
    "  $synth.Speak($line.text)",
    "}",
    "$synth.SetOutputToNull()",
    "$synth.Dispose()",
  ].join("\r\n"), "utf8");
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(VOICE_DIR, "speak.ps1"), "-Dir", VOICE_DIR, "-Voice", VOICE], { stdio: "inherit" });
}

/** Length of an audio file in seconds, read from ffmpeg's description of it. */
function audioSeconds(file: string): number {
  const res = spawnSync(ffmpegPath!, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(res.stderr ?? "");
  if (!m) throw new Error(`Could not read the length of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// --- Assemble ---------------------------------------------------------------------------------

async function main() {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary for this platform.");
  if (!fs.existsSync(IN)) throw new Error("demo.mp4 not found. Run `npm run demo:video` first.");
  const metaFile = path.join(WORK, "recording.json");
  if (!fs.existsSync(metaFile)) throw new Error("demo-video/recording.json not found. Run `npm run demo:video` first.");
  const marks = (JSON.parse(fs.readFileSync(metaFile, "utf8")) as { marks: { t: number }[] }).marks;
  if (marks.length !== SCENE_LINES.length) throw new Error(`The video has ${marks.length} scenes but there are ${SCENE_LINES.length} narration lines. Update SCENE_LINES in scripts/demo-voiceover.ts.`);

  fs.rmSync(VOICE_DIR, { recursive: true, force: true });
  fs.mkdirSync(VOICE_DIR, { recursive: true });

  // Cue list: when each line starts, and the latest moment it may still be speaking.
  const introStarts = INTRO_S.map((_, i) => INTRO_S.slice(0, i).reduce((a, b) => a + b, 0) + 0.35);
  const starts = [...introStarts, ...marks.map((m) => INTRO_TOTAL_S + Math.max(0, m.t) + 0.15), INTRO_TOTAL_S + BODY_S + 0.5];
  const texts = [...INTRO_LINES, ...SCENE_LINES, END_LINE];
  const ext = OFFLINE ? "wav" : "mp3";
  const cues: Cue[] = texts.map((text, i) => ({
    text, start: starts[i], limit: (i + 1 < starts.length ? starts[i + 1] : TOTAL_S - 0.3) - GAP_S,
    file: `line${String(i).padStart(2, "0")}.${ext}`,
  }));

  if (OFFLINE) speakWindows(cues);
  else {
    console.log(`[demo-voice] sending ${cues.length} narration lines to Microsoft's speech service (voice ${VOICE})`);
    await speakNeural(cues);
  }

  // Fit each line into its slot, then lay them all on one track the length of the video.
  const filters: string[] = [];
  const labels: string[] = [];
  let tooLong = 0;
  cues.forEach((c, i) => {
    const seconds = audioSeconds(path.join(VOICE_DIR, c.file));
    const room = c.limit - c.start;
    const tempo = seconds > room ? seconds / room : 1;
    if (tempo > 1.2) tooLong++;
    const note = tempo > 1.2 ? "  ← too long: shorten this line" : tempo > 1 ? `  (sped up ×${tempo.toFixed(2)})` : "";
    console.log(`[demo-voice] ${c.start.toFixed(1).padStart(5)} s  ${seconds.toFixed(1)} s of ${room.toFixed(1)} s  ${c.text}${note}`);
    const speed = tempo > 1 ? `atempo=${Math.min(tempo, 1.6).toFixed(3)},` : "";
    filters.push(`[${i + 1}:a]aresample=48000,${speed}adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`);
    labels.push(`[a${i}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${TOTAL_S}[voice]`);
  fs.writeFileSync(path.join(VOICE_DIR, "filter.txt"), filters.join(";\n"), "utf8");

  execFileSync(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", IN, ...cues.flatMap((c) => ["-i", c.file]),
    "-filter_complex_script", "filter.txt", "-map", "0:v", "-map", "[voice]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(TOTAL_S), "out.mp4",
  ], { cwd: VOICE_DIR, stdio: "inherit" });
  fs.copyFileSync(path.join(VOICE_DIR, "out.mp4"), OUT);
  console.log(`[demo-voice] wrote ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB, ${TOTAL_S} s) — voice: ${VOICE}`);
  if (tooLong) console.log(`[demo-voice] ${tooLong} line(s) had to be sped up a lot. Shorten them in scripts/demo-voiceover.ts.`);
}

main().catch((err) => {
  console.error(`[demo-voice] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
