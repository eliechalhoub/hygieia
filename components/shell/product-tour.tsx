"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { Button } from "@/components/ui/button";

// Product tour (driver.js). Each page has its own short tour; the header
// controls are explained at the end of every one. A step whose element is not
// on the page (for example a card hidden in another profile) is skipped.

type Step = { el?: string; title: string; text: string; side?: "top" | "bottom" | "left" | "right" };
const id = (testid: string) => `[data-testid="${testid}"]`;

const HEADER: Step[] = [
  { el: id("profile-select"), title: "Environment profile", text: "Transit, Station, Lunar base, Mars surface or a Remote clinic on Earth. Kit, thresholds, dose rate and link delay all change with it.", side: "bottom" },
  { el: id("mission-day"), title: "Mission clock", text: "Jump to any mission day. Day 143 is where the demo story starts.", side: "bottom" },
  { el: id("link-status"), title: "Link with Earth", text: "The one-way delay, and how many messages are travelling right now.", side: "bottom" },
  { el: id("chat-toggle"), title: "Ask Hygieia", text: "An optional AI assistant. It reads only what the astronaut shares. Nothing else in the app depends on it.", side: "bottom" },
  { el: id("emergency-button"), title: "Emergency", text: "One red button on every page. Triage works with no network and no AI.", side: "left" },
];

const TOURS: { match: RegExp; name: string; steps: Step[] }[] = [
  {
    match: /^\/astronaut\/\d+\/check/, name: "Daily check",
    steps: [
      { title: "Daily check", text: "Where a crew member logs what sensors cannot see, and runs self-tests." },
      { el: id("tab-log"), title: "Daily log", text: "Fluids, food, exercise, mood and shared crew time. Saving re-runs the rules and standing orders at once.", side: "bottom" },
      { el: id("tab-pvt"), title: "Reaction test", text: "A 60-second vigilance test, compared with the person's own baseline.", side: "bottom" },
      { el: id("tab-vision"), title: "Vision check", text: "A screening prompt for eye changes in spaceflight. It is not a diagnosis.", side: "bottom" },
      { el: id("tab-journal"), title: "Private journal", text: "Never shared. Houston and the assistant cannot read it.", side: "bottom" },
    ],
  },
  {
    match: /^\/astronaut\/\d+/, name: "Astronaut dashboard",
    steps: [
      { title: "One crew member", text: "Everything here is judged against this person's own baseline, not an average." },
      { el: id("score-card"), title: "Readiness", text: "One number from 0 to 100, the status in a word, and the reason in plain language.", side: "bottom" },
      { el: id("readiness-banner"), title: "Go or no-go", text: "Projected readiness on the day of an upcoming task, with a green, trained crew member suggested as a swap.", side: "bottom" },
      { el: id("region-head"), title: "Body map", text: "Each region takes the colour of its worst measure. Select a region to see its charts.", side: "right" },
      { el: id("path-card"), title: "Path back to green", text: "The smallest change that fixes the drift. Drag the sliders and the projected recovery day moves.", side: "left" },
      { el: "#trends", title: "Trends", text: "Readings against the personal baseline, with a 7-day forecast band. The engine says so when it cannot forecast.", side: "top" },
      { el: id("alerts-card"), title: "Alerts and standing orders", text: "Early warnings with their reasons, and advice the flight surgeon pre-authorised.", side: "top" },
      { el: id("radiation-card"), title: "Radiation", text: "Dose from published measurements, with real solar particle events replayed from NASA data.", side: "top" },
      { el: id("sharing-card"), title: "Shared with Earth", text: "The crew member chooses which categories Houston and the assistant can see.", side: "left" },
    ],
  },
  {
    match: /^\/houston/, name: "Houston console",
    steps: [
      { title: "Houston", text: "The flight surgeon's view. Everything here crossed the delayed link." },
      { el: id("houston-crew-1"), title: "Shared data only", text: "Status is computed from what each astronaut shares. Hidden categories are named, not shown.", side: "bottom" },
      { el: id("orders-card"), title: "Standing orders", text: "Write a rule in advance. The ship applies it on its own and puts your name on the alert.", side: "right" },
      { el: id("link-card"), title: "Delayed link", text: "Messages in transit in both directions, with the real light-time for today.", side: "left" },
      { el: id("inbox-card"), title: "Inbox", text: "Messages that completed the trip, including compressed incident reports.", side: "top" },
    ],
  },
  {
    match: /^\/space-weather/, name: "Space weather",
    steps: [
      { title: "Space weather", text: "Real data from NASA and NOAA, read from snapshots so the app works offline." },
      { el: id("s-level-now"), title: "Radiation storm level", text: "The NOAA S-scale, from the latest proton flux reading.", side: "right" },
      { el: id("dose-impact"), title: "Dose impact", text: "What each replayed solar particle event added to the crew's dose.", side: "top" },
      { el: "#shelter", title: "Storm-shelter checklist", text: "What the crew does when a solar particle event starts.", side: "left" },
      { el: id("kp-card"), title: "Geomagnetic activity", text: "The planetary K index. Most relevant in low Earth orbit.", side: "top" },
      { el: id("events-card"), title: "Replayed events", text: "Each real event, the mission day it was placed on, and a link to its NASA record.", side: "top" },
    ],
  },
  {
    match: /^\/$/, name: "Crew dashboard",
    steps: [
      { title: "Welcome to Hygieia", text: "An onboard crew-health assistant for missions where the flight surgeon is up to 22 minutes away. This tour takes about a minute." },
      { el: id("crew-card-haddad"), title: "Crew roster", text: "Each crew member with a status colour and word, a readiness score and one line of explanation. Select a card to open their dashboard.", side: "bottom" },
      { el: id("tasks-card"), title: "Upcoming tasks", text: "Go or no-go for each task, with a swap suggested when someone is not ready.", side: "right" },
      { el: id("space-weather-panel"), title: "Space weather", text: "The current radiation storm level and real solar particle events.", side: "left" },
      { el: id("heat-card"), title: "Outdoor heat", text: "Earth mode: a heat index from real NASA weather data for the clinic site.", side: "bottom" },
      { el: id("crew-alerts-card"), title: "Alerts today", text: "Everything the onboard rules raised, with the reason for each.", side: "top" },
      { el: id("cabin-card"), title: "Cabin environment", text: "CO₂, pressure, temperature, noise and light against their limits.", side: "top" },
      { el: id("team-goals-card"), title: "Team goals", text: "Cooperative streaks. The crew succeeds together; there is no leaderboard.", side: "top" },
      { el: id("earth-link-card"), title: "Link with Earth", text: "Messages queue here and arrive after the one-way delay.", side: "top" },
    ],
  },
];

const GENERIC: Step[] = [{ title: "Hygieia", text: "This page has no guided steps of its own. Here are the controls that are on every page." }];

export function ProductTour({ label = "Tour" }: { label?: string }) {
  const pathname = usePathname();
  const start = React.useCallback(() => {
    const tour = TOURS.find((t) => t.match.test(pathname));
    const steps: DriveStep[] = [...(tour?.steps ?? GENERIC), ...HEADER]
      .filter((s) => !s.el || document.querySelector(s.el))
      .map((s) => ({ element: s.el, popover: { title: s.title, description: s.text, side: s.side, align: "start" } }));
    driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      allowClose: true,
      smoothScroll: true,
      stagePadding: 6,
      stageRadius: 12,
      overlayColor: "#04070f",
      overlayOpacity: 0.72,
      popoverClass: "hygieia-tour",
      steps,
    }).drive();
  }, [pathname]);

  return (
    <Button variant="secondary" size="sm" className="rounded-full" onClick={start} data-testid="tour-start" aria-label="Start the guided tour of this page">
      <span aria-hidden>?</span> {label}
    </Button>
  );
}
