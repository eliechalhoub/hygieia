import { cn } from "@/lib/utils";
import type { Status } from "@/lib/engine/types";

const WORD: Record<Status, string> = { green: "Green", amber: "Amber", red: "Red", unknown: "No data" };

const STYLE: Record<Status, string> = {
  green: "border-ok/50 bg-ok/10 text-ok",
  amber: "border-warn/50 bg-warn/10 text-warn",
  red: "border-bad/60 bg-bad/10 text-bad",
  unknown: "border-line bg-panel-hi text-soft",
};

export const STATUS_HEX: Record<Status, string> = {
  green: "#3dd68c",
  amber: "#f5b841",
  red: "#ff5c6c",
  unknown: "#55618a",
};

/** Status is always a colour AND a word. */
export function StatusPill({ status, label, className }: { status: Status; label?: string; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide", STYLE[status], className)}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[status] }} />
      {label ?? WORD[status]}
    </span>
  );
}

export function statusWord(status: Status): string {
  return WORD[status];
}
