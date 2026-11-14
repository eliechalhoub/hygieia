import { SourceLink } from "@/components/source-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { gLevelFromKp, heatCategory, heatIndexC, loadKp, loadLightTime, loadPower, marsLightMinutes, missionDate } from "@/lib/data/environment";
import type { Key } from "@/lib/i18n";
import type { Profile } from "@/lib/profiles";

/** Earth mode: outdoor heat stress from real NASA POWER weather at the clinic site. */
export function HeatCard({ t }: { t: (key: Key) => string }) {
  const power = loadPower();
  if (!power || power.series.length === 0) return null;
  const rows = power.series.slice(-14).map((d) => {
    const hi = heatIndexC(d.t_max_c, d.rh_pct);
    return { ...d, hi, cat: heatCategory(hi) };
  });
  const today = rows[rows.length - 1];
  const max = Math.max(...rows.map((r) => r.hi), 45);
  return (
    <Card data-testid="heat-card">
      <CardHeader>
        <div>
          <CardTitle>{t("heat.title")}</CardTitle>
          <p className="text-xs text-soft">{power.site.name}. Real weather from NASA POWER <SourceLink id="nasa-power" />; heat index and categories from the U.S. National Weather Service <SourceLink id="nws-heat-index" />.</p>
        </div>
        <StatusPill status={today.cat.status} label={today.cat.word} />
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[auto_1fr]">
        <dl className="space-y-2">
          <div>
            <dt className="label">{t("heat.index")}</dt>
            <dd data-testid="heat-index" className="num font-display text-4xl font-semibold">{today.hi.toFixed(1)} <span className="text-base font-normal text-soft">°C</span></dd>
          </div>
          <div><dt className="label">{t("heat.air")}</dt><dd className="num text-ink">{today.t_max_c.toFixed(1)} °C</dd></div>
          <div><dt className="label">{t("heat.humidity")}</dt><dd className="num text-ink">{today.rh_pct.toFixed(0)} %</dd></div>
          <p className="text-xs text-soft">Latest day in the snapshot: <span className="num">{today.date}</span></p>
        </dl>
        <div>
          <p className="label mb-1">{t("heat.last")}</p>
          <ul className="space-y-1" aria-label="Heat index by day">
            {rows.map((r) => (
              <li key={r.date} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-2 text-xs">
                <span className="num text-soft">{r.date.slice(5)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (r.hi / max) * 100)}%`, background: r.cat.status === "red" ? "#ff5c6c" : r.cat.status === "amber" ? "#f5b841" : "#3dd68c" }} />
                </span>
                <span className="num text-ink">{r.hi.toFixed(1)} °C <span className="text-soft">{r.cat.word}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-soft">
            On Caution days and above: plan outdoor work for the early morning and add fluids.{" "}
            The heat index uses the daily maximum temperature with the daily mean humidity, so it slightly overstates the afternoon value.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Real link delay for today's mission date, from the JPL Horizons snapshot. */
export function RealDelayNote({ profile, day }: { profile: Profile; day: number }) {
  const snap = loadLightTime();
  if (!snap) return null;
  if (profile.id === "transit" || profile.id === "mars") {
    const date = missionDate(day);
    const now = marsLightMinutes(snap, date);
    if (!now) return null;
    return (
      <p data-testid="real-delay" className="rounded-xl border border-line bg-bg-alt/60 px-4 py-2.5 text-sm text-soft">
        Real Earth–Mars one-way light time on mission Day {day}: <span className="num font-semibold text-ink">{now.minutes.toFixed(1)} min</span>{" "}
        · range <span className="num text-ink">{snap.mars.min_minutes.toFixed(1)}–{snap.mars.max_minutes.toFixed(1)} min</span> <SourceLink id="jpl-horizons" label="NASA/JPL Horizons" />
      </p>
    );
  }
  if (profile.id === "lunar") {
    return (
      <p data-testid="real-delay" className="rounded-xl border border-line bg-bg-alt/60 px-4 py-2.5 text-sm text-soft">
        Real Earth–Moon one-way light time: <span className="num font-semibold text-ink">{snap.moon.mean_seconds.toFixed(2)} s</span> on average
        (<span className="num">{snap.moon.min_seconds.toFixed(2)}–{snap.moon.max_seconds.toFixed(2)} s</span> over a month). <SourceLink id="jpl-horizons" label="NASA/JPL Horizons" />
      </p>
    );
  }
  return null;
}

/** Geomagnetic activity (NOAA planetary K index). Mostly relevant in low Earth orbit. */
export function KpCard() {
  const kp = loadKp();
  if (!kp || kp.series.length === 0) return null;
  const latest = kp.series[kp.series.length - 1];
  const peak = kp.series.reduce((a, b) => (b.kp > a.kp ? b : a));
  const g = gLevelFromKp(latest.kp);
  const gPeak = gLevelFromKp(peak.kp);
  return (
    <Card data-testid="kp-card">
      <CardHeader>
        <div>
          <CardTitle>Geomagnetic activity</CardTitle>
          <p className="text-xs text-soft">Planetary K index, latest real readings. Matters most in low Earth orbit (Station profile).</p>
        </div>
        <SourceLink id="noaa-swpc-kp" />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span data-testid="kp-now" className="num font-display text-3xl font-semibold">Kp {latest.kp.toFixed(2).replace(/\.00$/, "")}</span>{" "}
          <span className="text-soft">— {g === 0 ? "below storm level" : `G${g} geomagnetic storm`} at <span className="num">{latest.time.slice(0, 16).replace("T", " ")} UTC</span></span></p>
        <p className="text-soft">Peak in the snapshot: <span className="num text-ink">Kp {peak.kp}</span> on <span className="num">{peak.time.slice(0, 10)}</span>{gPeak > 0 ? ` (G${gPeak})` : ""}. NOAA G-scale: G1 starts at <span className="num">Kp 5</span>.</p>
        <div className="flex h-10 items-end gap-px" role="img" aria-label={`Kp over the last ${kp.series.length} three-hour periods; peak ${peak.kp}.`}>
          {kp.series.map((p) => (<span key={p.time} title={`${p.time.slice(0, 16)} · Kp ${p.kp}`} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(6, (p.kp / 9) * 100)}%`, background: p.kp >= 5 ? "#ff5c6c" : p.kp >= 4 ? "#f5b841" : "#3dd6c4" }} />))}
        </div>
        <p className="text-xs text-soft">Snapshot fetched <span className="num">{kp.fetched_at?.slice(0, 10)}</span>. Listed for context; it raises no onboard alert.</p>
      </CardContent>
    </Card>
  );
}
