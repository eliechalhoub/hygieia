"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatBytes, formatDelay } from "@/lib/utils";

interface Item {
  id: number;
  direction: string;
  kind: string;
  subject: string;
  sentAt: string;
  deliverAt: string;
  payloadBytes: number;
  rawBytes: number | null;
}

/** Live view of the delayed link: what is travelling, which way, and when it lands. */
export function LinkQueue({ delaySeconds, realLabel }: { delaySeconds: number; realLabel: string }) {
  const router = useRouter();
  const [items, setItems] = React.useState<Item[]>([]);
  const [now, setNow] = React.useState(() => Date.now());
  const count = React.useRef(0);

  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/link", { cache: "no-store" });
        if (!res.ok || stop) return;
        const data = await res.json();
        setItems(data.inTransit);
        if (data.deliveredJustNow > 0 || data.inTransit.length < count.current) router.refresh();
        count.current = data.inTransit.length;
      } catch { /* unreachable */ }
    };
    poll();
    const a = window.setInterval(poll, 1000);
    const b = window.setInterval(() => setNow(Date.now()), 250);
    return () => { stop = true; window.clearInterval(a); window.clearInterval(b); };
  }, [router]);

  return (
    <div data-testid="link-queue" data-count={items.length}>
      <p className="text-sm text-soft">
        One-way delay: <span className="num text-ink">{formatDelay(delaySeconds)}</span>. Real link: {realLabel.toLowerCase()}.
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-soft">Nothing in transit.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((m) => {
            const sent = Date.parse(m.sentAt);
            const due = Date.parse(m.deliverAt);
            const pct = Math.min(100, Math.max(0, ((now - sent) / Math.max(1, due - sent)) * 100));
            const toEarth = m.direction === "to_earth";
            return (
              <li key={m.id} data-testid="in-transit" className="rounded-lg border border-coral/50 bg-coral/5 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-ink"><span className="font-mono text-xs uppercase text-coral">{toEarth ? "Ship → Earth" : "Earth → Ship"}</span> {m.subject}</span>
                  <span className="num text-soft">
                    {m.rawBytes && m.rawBytes !== m.payloadBytes ? `${formatBytes(m.rawBytes)} → ${formatBytes(m.payloadBytes)} gzip · ` : `${formatBytes(m.payloadBytes)} · `}
                    arrives in {Math.max(0, Math.ceil((due - now) / 1000))} s
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" style={{ direction: toEarth ? "ltr" : "rtl" }}>
                  <div className="transit-bar h-full" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
