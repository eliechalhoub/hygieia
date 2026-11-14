import path from "node:path";
import { defineConfig } from "@playwright/test";

// Smoke test of the demo storyline against a production build on port 3100,
// with its own freshly seeded database. Run `npm run test:e2e`.
//
// Browser: uses an installed Edge on Windows so nothing is downloaded. Set
// PW_CHANNEL=chrome (or run `npx playwright install chromium` and set
// PW_CHANNEL=chromium) to use another browser.
const PORT = 3100;
const DB = path.join(__dirname, "hygieia-e2e.db");
const channel = process.env.PW_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chrome");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: channel === "chromium" ? undefined : channel,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx tsx scripts/seed.ts --day 143 --profile transit && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/link`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { HYGIEIA_DB: DB },
  },
});
