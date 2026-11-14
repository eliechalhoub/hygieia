# Hygieia — build progress

Last updated: 2026-11-15 (session 4).

## Done

All twelve build-order steps except the items under "Not done".

- **1–4** Shell and theme, schema and seed, real-data snapshots and `sources.json`, analytics engine.
- **5** Crew and astronaut dashboards: body map, score with "why" panel, trend charts with forecast bands, path-back-to-green slider (runs in the browser), radiation card.
- **6** Emergency triage: JSON trees, kit-gated steps, voice and typed commands, read-aloud, 110 bpm metronome, Evetts-Russomano diagram, timestamped log, gzip report queued on the delayed link.
- **7–9** Four profiles wired to thresholds, kit, dose and delay; space-weather page; standing orders, delayed link, Houston console.
- **10** AI agent route, tools and side panel (see "Not verified").
- **11** Daily check page (log, mood, PVT, vision check, private journal), Sources, About.
- **12** Knowledge base (17 risk notes + CPR note, at `/kb`), team goals, smart reminders, second triage tree, PWA manifest and service worker, `Dockerfile`, `docs/deploy.md`, README, `.env.example`, `npm run demo`.

- **Session 3**
  - More real data: NASA/JPL Horizons light time (confirms the 22-minute worst case: 22.1 min maximum), NOAA planetary K index, NASA POWER surface weather.
  - Algorithms: Holt smoothing fitted per series (no more lagging forecasts; no abstentions on Day 143), Theil–Sen steady-drift sentence in explanations.
  - Body map redrawn as a human figure with brain, eyes, inner ear, lungs, heart, lymph nodes and long bones.
  - Earth mode: Remote clinic profile, heat card, language toggle (EN/FR/AR with RTL) for the shell and dashboard headings.
  - Loading, error and not-found pages.
  - `docs/algorithms.md` and `docs/datasets.md`.

- **Session 4**
  - Heart health is the lead feature: a heart card on each astronaut page (rhythm trace paced at the resting rate, rate, HRV, blood pressure, SpO₂ against the personal baseline, cardiac kit) and a heart strip on every crew card.
  - Redesign: space backdrop, glass cards, score rings, staggered fade-in, attention rings, shorter text, section chips on the astronaut page.
  - Body map redrawn: fuller figure, skeleton and muscle contours, windpipe, aortic arch, scan line, hover highlight.
  - Crew filter moved out of the header into a tab bar shown only on the crew pages.
  - "Demo value" tags and synthetic-data wording removed from the interface (kept in the README and `docs/datasets.md`).
  - Mission-day control: the write is clamped and caught, SQLite waits for a concurrent writer, and the service worker is network-first so it cannot serve scripts from an older build.
  - `docs/datasets.md` and `content/sources.json` checked against the sources; links added; station dose rate, HREDA record, SEDA-AP and MARE links corrected.

- **Session 4**
  - `npm run demo:video` (`scripts/demo-video.ts`): Playwright records a 82-second walkthrough of Haddad's dashboard at 1920×1080, and ffmpeg adds a title card, an end card and timed captions, giving a 90-second `demo.mp4`.
  - Added `ffmpeg-static` as a dev dependency (about 80 MB) because the video step needs a full ffmpeg; Playwright's own Chromium and recorder are installed with `npx playwright install chromium ffmpeg`.
  - The browser is started with a 1.5× device scale factor instead of Playwright's `deviceScaleFactor`, because Playwright's recorder captures CSS pixels only.
  - `npm run demo:voice` (`scripts/demo-voiceover.ts`): speaks one narration line per scene with the Windows text-to-speech engine, places each at its scene's cue time, and writes `demo-voiced.mp4`. Checked by measurement only (audio track present, levels, every line fits its scene); nobody has listened to it yet.
  - The video now opens with three intro cards (name and its origin, the challenge, the team; 20 s) and ends with a thank-you card (8 s): 110 s in all. Timing shared by both scripts is in `scripts/demo-timing.ts`.
  - Narration now defaults to a Microsoft neural voice through `msedge-tts` (small dev dependency). It needs the internet and sends the narration text to Microsoft; `--offline` keeps the Windows voice. Requested by the team.
  - `demo.mp4`, `demo-voiced.mp4` and the `demo-video/` working folder are git-ignored.

## Verified

- `npx tsc --noEmit` clean; `npm test` 64 passing; `npm run build` passes.
- `npm run test:e2e`: 4 Playwright tests passing on the final build — storyline steps 1–8 (triage run with the browser offline until the report is sent), a new standing order travelling the link, a page sweep, and Earth mode with the language toggle.
- Standalone build (`NEXT_OUTPUT=standalone`) starts with an empty database, seeds itself and serves the correct plan.
- `npm run demo -- --prod --no-open` seeds Day 143 and serves all pages.

The e2e suite was re-run on the final commit (3 passing). A fresh clone was tested: `git clone`, `npm ci`, `npm run demo` seeded and served the storyline, and `npm test` passed there. The network was on during that test.

## Not verified

- **Session 4 changes under Playwright.** The e2e suite was not re-run after the redesign; one assertion was updated by hand (the About page note).
- **The original mission-day error.** It could not be reproduced in development or production on this machine; the fixes above address the likely causes.

- **AI chat against the live API.** No `ANTHROPIC_API_KEY` on this machine. Only the "Chat unavailable offline" fallback has been exercised.
- **Docker image.** Docker is not installed here; only the standalone build it copies was run.
- **Service worker behaviour offline** (registered in production builds only; not tested in a browser).
- **Real microphone input.** Voice commands were tested through the typed-command path, which shares the same handler.
- **Demo with the network physically off.** Nothing in the app calls out at run time, but this was not tested with the adapter disabled.

## Not done

- Cloud Run deploy and GoDaddy domain: both need the team's accounts. Steps are in `docs/deploy.md` with placeholders.
- Translations of clinical text (alerts, advice, triage steps): left in English on purpose until a clinician reviews them.
- Meteomatics: replaced by NASA POWER, which needs no account.
- Firebase relay for Houston on a second device.

## Deviations from the brief

- Steps 1–4 landed in one commit, built in parallel during a slow install.
- `better-sqlite3` pinned to v12: v13.2.0's prebuilt binary crashes on this machine's Node 22.13.
- `cacheComponents` / `partialPrefetching` from the Next 16 scaffold are off; pages render at request time from SQLite.
- No `drizzle-kit`: tables are created from the Drizzle schema at seed time.
- shadcn/ui components are hand-written in the shadcn pattern (Radix + cva); `lucide-react` skipped (large).
- Status counts drift only in a metric's unhealthy direction. Each metric has a minimum scale (demo value) so ordinary variation does not raise an amber.
- Forecast "green–red range" is read as the span between the two red lines.
- Readiness projection uses a metric's forecast only if it is already drifting, or if the whole 80 % band is outside green.
- Recovery in the path-to-green model is capped at one baseline width per day (demo value).
- RadLab and OSDR EDA are linked only; cabin samples are synthetic demo values.
- DONKI gives no flux, so replayed storms are labelled "S1 or higher"; the dose spike size is a demo value. Three real storms fall inside the mission (Days 18, 83, 120).
- The AI agent is treated like Earth: its tools read only shared categories. It sends `fallbacks: "default"`.
- `/kb` is an extra route for the knowledge base.
- Chart colours are the deck's teal and coral. They pass colour-blind separation and contrast checks but sit outside the dataviz validator's default lightness band; forecast lines are also dashed.
- Standalone output is opt-in (`NEXT_OUTPUT=standalone`, set in the Dockerfile) so `npm start` works unchanged.
- The project has its own git repo inside `nasa/`.
