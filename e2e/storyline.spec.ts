import { expect, test, type Page } from "@playwright/test";

// Walks the scripted demo storyline (section 11 of the brief), steps 1–8.

async function say(page: Page, text: string) {
  // Typed commands take the same path as spoken ones.
  await page.getByTestId("triage-command").fill(text);
  await page.getByTestId("triage-command").press("Enter");
}

async function setProfile(page: Page, id: string) {
  await page.getByTestId("profile-select").selectOption(id);
  await expect(page.getByTestId("profile-select")).toHaveValue(id);
  await expect(page.getByTestId("profile-select")).toBeEnabled();
}

test.describe.configure({ mode: "serial" });

test("demo storyline, steps 1–8", async ({ page, context }) => {
  // Step 1 — crew dashboard on Day 143: three green, Haddad red.
  await page.goto("/");
  await expect(page.getByTestId("current-day")).toHaveText("143");
  await expect(page.getByTestId("crew-card-haddad")).toHaveAttribute("data-status", "red");
  for (const name of ["sato", "oliveira", "okafor"]) {
    await expect(page.getByTestId(`crew-card-${name}`)).toHaveAttribute("data-status", "green");
  }
  await expect(page.getByTestId("crew-summary")).toContainText("3 green, 0 amber, 1 red");

  // Step 3 (crew view) — Day 145 spacewalk is no-go; Sato is the suggested swap.
  const eva = page.getByTestId("task-EVA-145");
  await expect(eva).toHaveAttribute("data-go", "false");
  await expect(eva.getByTestId("swap-suggestion")).toContainText("Sato");

  // Step 2 — Haddad's dashboard: head red, heart amber or red, smallest path back to green.
  await page.getByTestId("crew-card-haddad").click();
  await expect(page.getByTestId("astronaut-name")).toHaveText("Leila Haddad");
  await expect(page.getByTestId("region-head")).toHaveAttribute("data-status", "red");
  await expect(page.getByTestId("region-heart")).toHaveAttribute("data-status", /amber|red/);
  await expect(page.getByTestId("path-summary")).toHaveText("Sleep 7 h for 2 nights + 1 h shared crew time.");
  await expect(page.getByTestId("path-green-day")).toContainText("Day 146");

  // Step 3 — readiness banner on the astronaut page.
  const banner = page.getByTestId("readiness-banner").first();
  await expect(banner).toContainText("Day 145 spacewalk");
  await expect(banner).toContainText("not ready");
  await expect(banner).toContainText("Suggested swap: Sato");

  // Step 4 — drag "sleep tonight": the projected recovery day moves.
  await expect(page.getByTestId("projected-day")).toHaveAttribute("data-day", "146");
  const thumb = page.getByTestId("sleep-slider").getByRole("slider");
  await thumb.focus();
  await thumb.press("ArrowLeft");
  await thumb.press("ArrowLeft");
  await expect(page.getByTestId("sleep-value")).toHaveText("6.0 h");
  const moved = Number(await page.getByTestId("projected-day").getAttribute("data-day"));
  expect(moved).toBeGreaterThan(146);

  // Step 5 — the standing order has fired after two short nights, with Houston's name on it.
  const order = page.getByTestId("standing-order-alert").first();
  await expect(order).toContainText("Standing order from Dr. Nadia Rahme");
  await expect(order.getByTestId("authorised-by")).toContainText("Pre-authorised by Dr. Nadia Rahme");

  // Step 6 — the real SEP replayed on Day 120 shows in the dose chart with its source.
  const radiation = page.getByTestId("radiation-card");
  await expect(radiation.getByTestId("dose-rate")).toHaveText("1.8 mSv/day");
  await expect(radiation.getByTestId("sep-note")).toContainText("Day 120");
  await expect(radiation.getByTestId("sep-note")).toContainText("2026-09-05");
  await expect(radiation.getByTestId("sep-note").getByRole("link", { name: /DONKI record/ })).toHaveAttribute("href", /ccmc\.gsfc\.nasa\.gov\/DONKI/);
  await expect(radiation.getByTestId("transit-share")).toContainText("Most dose is received in transit");
  // Every sourced number links to /sources#<id>.
  await expect(radiation.locator('a[data-source="msl-rad-cruise"]').first()).toHaveAttribute("href", "/sources#msl-rad-cruise");

  // Step 7 — emergency: chest pain → vitals → CPR metronome → compressed report in transit.
  await page.getByTestId("emergency-button").click();
  await expect(page.getByTestId("triage")).toBeVisible();
  await expect(page.getByTestId("triage-tree-chest_pain")).toBeVisible();
  // The triage path needs no network: go offline until the report is sent.
  await context.setOffline(true);
  await say(page, "chest pain");
  await expect(page.getByTestId("triage-prompt")).toHaveAttribute("data-node", "responsive");
  await say(page, "yes");
  await expect(page.getByTestId("triage-prompt")).toHaveAttribute("data-node", "breathing_awake");
  await say(page, "yes");
  await expect(page.getByTestId("triage-prompt")).toHaveAttribute("data-node", "vitals");
  await page.getByTestId("vital-spo2").fill("93");
  await page.getByTestId("vital-hr").fill("118");
  await page.getByTestId("vital-bp_sys").fill("150");
  await page.getByTestId("vital-bp_dia").fill("95");
  await page.getByTestId("triage-option-0").click();
  // Transit has no ECG on board, so that step is skipped.
  await expect(page.getByTestId("triage-prompt")).toHaveAttribute("data-node", "pain_type");
  await say(page, "yes");
  await expect(page.getByTestId("triage-cause")).toContainText("Possible cardiac cause");
  await say(page, "start CPR");
  await expect(page.getByTestId("cpr-screen")).toBeVisible();
  await expect(page.getByTestId("cpr-bpm")).toHaveText("110");
  await expect(page.getByTestId("cpr-method")).toHaveText("Evetts-Russomano method");
  await expect.poll(async () => Number(await page.getByTestId("cpr-count").textContent()), { timeout: 10_000 }).toBeGreaterThanOrEqual(5);
  // 110 per minute: about 11 compressions in 6 seconds.
  const c0 = Number(await page.getByTestId("cpr-count").textContent());
  await page.waitForTimeout(6000);
  const c1 = Number(await page.getByTestId("cpr-count").textContent());
  expect(c1 - c0).toBeGreaterThanOrEqual(10);
  expect(c1 - c0).toBeLessThanOrEqual(12);
  await context.setOffline(false);
  await page.getByTestId("cpr-stop").click();
  const sizes = page.getByTestId("report-sizes");
  await expect(sizes).toBeVisible();
  const raw = Number(await sizes.getAttribute("data-raw"));
  const gz = Number(await sizes.getAttribute("data-gzip"));
  expect(gz).toBeGreaterThan(0);
  expect(gz).toBeLessThan(raw);
  await expect(page.getByTestId("report-transit")).toHaveAttribute("data-state", "in_transit");
  await expect(page.getByTestId("report-transit")).toContainText("In transit to Earth");
  await expect(page.getByTestId("triage-log")).toContainText("SpO₂ 93 %");
  // Houston cannot see it yet; it is still travelling.
  await page.goto("/houston");
  await expect(page.getByTestId("in-transit").first()).toContainText("Incident report: Chest pain");
  await expect(page.getByTestId("not-shared").first()).toContainText("Mood");

  // Step 8 — profile toggle: Transit → Mars surface base changes dose rate, kit, thresholds and a triage step.
  await page.goto("/astronaut/1");
  await expect(page.getByTestId("kit-list")).not.toContainText("12-lead ECG");
  await setProfile(page, "mars");
  await expect(page.getByTestId("radiation-card").getByTestId("dose-rate")).toHaveText("0.67 mSv/day");
  await expect(page.getByTestId("kit-list")).toContainText("12-lead ECG");
  await expect(page.getByTestId("profile-card")).toContainText("Mars surface base");
  await expect(page.getByTestId("profile-card")).toContainText("Balance check after landing");
  await page.goto("/triage?astronaut=1");
  await say(page, "chest pain");
  await say(page, "yes");
  await say(page, "yes");
  await page.getByTestId("vital-spo2").fill("89");
  // Mars surface uses a different SpO₂ hard limit (88 %): 89 % is not flagged here.
  await expect(page.getByTestId("triage-low-spo2")).toHaveCount(0);
  await page.getByTestId("triage-option-0").click();
  await expect(page.getByTestId("triage-prompt")).toHaveAttribute("data-node", "ecg");
  await page.getByTestId("triage-option-0").click();
  await expect(page.getByTestId("triage-prompt")).toHaveAttribute("data-node", "recent_eva");
  await page.getByTestId("triage-exit").click();
  await setProfile(page, "transit");
  await expect(page.getByTestId("radiation-card").getByTestId("dose-rate")).toHaveText("1.8 mSv/day");
});

test("a new standing order travels the delayed link, then fires on board with the surgeon's name", async ({ page }) => {
  // Lunar base: about 1.3 s one way (2 s in the demo), so the wait is short.
  await page.goto("/houston");
  await setProfile(page, "lunar");
  await page.getByTestId("order-metric").selectOption("hydration");
  await page.getByTestId("order-operator").selectOption("<");
  await page.getByTestId("order-value").fill("9");
  await page.getByTestId("order-days").fill("1");
  await page.getByTestId("order-advice").fill("Drink 500 mL now and log it.");
  await page.getByTestId("order-submit").click();
  await expect(page.getByTestId("order-note")).toContainText("Order sent");
  const mine = page.getByTestId("standing-order").filter({ hasText: "Drink 500 mL now" });
  await expect(mine).toHaveAttribute("data-active", "true", { timeout: 20_000 });
  await page.goto("/astronaut/2");
  const alert = page.getByTestId("standing-order-alert").filter({ hasText: "Drink 500 mL now" });
  await expect(alert).toBeVisible();
  await expect(alert.getByTestId("authorised-by")).toContainText("Dr. Nadia Rahme");
  await setProfile(page, "transit");
});

test("pages render: space weather, sources, knowledge base, about, check, chat fallback", async ({ page }) => {
  await page.goto("/space-weather");
  await expect(page.getByTestId("s-level-now")).toContainText(/^S\d/);
  await expect(page.getByTestId("impact-day-120")).toContainText("2026-09-05");

  await page.goto("/sources#msl-rad-cruise");
  await expect(page.locator("#msl-rad-cruise")).toContainText("1.8");
  expect(await page.getByTestId("source").count()).toBeGreaterThan(20);
  await expect(page.getByTestId("snapshots-card")).toContainText("donki.json");

  await page.goto("/kb");
  await expect(page.getByTestId("kb-note")).toHaveCount(18);
  await expect(page.getByTestId("kb-evidence").first()).toContainText("OSD-");

  await page.goto("/about");
  await expect(page.locator("body")).toContainText("Greek goddess of health");
  await expect(page.getByTestId("team")).toContainText("Elie Chalhoub");
  await expect(page.getByTestId("risks-card").locator('a[href^="/kb#"]')).toHaveCount(17);
  await expect(page.getByTestId("honesty-notes")).toContainText("Bone loss is inferred from exercise adherence");

  await page.goto("/astronaut/2/check");
  await page.getByTestId("log-hydration").fill("2.4");
  await page.getByTestId("log-save").click();
  await expect(page.getByTestId("log-saved")).toContainText("Saved");
  await page.getByTestId("tab-vision").click();
  await expect(page.getByTestId("vision-start")).toBeVisible();
  await page.getByTestId("tab-pvt").click();
  await expect(page.getByTestId("pvt-start")).toBeVisible();

  // Chat: with no API key the panel says so, and the rest of the app keeps working.
  if (!process.env.OPENAI_API_KEY) {
    await page.getByTestId("chat-toggle").click();
    await page.getByTestId("chat-input").fill("Why am I green?");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-notice")).toContainText("Chat unavailable", { timeout: 30_000 });
  }
});

test("Earth mode: Remote clinic profile, real heat card, language toggle with right-to-left Arabic", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("real-delay")).toContainText("Real Earth–Mars one-way light time");
  await setProfile(page, "clinic");
  await expect(page.getByTestId("heat-card")).toBeVisible();
  await expect(page.getByTestId("heat-index")).toContainText("°C");
  await expect(page.getByTestId("real-delay")).toHaveCount(0);
  await page.getByTestId("lang-select").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("navigation", { name: "Main" })).toContainText("الطاقم");
  await page.getByTestId("lang-select").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("navigation", { name: "Main" })).toContainText("Équipage");
  await page.getByTestId("lang-select").selectOption("en");
  await page.goto("/astronaut/1");
  await expect(page.getByTestId("earth-dose-note")).toBeVisible();
  await expect(page.getByTestId("radiation-card").getByTestId("sep-note")).toHaveCount(0);
  await page.goto("/triage?astronaut=1");
  await page.getByTestId("triage-cpr-now").click();
  await expect(page.getByTestId("cpr-method")).toHaveText("Chest compressions");
  await page.getByTestId("triage-exit").click();
  await setProfile(page, "transit");
  await page.goto("/space-weather");
  await expect(page.getByTestId("kp-now")).toContainText("Kp");
});

test("product tour: guided steps on the astronaut dashboard", async ({ page }) => {
  await page.goto("/astronaut/1");
  await page.getByTestId("tour-start").click();
  const popover = page.locator(".driver-popover");
  await expect(popover).toContainText("One crew member");
  const next = page.locator(".driver-popover-next-btn");
  const progress = page.locator(".driver-popover-progress-text");
  await next.click();
  await expect(popover).toContainText("Readiness");
  await expect(progress).toHaveText(/^2 of \d+$/);
  const total = Number((await progress.textContent())!.split(" of ")[1]);
  expect(total).toBeGreaterThanOrEqual(10);
  for (let step = 3; step <= total; step++) {
    await next.click();
    await expect(progress).toHaveText(`${step} of ${total}`);
  }
  await expect(popover).toContainText("Emergency");
  await expect(next).toHaveText("Done");
  await next.click();
  await expect(popover).toHaveCount(0);
});
