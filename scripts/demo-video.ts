/**
 * npm run demo:video
 *
 * Records a 1080p walkthrough of one crew member's dashboard with Playwright,
 * then uses ffmpeg to add three intro cards (the name, the challenge, the
 * team), timed captions and a thank-you card, and writes demo.mp4.
 *
 * The app must already be running (default http://localhost:3000):
 *   npm run build && npm run demo -- --prod --no-open
 *
 * Options:
 *   --skip-record   reuse the last recording and only redo the ffmpeg step
 *   --url <base>    record against another address
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { getHandle } from "@/lib/db/client";
import { DEMO_DAY, seedDatabase } from "@/lib/db/seed";
import { BODY_S, CHALLENGE, END_S, INTRO_S, TEAM, TOTAL_S } from "./demo-timing";

const args = process.argv.slice(2);
const BASE = args.includes("--url") ? args[args.indexOf("--url") + 1] : (process.env.DEMO_URL ?? "http://localhost:3000");
const WORK = path.join(process.cwd(), "demo-video");
const OUT = path.join(process.cwd(), "demo.mp4");
const W = 1920;
const H = 1080;
/**
 * CSS viewport. The browser runs with a 1.5× device scale factor, so this
 * 1280×720 page is drawn on a true 1920×1080 surface: sharp, and large enough
 * to read. (Playwright's own deviceScaleFactor option is not used: its video
 * recorder captures CSS pixels and would leave the page in a corner.)
 */
const VIEW = { width: 1280, height: 720 };
const BROWSER_ARGS = [`--force-device-scale-factor=${W / VIEW.width}`, `--window-size=${VIEW.width},${VIEW.height}`, "--hide-scrollbars"];

interface Mark { t: number; text: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A visible pointer: headless recordings have no mouse cursor of their own.
const CURSOR_SCRIPT = `(() => {
  const add = () => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.style.cssText = "position:fixed;z-index:2147483647;left:-40px;top:-40px;width:26px;height:26px;pointer-events:none;transition:transform .12s ease-out;" +
      "background:no-repeat url(\\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><path d='M3 2l7.5 19 2.6-7.7L21 10.6z' fill='%23ffffff' stroke='%23090e1d' stroke-width='1.6' stroke-linejoin='round'/></svg>\\")";
    document.documentElement.appendChild(c);
    const ring = document.createElement("div");
    ring.style.cssText = "position:fixed;z-index:2147483646;left:-40px;top:-40px;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #3dd6c4;pointer-events:none;opacity:0;";
    document.documentElement.appendChild(ring);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { c.style.transform = "scale(.82)"; ring.animate([{ opacity: .9, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.5)" }], { duration: 450 }); }, true);
    addEventListener("mouseup", () => { c.style.transform = ""; }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
})();`;

async function record(): Promise<{ video: string; marks: Mark[]; start: number }> {
  // Start from the scripted Day 143 so every recording is the same.
  const handle = getHandle({ autoSeed: false });
  seedDatabase(handle.sqlite, handle.db, { day: DEMO_DAY, profile: "transit", quiet: true });
  handle.sqlite.close();

  fs.rmSync(path.join(WORK, "raw"), { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, "raw"), { recursive: true });

  const launch = async () => {
    try {
      return await chromium.launch({ headless: true, args: BROWSER_ARGS });
    } catch {
      // Playwright's own Chromium is not installed: use the system browser.
      return await chromium.launch({ headless: true, args: BROWSER_ARGS, channel: process.platform === "win32" ? "msedge" : "chrome" });
    }
  };
  const browser = await launch();
  const context = await browser.newContext({
    viewport: null,
    recordVideo: { dir: path.join(WORK, "raw"), size: { width: W, height: H } },
    colorScheme: "dark",
    locale: "en-US",
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const opened = Date.now();
  page.setDefaultTimeout(8000);

  let t0 = 0;
  const marks: Mark[] = [];
  const now = () => (Date.now() - t0) / 1000;
  const say = (text: string) => { marks.push({ t: now(), text }); console.log(`[demo-video] ${now().toFixed(1).padStart(5)} s  ${text}`); };

  let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };
  /** Wait until a planned moment of the take, so every scene starts on schedule. */
  const at = async (seconds: number) => { while (now() < seconds) await sleep(40); };
  /** Move the pointer over `ms` milliseconds. Paced by the clock, so a busy page does not slow it down. */
  const moveTo = async (x: number, y: number, ms = 600) => {
    const from = { ...mouse };
    const began = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - began) / ms);
      const e = k * k * (3 - 2 * k); // ease in and out
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      if (k >= 1) break;
      await sleep(12);
    }
    mouse = { x, y };
  };
  const centre = async (loc: Locator) => {
    const box = await loc.first().boundingBox();
    if (!box) throw new Error("element not visible");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  };
  /** Smoothly scroll an element to a place in the viewport. */
  const glide = async (loc: Locator, block: "start" | "center" = "center", settle = 750) => {
    await loc.first().evaluate((el, b) => {
      const r = el.getBoundingClientRect();
      const target = b === "start" ? window.scrollY + r.top - 120 : window.scrollY + r.top - Math.max(100, (window.innerHeight - r.height) / 2);
      window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }, block);
    await sleep(settle);
  };
  const hover = async (loc: Locator, ms = 550) => { const c = await centre(loc); await moveTo(c.x, c.y, ms); };
  const click = async (loc: Locator, ms = 550) => { await hover(loc, ms); await sleep(90); await page.mouse.down(); await sleep(70); await page.mouse.up(); };
  /** Click inside the triage screen, which scrolls in its own container. */
  const tclick = async (loc: Locator, ms = 450) => { await loc.first().scrollIntoViewIfNeeded(); await click(loc, ms); };
  /** A step that must not stop the recording if the page differs from what the script expects. */
  const tryStep = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) { console.warn(`[demo-video] skipped "${name}": ${String(err).split("\n")[0]}`); }
  };
  const id = (testid: string) => page.getByTestId(testid);

  // --- Scene 1: crew dashboard --------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await id("crew-card-haddad").waitFor();
  await sleep(400);
  t0 = Date.now();
  const start = (t0 - opened) / 1000;
  await page.mouse.move(mouse.x, mouse.y);
  say("Day 143 of a Mars transit. Three crew are green. Leila Haddad is red.");
  await sleep(1200);
  await hover(id("crew-card-haddad"), 800);
  await at(3.6);
  await click(id("crew-card-haddad"), 150);
  await id("astronaut-name").waitFor();
  await page.mouse.move(mouse.x, mouse.y);

  // --- Scene 2: readiness for the spacewalk ----------------------------------------------
  await at(5);
  say("Her dashboard. Not ready for the Day 145 spacewalk: Hygieia suggests Sato as the swap.");
  await tryStep("readiness banner", async () => { await hover(id("readiness-banner"), 700); });

  // --- Scene 3: body map and trends -------------------------------------------------------
  await at(9);
  say("Body map: each region takes the colour of its worst measure. Head is red, heart amber.");
  await tryStep("body map", async () => {
    await glide(id("region-head"), "center");
    await hover(id("region-heart"), 600);
    await sleep(700);
    await click(id("region-head"), 600);
  });
  await at(15);
  say("Trends against her own baseline, with a 7-day forecast band.");
  await tryStep("trends", async () => {
    await glide(page.locator("#trends"), "start", 900);
    const chart = page.locator("[data-testid^=chart-]").first();
    const c = await centre(chart);
    await moveTo(c.box.x + c.box.width * 0.35, c.y + 10, 500);
    await moveTo(c.box.x + c.box.width * 0.9, c.y + 10, 2200);
  });

  // --- Scene 4: readiness score -------------------------------------------------------------
  await at(20.5);
  say("Readiness 37 out of 100, with the reason in plain words.");
  await tryStep("score", async () => {
    await glide(id("score-card"), "center");
    await hover(id("explanation"), 600);
  });

  // --- Scene 5: path back to green ----------------------------------------------------------
  await at(24.5);
  say("Smallest path back to green: sleep 7 h for 2 nights + 1 h shared crew time. Green by Day 146.");
  await tryStep("path card", async () => {
    await glide(id("path-card"), "center");
    await hover(id("path-summary"), 600);
  });
  await at(29.5);
  say("Drag the sleep slider and the projected recovery day moves. It runs in the browser.");
  await tryStep("slider", async () => {
    const thumb = id("sleep-slider").getByRole("slider");
    const track = await centre(id("sleep-slider"));
    const t = await centre(thumb);
    await moveTo(t.x, t.y, 600);
    await page.mouse.down();
    await moveTo(track.box.x + track.box.width * 0.2, t.y, 2200);
    await sleep(1300);
    await moveTo(t.x, t.y, 1800);
    await page.mouse.up();
  });

  // --- Scene 6: alerts and the standing order -------------------------------------------------
  await at(38);
  say("A standing order from the flight surgeon fired on board. No round trip to Earth.");
  await tryStep("alerts", async () => {
    // Centre the standing order itself, so the caption does not cover it.
    await glide(id("standing-order-alert"), "center", 900);
    await hover(id("authorised-by"), 700);
  });

  // --- Scene 7: radiation with real data --------------------------------------------------------
  await at(44);
  say("Real NASA data: the solar particle event of 5 Sep 2026, replayed on Day 120 of her dose record.");
  await tryStep("radiation", async () => {
    await glide(id("radiation-card"), "start", 900);
    const bars = id("radiation-card").locator(".recharts-wrapper").first();
    const c = await centre(bars);
    await moveTo(c.box.x + c.box.width * 0.3, c.y, 500);
    await moveTo(c.box.x + c.box.width * 0.52, c.y - 10, 1800);
  });

  // --- Scene 8: sharing --------------------------------------------------------------------------
  await at(50.5);
  say("She chooses what is shared with Earth. Her journal always stays private.");
  await tryStep("sharing", async () => {
    await glide(id("sharing-card"), "center", 850);
    await hover(id("share-mood"), 700);
  });

  // --- Scene 9: the AI assistant, shown for two seconds -------------------------------------------
  await at(54);
  say("An optional AI assistant reads the same shared data.");
  await tryStep("chat", async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(600);
    await click(id("chat-toggle"), 500);
    await sleep(2000);
    await click(id("chat-toggle"), 200);
  });

  // --- Scene 10: emergency triage -------------------------------------------------------------------
  await at(58.5);
  say("Emergency: one red button on every page. Triage needs no network and no AI.");
  await click(id("emergency-button"), 700);
  await id("triage").waitFor();
  await page.mouse.move(mouse.x, mouse.y);
  await at(61.3);
  await tclick(id("triage-tree-chest_pain"), 600);
  await at(62.5);
  say("Chest pain: big buttons, few words, each step read aloud and logged.");
  for (let step = 0; step < 3; step++) {
    const node = await id("triage-prompt").getAttribute("data-node").catch(() => null);
    if (!node || node === "cpr" || node === "end") break;
    if (node === "vitals") {
      for (const [k, v] of [["spo2", "93"], ["hr", "118"]]) {
        await tryStep(`vital ${k}`, async () => { await tclick(id(`vital-${k}`), 250); await page.keyboard.type(v, { delay: 45 }); });
      }
      break;
    }
    await sleep(650);
    await tclick(id("triage-option-0"), 450);
  }
  // The caption changes when the screen does, so click first and then caption.
  await at(68.4);
  await tclick(id("triage-start-cpr"), 500);
  await id("cpr-screen").waitFor();
  say("CPR metronome at 110 per minute, with the Evetts-Russomano method for microgravity.");
  await tryStep("cpr diagram", async () => { await hover(id("cpr-method"), 900); });
  await at(75.2);
  await tclick(id("cpr-stop"), 500);
  await id("report-sizes").waitFor({ timeout: 15000 });
  say("The log is compressed in the browser and queued on the delayed link to Earth.");
  await tryStep("report", async () => { await id("report-sizes").scrollIntoViewIfNeeded(); await hover(id("report-sizes"), 600); });

  // Hold the last scene until the body is long enough, then stop.
  while (now() < BODY_S + 0.8) await sleep(200);
  const total = now();
  await context.close();
  const video = await page.video()!.path();
  await browser.close();
  console.log(`[demo-video] recorded ${total.toFixed(1)} s → ${video}`);

  const meta = { video, marks, start };
  fs.writeFileSync(path.join(WORK, "recording.json"), JSON.stringify(meta, null, 1));
  return meta;
}

// --- ffmpeg: title cards, captions, export ---------------------------------------------------------

function fontFiles(): { regular: string; bold: string } {
  const candidates: [string, string][] = [
    ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/seguisb.ttf"],
    ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  ];
  for (const [regular, bold] of candidates) if (fs.existsSync(regular) && fs.existsSync(bold)) return { regular, bold };
  throw new Error("No usable TrueType font found for the captions.");
}

function compose(meta: { video: string; marks: Mark[]; start: number }) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary for this platform.");
  // ffmpeg filter syntax is awkward with Windows paths, so everything it reads
  // (fonts, caption text) is copied next to the filter script and named plainly.
  const fonts = fontFiles();
  fs.copyFileSync(fonts.regular, path.join(WORK, "regular.ttf"));
  fs.copyFileSync(fonts.bold, path.join(WORK, "bold.ttf"));
  fs.copyFileSync(meta.video, path.join(WORK, "body.webm"));
  const text = (name: string, value: string) => { fs.writeFileSync(path.join(WORK, name), value, "utf8"); return name; };

  const BG = "0x090E1D";
  const INK = "0xEEF2F8";
  const SOFT = "0xB4C0D6";
  const TEAL = "0x3DD6C4";
  const AMBER = "0xF5B841";
  type Line = { text: string; size: number; y: number; color: string; bold?: boolean };
  let cardText = 0;
  /** A full-screen card: centred lines of text, an optional accent bar, fade in and out. */
  const card = (label: string, seconds: number, lines: Line[], barY?: number) =>
    `color=c=${BG}:s=${W}x${H}:r=30:d=${seconds},` +
    lines.map((l) => `drawtext=fontfile=${l.bold ? "bold" : "regular"}.ttf:textfile=${text(`k${String(++cardText).padStart(2, "0")}.txt`, l.text)}:fontsize=${l.size}:fontcolor=${l.color}:x=(w-text_w)/2:y=${l.y}`).join(",") +
    (barY !== undefined ? `,drawbox=x=(iw-160)/2:y=${barY}:w=160:h=5:color=${TEAL}:t=fill` : "") +
    `,fade=t=in:st=0:d=0.4,fade=t=out:st=${(seconds - 0.4).toFixed(2)}:d=0.4,format=yuv420p[${label}]`;

  const intro1 = card("i1", INTRO_S[0], [
    { text: "Hygieia", size: 150, y: 300, color: INK, bold: true },
    { text: "Named after the Greek goddess of health", size: 54, y: 545, color: SOFT },
    { text: "Onboard crew health for deep-space missions", size: 38, y: 650, color: TEAL },
  ], 490);
  const intro2 = card("i2", INTRO_S[1], [
    { text: "NASA SPACE APPS 2026  ·  THE CHALLENGE", size: 32, y: 290, color: TEAL, bold: true },
    { text: CHALLENGE[0], size: 78, y: 365, color: INK, bold: true },
    { text: CHALLENGE[1], size: 78, y: 468, color: INK, bold: true },
    { text: "Challenge by the Brazilian Space Agency", size: 38, y: 640, color: SOFT },
    { text: "On the way to Mars, the flight surgeon is up to 22 minutes away.", size: 36, y: 715, color: AMBER },
  ], 592);
  const intro3 = card("i3", INTRO_S[2], [
    { text: "THE TEAM", size: 32, y: 300, color: TEAL, bold: true },
    { text: "Jovian Elites", size: 130, y: 360, color: INK, bold: true },
    { text: TEAM.join("   ·   "), size: 42, y: 590, color: SOFT },
  ], 535);
  const end = card("end", END_S, [
    { text: "Thank you", size: 150, y: 270, color: INK, bold: true },
    { text: "Hygieia  ·  Team Jovian Elites", size: 50, y: 520, color: SOFT },
    { text: "NASA Space Apps 2026  ·  Challenge by the Brazilian Space Agency", size: 36, y: 615, color: TEAL },
    { text: "Synthetic crew data. Real data from NASA, NOAA and JPL. Not medically validated.", size: 32, y: 700, color: AMBER },
  ], 465);

  // Captions: each one stays until the next begins.
  const caps = meta.marks.map((m, i) => {
    const from = Math.max(0, m.t);
    const to = Math.min(BODY_S, i + 1 < meta.marks.length ? meta.marks[i + 1].t : BODY_S);
    const file = text(`c${String(i + 1).padStart(2, "0")}.txt`, m.text);
    return `drawtext=fontfile=bold.ttf:textfile=${file}:fontsize=38:fontcolor=0xEEF2F8:x=(w-text_w)/2:y=h-118:box=1:boxcolor=${BG}@0.88:boxborderw=22:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`;
  });
  const body =
    `[0:v]trim=start=${meta.start.toFixed(2)}:duration=${BODY_S},setpts=PTS-STARTPTS,fps=30,scale=${W}:${H}:flags=lanczos,setsar=1,` +
    caps.join(",") + `,fade=t=in:st=0:d=0.35,fade=t=out:st=${(BODY_S - 0.4).toFixed(2)}:d=0.4,format=yuv420p[body]`;

  fs.writeFileSync(path.join(WORK, "filter.txt"), [intro1, intro2, intro3, body, end, "[i1][i2][i3][body][end]concat=n=5:v=1:a=0[v]"].join(";\n"), "utf8");

  execFileSync(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", "body.webm", "-filter_complex_script", "filter.txt", "-map", "[v]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", "-an", "out.mp4",
  ], { cwd: WORK, stdio: "inherit" });
  fs.copyFileSync(path.join(WORK, "out.mp4"), OUT);
  const mb = fs.statSync(OUT).size / 1024 / 1024;
  console.log(`[demo-video] wrote ${OUT} (${mb.toFixed(1)} MB, ${TOTAL_S} s, ${W}x${H})`);
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const metaFile = path.join(WORK, "recording.json");
  const meta = args.includes("--skip-record") && fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : await record();
  compose(meta);
}

main().catch((err) => { console.error(err); process.exit(1); });
