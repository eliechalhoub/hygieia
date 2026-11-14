import { ComposeMessage, OrderToggle, StandingOrderForm } from "@/components/houston/forms";
import { LinkQueue } from "@/components/houston/link-queue";
import { RealDelayNote } from "@/components/environment-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { SURGEON } from "@/lib/db/seed";
import { METRICS, METRIC_BY_ID, type MetricId } from "@/lib/engine";
import { getHoustonCrew, getHoustonInbox, getOutboxToShip } from "@/lib/server/houston";
import { getCrew, getIncidentEvents, getIncidents, getMission, getStandingOrders } from "@/lib/server/queries";
import { formatBytes } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OP_WORD: Record<string, string> = { "<": "below", "<=": "at or below", ">": "above", ">=": "at or above" };

export default function HoustonPage() {
  const mission = getMission();
  const crew = getHoustonCrew(mission);
  const names = new Map(getCrew().map((c) => [c.id, c.name]));
  const orders = getStandingOrders();
  const inbox = getHoustonInbox();
  const outbox = getOutboxToShip();
  const incidents = new Map(getIncidents().map((i) => [i.id, i]));
  const nowIso = new Date().toISOString();

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-coral/50 bg-coral/5 px-4 py-3">
        <p className="label !text-coral">Houston · flight surgeon console</p>
        <h1 className="font-display text-2xl font-semibold">Mission Day {mission.currentDay} — {mission.profile.label}</h1>
        <p className="mt-1 text-sm text-soft">
          Everything here crossed the delayed link ({mission.profile.comms.label.toLowerCase()}). You see only the categories each astronaut shares.
          Standing orders are your way to act in advance: the ship applies them without waiting for you.
        </p>
      </div>

      <section aria-label="Crew status from shared data" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {crew.map((c) => (
          <Card key={c.id} data-testid={`houston-crew-${c.id}`} data-status={c.status}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold">{c.name}</h2>
                  <p className="text-xs text-soft">{c.role}</p>
                </div>
                <StatusPill status={c.status} />
              </div>
              <p className="mt-2 text-sm text-soft">Readiness from shared data: <span className="num text-ink">{c.score}</span> / 100</p>
              {c.drifting.length === 0 ? <p className="mt-2 text-sm text-soft">No shared measure is drifting.</p> : (
                <ul className="mt-2 space-y-1 text-sm">
                  {c.drifting.slice(0, 4).map((d) => (<li key={d.metric} className="text-soft"><span className={d.status === "red" ? "text-bad" : "text-warn"}>●</span> {d.reason}</li>))}
                </ul>
              )}
              {c.hidden.length > 0 && (
                <p data-testid="not-shared" className="mt-2 rounded-md border border-line bg-bg-alt px-2.5 py-1.5 text-xs text-soft">
                  Not shared by {c.name.split(" ")[0]}: <span className="text-ink">{c.hidden.join(", ")}</span>. Not included above.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card data-testid="orders-card">
          <CardHeader>
            <div>
              <CardTitle>Standing orders</CardTitle>
              <p className="text-xs text-soft">Checked on board every time data changes. The alert carries your name.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {orders.map((o) => {
                const def = METRIC_BY_ID[o.metric as MetricId];
                const active = o.activeAt <= nowIso;
                return (
                  <li key={o.id} data-testid="standing-order" data-active={active && o.enabled} className="rounded-lg border border-line bg-bg-alt/60 px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        If {def?.label ?? o.metric} is {OP_WORD[o.operator]} <span className="num">{o.value} {def?.unit}</span> for <span className="num">{o.consecutiveDays}</span> day{o.consecutiveDays === 1 ? "" : "s"} in a row
                        {o.astronautId ? ` — ${names.get(o.astronautId)}` : " — whole crew"}
                      </p>
                      <span className="flex items-center gap-2">
                        <span className={`font-mono text-[11px] uppercase ${!o.enabled ? "text-soft" : active ? "text-ok" : "text-coral"}`}>{!o.enabled ? "Off" : active ? "Active on board" : "In transit to ship"}</span>
                        <OrderToggle id={o.id} enabled={o.enabled} />
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-soft">→ {o.advice}</p>
                    <p className="mt-1 text-xs text-soft">Signed {o.surgeon}</p>
                  </li>
                );
              })}
            </ul>
            <div className="rounded-lg border border-line p-3">
              <h3 className="mb-2 font-display text-sm font-semibold">Write a new standing order</h3>
              <StandingOrderForm metrics={METRICS.map((m) => ({ id: m.id, label: m.label, unit: m.unit }))} crew={getCrew().map((c) => ({ id: c.id, name: c.name }))} surgeon={SURGEON} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card id="link" data-testid="link-card">
            <CardHeader><CardTitle>Delayed link</CardTitle></CardHeader>
            <CardContent>
              <LinkQueue delaySeconds={mission.commsDelaySeconds} realLabel={mission.profile.comms.label} />
              <div className="mt-2"><RealDelayNote profile={mission.profile} day={mission.currentDay} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Message the ship</CardTitle></CardHeader>
            <CardContent>
              <ComposeMessage direction="to_ship" author={SURGEON} label="Send on the delayed link" testid="compose-to-ship" />
              {outbox.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-soft">
                  {outbox.slice(0, 4).map((m) => (<li key={m.id}><span className={m.deliverAt <= nowIso ? "text-ok" : "text-coral"}>{m.deliverAt <= nowIso ? "Delivered" : "In transit"}</span> · {m.subject}</li>))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card id="inbox" data-testid="inbox-card">
        <CardHeader>
          <div>
            <CardTitle>Inbox from the ship</CardTitle>
            <p className="text-xs text-soft">Only messages that have completed the trip. Incident reports arrive gzip-compressed.</p>
          </div>
        </CardHeader>
        <CardContent>
          {inbox.length === 0 ? <p className="text-sm text-soft">Nothing received yet.</p> : (
            <ul className="space-y-3">
              {inbox.map((m) => {
                const inc = m.incidentId ? incidents.get(m.incidentId) : undefined;
                const events = inc ? getIncidentEvents(inc.id) : [];
                return (
                  <li key={m.id} data-testid={m.kind === "incident" ? "inbox-incident" : "inbox-message"} className={`rounded-lg border px-3 py-2.5 ${m.kind === "incident" ? "border-bad/60 bg-bad/5" : "border-line bg-bg-alt/60"}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{m.subject}</p>
                      <p className="num text-xs text-soft">
                        Day {m.missionDay} · sent {m.sentAt.slice(11, 19)} · received {m.deliverAt.slice(11, 19)} UTC ·{" "}
                        {m.rawBytes && m.rawBytes !== m.payloadBytes ? <span data-testid="inbox-bytes">{formatBytes(m.rawBytes)} → {formatBytes(m.payloadBytes)} gzip</span> : formatBytes(m.payloadBytes)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-soft">{m.body}</p>
                    <p className="mt-0.5 text-xs text-soft">From {m.author}</p>
                    {events.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-teal">Step-by-step log ({events.length} entries)</summary>
                        <ol className="mt-1.5 space-y-1 text-xs">
                          {events.map((e) => (
                            <li key={e.id} className="grid grid-cols-[4.5rem_1fr] gap-2">
                              <span className="num text-soft">{e.ts.slice(11, 19)}</span>
                              <span><span className="text-ink">{e.prompt}</span> <span className="text-teal">→ {e.answer}</span>{e.detail && <span className="block text-soft">{e.detail}</span>}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
