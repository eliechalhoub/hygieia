import { SourceLink } from "@/components/source-link";
import { cn } from "@/lib/utils";

export interface AlertView {
  id: number;
  rule: string;
  severity: string;
  title: string;
  reason: string;
  advice: string;
  authorisedBy: string | null;
  sourceIds: string[];
  missionDay?: number;
  who?: string | null;
}

/** Early warnings and standing-order advice, each with the reason it fired. */
export function AlertsList({ alerts, empty = "No alerts today." }: { alerts: AlertView[]; empty?: string }) {
  if (alerts.length === 0) return <p className="text-sm text-soft">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {alerts.map((a) => {
        const red = a.severity === "red";
        const order = a.rule.startsWith("standing_order");
        return (
          <li
            key={a.id}
            data-testid={order ? "standing-order-alert" : `alert-${a.rule}`}
            className={cn("rounded-xl border-l-4 bg-bg-alt/70 px-4 py-3", order ? "border-coral" : red ? "border-bad" : "border-warn")}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-semibold text-ink">
                {a.who ? `${a.who}: ` : ""}{a.title}
              </p>
              <span className={cn("font-mono text-[11px] uppercase", order ? "text-coral" : red ? "text-bad" : "text-warn")}>
                {order ? "Standing order" : red ? "Red alert" : "Amber alert"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-soft"><span className="label mr-1.5">Why</span>{a.reason}</p>
            <p className="mt-0.5 text-sm text-ink"><span className="label mr-1.5">Do now</span>{a.advice}</p>
            {a.authorisedBy && (
              <p data-testid="authorised-by" className="mt-1 text-xs text-coral">
                Pre-authorised by {a.authorisedBy} · applied on board at once
              </p>
            )}
            {a.sourceIds.some((id) => id !== "demo-thresholds") && (
              <p className="mt-1 flex flex-wrap gap-x-3">{a.sourceIds.filter((id) => id !== "demo-thresholds").map((id) => (<SourceLink key={id} id={id} />))}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
