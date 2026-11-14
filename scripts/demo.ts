/**
 * npm run demo
 *
 * Seeds the database on Day 143 (Transit profile), starts the app and opens
 * it in the default browser. Needs no network: data comes from the committed
 * snapshots and fonts are bundled. Only the AI chat needs the internet.
 *
 *   npm run demo               # development server (no build needed)
 *   npm run demo -- --prod     # production server (run `npm run build` first)
 *   npm run demo -- --no-open  # do not open a browser
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getHandle } from "@/lib/db/client";
import { DEMO_DAY, seedDatabase } from "@/lib/db/seed";

const args = process.argv.slice(2);
const port = Number(process.env.PORT ?? 3000);
const prod = args.includes("--prod");
const url = `http://localhost:${port}`;

const handle = getHandle({ autoSeed: false });
seedDatabase(handle.sqlite, handle.db, { day: DEMO_DAY, profile: "transit" });
handle.sqlite.close();

if (prod && !fs.existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) {
  console.error("[demo] No production build found. Run `npm run build` first, or drop --prod.");
  process.exit(1);
}

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, prod ? "start" : "dev", "-p", String(port)], { stdio: "inherit", env: process.env });
server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

function openBrowser(target: string) {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const cmdArgs = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  try {
    spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).unref();
  } catch {
    console.log(`[demo] Open ${target} in your browser.`);
  }
}

async function waitUntilReady(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${url}/api/link`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

waitUntilReady().then(() => {
  console.log(`\n[demo] Hygieia is ready on ${url} — Day ${DEMO_DAY}, Transit profile.`);
  console.log("[demo] Storyline: crew dashboard → Haddad → slider → Emergency → profile toggle to Mars surface base.\n");
  if (!args.includes("--no-open")) openBrowser(url);
});
