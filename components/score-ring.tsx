import type { CSSProperties } from "react";
import type { Status } from "@/lib/engine/types";
import { STATUS_HEX } from "@/components/ui/status-pill";

/** Readiness score as a ring that fills on load, with the number inside. */
export function ScoreRing({ score, status, size = 96, label, testid }: { score: number; status: Status; size?: number; label?: string; testid?: string }) {
  const stroke = Math.max(6, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = STATUS_HEX[status];
  const arc: CSSProperties & { "--ring-from": number } = {
    "--ring-from": c,
    strokeDasharray: c,
    strokeDashoffset: c * (1 - Math.max(0, Math.min(100, score)) / 100),
  };
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Readiness ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2a3866" strokeOpacity={0.6} strokeWidth={stroke} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" style={arc} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span data-testid={testid} className="num font-display font-semibold leading-none text-ink" style={{ fontSize: size * 0.34 }}>{score}</span>
        {label && <span className="label mt-0.5 !text-[9px]">{label}</span>}
      </div>
    </div>
  );
}
