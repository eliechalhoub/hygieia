"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setMissionDay, setProfile } from "@/lib/actions";
import { cn, formatDelay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { IconChat, IconMinus, IconPlus, IconSignal, Logo } from "@/components/icons";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ProductTour } from "@/components/shell/product-tour";
import { translator, type Key, type Lang } from "@/lib/i18n";

export interface ShellMission {
  currentDay: number;
  maxDay: number;
  profileId: string;
  profileLabel: string;
  delaySeconds: number;
  delayLabel: string;
  earth?: boolean;
}

interface ShellProps {
  mission: ShellMission;
  crew: { id: number; name: string; shortName: string }[];
  profiles: { id: string; label: string }[];
  lang: Lang;
  children: React.ReactNode;
}

interface LinkState {
  inTransit: { id: number; direction: string; subject: string; sentAt: string; deliverAt: string }[];
}

const NAV: { href: string; key: Key }[] = [
  { href: "/", key: "nav.crew" },
  { href: "/space-weather", key: "nav.weather" },
  { href: "/kb", key: "nav.kb" },
  { href: "/sources", key: "nav.sources" },
  { href: "/about", key: "nav.about" },
];

function useOnline(): boolean {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function AppShell({ mission, crew, profiles, lang, children }: ShellProps) {
  const t = translator(lang);
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [chatOpen, setChatOpen] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<LinkState>({ inTransit: [] });
  const online = useOnline();
  const isTriage = pathname.startsWith("/triage");
  const isHouston = pathname.startsWith("/houston");
  const match = pathname.match(/^\/astronaut\/(\d+)/);
  const activeAstronaut = match ? Number(match[1]) : null;

  // Remember the last astronaut so the chat and the emergency screen know who is using the app.
  const [lastAstronaut, setLastAstronaut] = React.useState<number>(crew[0]?.id ?? 1);
  React.useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem("hygieia_astronaut"));
      if (activeAstronaut) {
        window.localStorage.setItem("hygieia_astronaut", String(activeAstronaut));
        setLastAstronaut(activeAstronaut);
      } else if (stored) setLastAstronaut(stored);
    } catch { /* storage unavailable */ }
  }, [activeAstronaut]);

  // Poll the delayed link. When something arrives, refresh server data.
  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/link", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (stop) return;
        setLink({ inTransit: data.inTransit });
        if (data.deliveredJustNow > 0) router.refresh();
      } catch { /* server unreachable: onboard functions keep working */ }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [router]);

  // Offline app shell. Production only.
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      // Development: remove a worker left behind by a production run on this
      // address, so it cannot serve scripts from an older build.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  // A failed write must never take the page down: report it and stay where we are.
  // The header shows the chosen day and profile at once, while the page catches up.
  const [optimistic, setOptimistic] = React.useOptimistic<{ day: number; profileId: string }, Partial<{ day: number; profileId: string }>>(
    { day: mission.currentDay, profileId: mission.profileId },
    (state, patch) => ({ ...state, ...patch }),
  );
  const run = (what: string, patch: Partial<{ day: number; profileId: string }>, fn: () => Promise<unknown>) => startTransition(async () => {
    setOptimistic(patch);
    try {
      setFailed(null);
      // The action revalidates the layout, so its response already carries the new page.
      await fn();
    } catch {
      setFailed(`Could not ${what}. Reload the page and try again.`);
    }
  });
  const jump = (day: number) => {
    if (!Number.isFinite(day)) return;
    const target = Math.max(1, Math.min(mission.maxDay, Math.round(day)));
    if (target !== optimistic.day) run("change the mission day", { day: target }, () => setMissionDay(target));
  };
  const changeProfile = (id: string) => run("switch profile", { profileId: id }, () => setProfile(id));

  if (isTriage) return <>{children}</>;

  const onCrew = pathname === "/" || pathname.startsWith("/astronaut");
  const tab = "rounded-full px-3.5 py-1.5 text-sm transition-colors";
  const tabOn = "bg-teal/15 text-teal ring-1 ring-teal/50";
  const tabOff = "text-soft hover:bg-panel hover:text-ink";

  return (
    <div className="flex min-h-screen flex-col">
      <div className="space-bg" aria-hidden />
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/95">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Hygieia home">
            <Logo />
            <span className="gradient-text font-display text-xl font-semibold tracking-tight">Hygieia</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map((n) => {
              const active = n.href === "/" ? onCrew : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("rounded-full px-3 py-1.5 text-sm text-soft transition-colors hover:text-ink", active && "bg-panel-hi text-ink")}>
                  {t(n.key)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {/* Role switcher */}
            <div className="flex rounded-full border border-line bg-bg-alt/70 p-0.5" role="group" aria-label="Role">
              <Link href={`/astronaut/${lastAstronaut}`} data-testid="role-astronaut" className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", !isHouston ? "bg-teal text-bg" : "text-soft hover:text-ink")}>{t(mission.earth ? "role.worker" : "role.astronaut")}</Link>
              <Link href="/houston" data-testid="role-houston" className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", isHouston ? "bg-coral text-bg" : "text-soft hover:text-ink")}>{t(mission.earth ? "role.doctor" : "role.houston")}</Link>
            </div>

            {/* Mission controls: where, when, and the link home */}
            <div className="flex items-center divide-x divide-line rounded-full border border-line bg-bg-alt/70">
              <Select aria-label="Environment profile" data-testid="profile-select" value={optimistic.profileId} disabled={pending} onChange={(e) => changeProfile(e.target.value)} className="h-8 rounded-full border-0 bg-transparent pl-3 text-xs">
                {profiles.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
              </Select>
              <div className="flex items-center gap-0.5 px-1" aria-label="Mission day">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="Previous day" disabled={optimistic.day <= 1} onClick={() => jump(optimistic.day - 1)}><IconMinus /></Button>
                <label className="flex items-center gap-1">
                  <span className="label">{t("header.day")}</span>
                  <input
                    key={optimistic.day}
                    data-testid="mission-day"
                    aria-label="Mission day"
                    type="number" min={1} max={mission.maxDay} defaultValue={optimistic.day}
                    onKeyDown={(e) => { if (e.key === "Enter") jump(Number((e.target as HTMLInputElement).value)); }}
                    onBlur={(e) => { if (e.target.value.trim() !== "") jump(Number(e.target.value)); }}
                    className="num w-11 bg-transparent text-center text-sm font-semibold text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </label>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="Next day" disabled={optimistic.day >= mission.maxDay} onClick={() => jump(optimistic.day + 1)}><IconPlus /></Button>
              </div>
              <Link href="/houston#link" data-testid="link-status" className="flex h-8 items-center gap-1.5 px-3 text-xs text-soft hover:text-ink" title={mission.delayLabel}>
                <IconSignal className={link.inTransit.length ? "animate-glow text-coral" : "text-teal"} />
                <span className="num">{formatDelay(mission.delaySeconds)} {t("header.delay")}</span>
                {link.inTransit.length > 0 && <span className="num rounded-full bg-coral/20 px-1.5 text-coral">{link.inTransit.length} {t("header.inTransit")}</span>}
              </Link>
            </div>

            {!online && (
              <span data-testid="offline-badge" className="rounded-full border border-warn/60 bg-warn/10 px-2.5 py-1 font-mono text-xs uppercase text-warn">{t("header.offline")}</span>
            )}

            <ProductTour />
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen} data-testid="chat-toggle"><IconChat /> {t("header.ask")}</Button>
          </div>
        </div>

        {/* Crew filter: only on the crew pages, where it means something. */}
        {onCrew && (
          <nav aria-label="Crew member" data-testid="astronaut-picker" className="border-t border-line/50">
            <div className="mx-auto flex max-w-[1320px] items-center gap-1.5 overflow-x-auto px-5 py-2">
              <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={cn(tab, pathname === "/" ? tabOn : tabOff)}>{t("crew.all")}</Link>
              {crew.map((c) => {
                const on = activeAstronaut === c.id;
                return (
                  <Link key={c.id} href={`/astronaut/${c.id}`} data-testid={`crew-tab-${c.id}`} aria-current={on ? "page" : undefined} className={cn(tab, "flex items-center gap-2 whitespace-nowrap", on ? tabOn : tabOff)}>
                    <span aria-hidden className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-semibold", on ? "bg-teal text-bg" : "bg-panel-hi text-soft")}>{c.shortName.charAt(0)}</span>
                    {c.name}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {failed && (
        <div role="alert" className="mx-auto mt-3 w-full max-w-[1320px] px-5">
          <p className="flex items-center justify-between gap-3 rounded-lg border border-bad/60 bg-bad/10 px-4 py-2 text-sm text-ink">
            {failed}
            <button type="button" className="cursor-pointer text-soft hover:text-ink" onClick={() => setFailed(null)} aria-label="Dismiss">✕</button>
          </p>
        </div>
      )}

      <div className="flex flex-1">
        <main className={cn("mx-auto w-full max-w-[1320px] flex-1 px-5 py-7 transition-opacity", pending && "opacity-70")} aria-busy={pending}>
          <div key={pathname} className="animate-fade-in">{children}</div>
        </main>
        {chatOpen && <ChatPanel astronautId={lastAstronaut} crew={crew} onClose={() => setChatOpen(false)} />}
      </div>

      <footer className="border-t border-line/60 px-5 py-5 text-center text-xs text-soft">
        <span className="font-display text-ink">Hygieia</span> — {t("footer.named")}{" "}
        {lang !== "en" && <span className="block">{t("note.clinical")}</span>}
        <Link className="text-teal hover:underline" href="/about">About</Link> · <Link className="text-teal hover:underline" href="/sources">Sources</Link>
        <span data-testid="si-footer" className="si-mark mt-1.5 block">Interface and graphics are SI-generated · <Link className="hover:underline" href="/about#si">Use of SI</Link></span>
      </footer>

      {/* Persistent emergency button */}
      <Link
        href={`/triage?astronaut=${lastAstronaut}`}
        data-testid="emergency-button"
        aria-label="Emergency triage"
        className={cn(
          "fixed bottom-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-bad text-bg shadow-[0_10px_30px_-6px_rgba(255,92,108,0.7)] transition-all hover:scale-110",
          chatOpen ? "left-6 right-auto sm:left-auto sm:right-[25.5rem]" : "right-6",
        )}
      >
        <span aria-hidden className="absolute inset-0 animate-ring rounded-full border-2 border-bad" />
        <span className="font-display text-sm font-bold tracking-wide">SOS</span>
      </Link>
    </div>
  );
}
