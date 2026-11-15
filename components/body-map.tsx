"use client";

import * as React from "react";
import type { RegionId, Status } from "@/lib/engine/types";
import { STATUS_HEX, statusWord } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

export interface BodyRegion {
  id: RegionId;
  label: string;
  covers: string;
  status: Status;
  /** Plain-language note about the worst metric in the region. */
  note: string;
}

interface Props {
  regions: BodyRegion[];
  selected: RegionId | null;
  onSelect: (id: RegionId | null) => void;
  /** Optional translated labels for the list. */
  labels?: Partial<Record<RegionId, string>>;
}

// Front view, 240 × 524. The left half of the body is drawn once and mirrored.
const HALF_BODY =
  "M120 78 L110 78 C110 86 110 92 104 96 C92 100 78 102 68 108 C58 113 53 124 53 138 C53 156 51 174 49 192 " +
  "C47 204 44 216 42 232 C40 246 38 256 36 266 C33 274 30 284 30 294 C30 301 35 304 39 300 C44 294 46 284 48 272 " +
  "C50 262 54 250 57 236 C60 222 63 210 65 198 C67 184 70 168 73 154 C75 170 78 190 81 208 C82 222 77 236 74 250 " +
  "C70 270 69 292 71 314 C73 336 78 356 80 372 C80 384 76 396 76 410 C76 432 82 456 85 474 C85 484 80 492 78 498 " +
  "C78 505 90 506 102 505 C106 502 103 492 101 478 C102 458 107 432 107 410 C107 396 104 386 104 372 " +
  "C106 340 112 300 118 272 C119 270 120 269 120 268";
const HEAD =
  "M120 10 C135 10 145 22 145 40 C145 50 143 58 138 66 C134 74 128 82 120 82 C112 82 106 74 102 66 C97 58 95 50 95 40 C95 22 105 10 120 10 Z";
const EAR = "M95 40 C91 38 89 43 90 48 C91 53 94 55 96 53";
const BRAIN =
  "M120 16 C132 15 141 23 141 33 C141 41 135 45 128 44 C125 47 115 47 112 44 C105 45 99 41 99 33 C99 23 108 15 120 16 Z";
const SULCI =
  "M120 17 V46 M108 21 C112 25 110 30 105 32 M132 21 C128 25 130 30 135 32 M103 38 C108 36 112 39 111 43 M137 38 C132 36 128 39 129 43 M112 28 C115 30 115 34 112 36 M128 28 C125 30 125 34 128 36";
const LUNG = "M113 110 C105 107 92 118 88 136 C85 150 86 162 90 166 C98 169 108 163 113 156 C115 150 115 120 113 110 Z";
const HEART = "M0 28 C-20 14 -29 2 -29 -9 C-29 -19 -21 -25 -13 -25 C-7 -25 -2 -22 0 -17 C2 -22 7 -25 13 -25 C21 -25 29 -19 29 -9 C29 2 20 14 0 28 Z";
const EYE = "M104 52 C107 48 113 48 116 52 C113 55 107 55 104 52 Z";
const COCHLEA = "M91 45 a4.2 4.2 0 1 1 4.2 6 a2.4 2.4 0 1 1 -1.6 -3.6";

/** Long bones on the left side: [x1, y1, x2, y2, width]. */
const BONES: [number, number, number, number, number][] = [
  [62, 118, 57, 188, 5], // humerus
  [55, 200, 43, 260, 4], // radius and ulna
  [89, 262, 91, 364, 6.5], // femur
  [92, 382, 92, 468, 5], // tibia
];
const NODES: [number, number, number][] = [
  [112, 91, 2.6], [79, 133, 3.2], [105, 262, 3.2], [111, 204, 2.6],
];
/** Where the attention ring sits for each region. */
const ANCHOR: Record<RegionId, [number, number]> = {
  head: [120, 30], eyes: [120, 52], inner_ear: [147, 48], heart: [128, 141],
  lungs: [100, 138], muscles_bones: [90, 312], immune: [161, 133], whole_body: [120, 226],
};

/**
 * Body map. Each region is coloured by its worst metric, and every colour is
 * paired with a word in the list beside it.
 */
export function BodyMap({ regions, selected, onSelect, labels }: Props) {
  const by = Object.fromEntries(regions.map((r) => [r.id, r])) as Record<RegionId, BodyRegion>;
  const [hover, setHover] = React.useState<RegionId | null>(null);
  const toggle = (id: RegionId) => onSelect(selected === id ? null : id);
  const mirror = "translate(240 0) scale(-1 1)";
  const focus = selected ?? hover;

  const region = (id: RegionId, children: React.ReactNode, opts: { fill?: number; line?: boolean } = {}) => {
    const r = by[id];
    const on = focus === id;
    return (
      <g
        key={id}
        role="button"
        tabIndex={0}
        data-region={id}
        data-status={r.status}
        aria-label={`${r.label}: ${statusWord(r.status)}. ${r.covers}`}
        aria-pressed={selected === id}
        onClick={(e) => { e.stopPropagation(); toggle(id); }}
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(id); } }}
        className="cursor-pointer outline-none transition-opacity duration-300 focus-visible:[&_*]:stroke-[#eef2f8]"
        style={{ color: STATUS_HEX[r.status], filter: on ? `drop-shadow(0 0 6px ${STATUS_HEX[r.status]})` : undefined }}
        opacity={focus && !on ? 0.45 : 1}
        fill={opts.line ? "none" : "currentColor"}
        fillOpacity={opts.fill ?? (on ? 0.85 : 0.55)}
        stroke={on ? "#eef2f8" : "currentColor"}
        strokeWidth={on ? 1.8 : 1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <title>{`${r.label}: ${statusWord(r.status)}`}</title>
        {children}
      </g>
    );
  };

  const attention = regions.filter((r) => r.status === "amber" || r.status === "red");

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(190px,250px)_1fr]">
      <figure className="mx-auto w-full max-w-[250px]">
      <svg viewBox="0 0 240 524" className="h-auto w-full" aria-label="Body map">
        <defs>
          <linearGradient id="bm-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2e4488" />
            <stop offset="0.5" stopColor="#1f2f66" />
            <stop offset="1" stopColor="#141f47" />
          </linearGradient>
          <radialGradient id="bm-core" cx="0.5" cy="0.32" r="0.5">
            <stop offset="0" stopColor="#3dd6c4" stopOpacity="0.28" />
            <stop offset="1" stopColor="#3dd6c4" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bm-pad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#3dd6c4" stopOpacity="0.5" />
            <stop offset="1" stopColor="#3dd6c4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bm-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3dd6c4" stopOpacity="0" />
            <stop offset="1" stopColor="#3dd6c4" stopOpacity="0.55" />
          </linearGradient>
          <clipPath id="bm-clip">
            <path d={HALF_BODY} />
            <path d={HALF_BODY} transform={mirror} />
            <path d={HEAD} />
          </clipPath>
        </defs>

        {/* Scanner pad under the feet. */}
        <ellipse cx="120" cy="508" rx="78" ry="10" fill="url(#bm-pad)" />
        <ellipse cx="120" cy="508" rx="58" ry="6" fill="none" stroke="#3dd6c4" strokeOpacity="0.45" strokeWidth="1" />
        <ellipse cx="120" cy="508" rx="78" ry="10" fill="none" stroke="#3dd6c4" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3 5" />

        {/* Whole body: the silhouette itself (radiation, nutrition). */}
        {region("whole_body", (
          <>
            <g stroke="none" fillOpacity={1}>
              <path d={HALF_BODY} fill="url(#bm-skin)" />
              <path d={HALF_BODY} transform={mirror} fill="url(#bm-skin)" />
              <path d={HEAD} fill="url(#bm-skin)" />
            </g>
            <path d={HALF_BODY} />
            <path d={HALF_BODY} transform={mirror} />
            <path d={HEAD} />
            <path d={EAR} fill="none" />
            <path d={EAR} transform={mirror} fill="none" />
          </>
        ), { fill: focus === "whole_body" ? 0.3 : 0.1 })}

        {/* Soft inner light and the sweeping scan line, both clipped to the body. */}
        <g clipPath="url(#bm-clip)" pointerEvents="none">
          <rect x="0" y="0" width="240" height="524" fill="url(#bm-core)" />
          <g className="animate-scan">
            <rect x="0" y="-26" width="240" height="26" fill="url(#bm-scan)" />
            <rect x="0" y="0" width="240" height="1.4" fill="#3dd6c4" />
          </g>
        </g>

        {/* Skeleton and muscle contours, drawn faintly for orientation. */}
        <g fill="none" stroke="#5a6db0" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" pointerEvents="none">
          {[114, 124, 134, 144, 154, 164].map((y, i) => (
            <path key={y} d={`M120 ${y} C${108 - i} ${y - 4} ${94 - i} ${y} ${86 - i * 0.4} ${y + 9}`} />
          ))}
          {[114, 124, 134, 144, 154, 164].map((y, i) => (
            <path key={`m${y}`} transform={mirror} d={`M120 ${y} C${108 - i} ${y - 4} ${94 - i} ${y} ${86 - i * 0.4} ${y + 9}`} />
          ))}
          <path d="M120 84 V246" strokeDasharray="3 3" />
          <path d="M111 96 C100 99 86 102 72 108 M129 96 C140 99 154 102 168 108" />
          <path d="M84 232 C90 250 106 262 120 262 C134 262 150 250 156 232" />
          <path d="M92 222 C100 232 108 244 116 258 M148 222 C140 232 132 244 124 258" />
          <path d="M108 178 H132 M106 194 H134 M106 210 H134" strokeOpacity="0.3" />
          <circle cx="91" cy="373" r="6" />
          <circle cx="149" cy="373" r="6" />
        </g>

        {/* Muscles & bones: the long bones of the arms and legs. */}
        {region("muscles_bones", (
          <>
            {BONES.map(([x1, y1, x2, y2, w], i) => (
              <g key={i} strokeOpacity={0.8}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} />
                <line x1={240 - x1} y1={y1} x2={240 - x2} y2={y2} strokeWidth={w} />
                {[[x1, y1], [x2, y2]].map(([x, y], k) => (
                  <g key={k} fill="currentColor" fillOpacity={0.8} stroke="none">
                    <circle cx={x} cy={y} r={w * 0.75} />
                    <circle cx={240 - x} cy={y} r={w * 0.75} />
                  </g>
                ))}
              </g>
            ))}
            {/* Wide invisible hit areas so the limbs are easy to tap. */}
            {BONES.map(([x1, y1, x2, y2], i) => (
              <g key={`h${i}`} stroke="transparent" strokeWidth={22}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <line x1={240 - x1} y1={y1} x2={240 - x2} y2={y2} />
              </g>
            ))}
          </>
        ), { line: true })}

        {/* Lungs, with the windpipe. */}
        {region("lungs", (
          <>
            <path d={LUNG} />
            <path d={LUNG} transform={mirror} />
            <path d="M120 90 V112 M120 112 C116 114 113 117 110 122 M120 112 C124 114 127 117 130 122" fill="none" strokeWidth={2.2} />
            <path d="M96 128 C101 134 104 142 104 152 M92 144 C96 148 99 154 100 160 M144 128 C139 134 136 142 136 152 M148 144 C144 148 141 154 140 160" fill="none" strokeWidth={0.8} strokeOpacity={0.7} />
          </>
        ))}

        {/* Immune: lymph nodes (neck, armpit, groin, abdomen) and the spleen. */}
        {region("immune", (
          <>
            {NODES.map(([x, y, r], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={r} />
                <circle cx={240 - x} cy={y} r={r} />
              </g>
            ))}
            <ellipse cx="142" cy="180" rx="8" ry="5.5" transform="rotate(-25 142 180)" />
            <path d="M112 91 C104 104 86 118 79 133 M128 91 C136 104 154 118 161 133 M111 204 L105 262 M129 204 L135 262" fill="none" strokeWidth="0.8" strokeDasharray="2 4" strokeOpacity="0.75" />
          </>
        ), { fill: focus === "immune" ? 0.95 : 0.8 })}

        {/* Heart: slightly to the wearer's left, with the aortic arch. */}
        {region("heart", (
          <g className={by.heart.status === "unknown" ? undefined : "origin-center animate-heartbeat [transform-box:fill-box]"}>
            <path d="M126 127 C125 119 131 114 137 117" fill="none" strokeWidth={3} />
            <path d={HEART} transform="translate(128 142) rotate(-16) scale(0.44)" />
          </g>
        ), { fill: focus === "heart" ? 1 : 0.9 })}

        {/* Head: brain (mood, sleep, cognition). */}
        {region("head", (
          <>
            <path d={HEAD} fillOpacity={0.06} stroke="none" />
            <path d={BRAIN} />
            <path d={SULCI} fill="none" strokeWidth="0.9" strokeOpacity="0.8" />
          </>
        ))}

        {region("inner_ear", (
          <>
            <path d={COCHLEA} fill="none" strokeWidth="2" />
            <path d={COCHLEA} transform={mirror} fill="none" strokeWidth="2" />
            <circle cx="93" cy="48" r="9" stroke="transparent" fill="transparent" />
            <circle cx="147" cy="48" r="9" stroke="transparent" fill="transparent" />
          </>
        ), { line: true })}

        {region("eyes", (
          <>
            <path d={EYE} />
            <path d={EYE} transform={mirror} />
            <circle cx="110" cy="52" r="1.9" fill="#090e1d" stroke="none" fillOpacity={1} />
            <circle cx="130" cy="52" r="1.9" fill="#090e1d" stroke="none" fillOpacity={1} />
          </>
        ), { fill: focus === "eyes" ? 0.95 : 0.8 })}

        {/* A ring pulses over every region that needs attention. */}
        <g pointerEvents="none" fill="none">
          {attention.map((r) => {
            const [x, y] = ANCHOR[r.id];
            return (
              <circle key={r.id} cx={x} cy={y} r="13" stroke={STATUS_HEX[r.status]} strokeWidth="1.6" className="origin-center animate-ring [transform-box:fill-box]" />
            );
          })}
        </g>
      </svg>
        <figcaption className="si-mark mt-1 text-center">SI-generated graphic</figcaption>
      </figure>

      <ul className="grid gap-1.5" aria-label="Body regions">
        {regions.map((r) => {
          const on = selected === r.id;
          const drifting = r.status === "amber" || r.status === "red";
          return (
            <li key={r.id}>
              <button
                type="button"
                data-testid={`region-${r.id}`}
                data-status={r.status}
                onClick={() => toggle(r.id)}
                onMouseEnter={() => setHover(r.id)}
                onMouseLeave={() => setHover(null)}
                aria-pressed={on}
                title={r.covers}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                  on ? "border-teal bg-panel-hi" : "border-transparent hover:border-line hover:bg-panel/60",
                )}
              >
                <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
                  {drifting && <span className="absolute inset-0 animate-ring rounded-full" style={{ background: STATUS_HEX[r.status] }} />}
                  <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: STATUS_HEX[r.status], boxShadow: `0 0 8px ${STATUS_HEX[r.status]}` }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{labels?.[r.id] ?? r.label}</span>
                  {(drifting || on) && <span className={cn("block text-xs text-soft", !on && "line-clamp-1")}>{drifting ? r.note : r.covers}</span>}
                </span>
                <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-wide" style={{ color: r.status === "unknown" ? "#b4c0d6" : STATUS_HEX[r.status] }}>{statusWord(r.status)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
