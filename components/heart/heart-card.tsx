import { SourceLink } from "@/components/source-link";
import { STATUS_HEX, StatusPill } from "@/components/ui/status-pill";
import type { Status } from "@/lib/engine/types";

export interface HeartVital {
  id: string;
  label: string;
  value: string;
  unit: string;
  /** Short comparison with the personal baseline, e.g. "−8 vs usual 64". */
  versus: string;
  status: Status;
  /** Last two weeks of readings, oldest first. */
  spark: number[];
}

export interface HeartCardProps {
  status: Status;
  /** Resting heart rate today, or null when there is no reading. */
  bpm: number | null;
  verdict: string;
  vitals: HeartVital[];
  /** Kit items that matter for the heart in this profile. */
  kit: string[];
}

const BEAT_W = 120;
const BEATS = 6;

/** One PQRST complex, `w` wide, on a baseline at y. */
function beat(x: number, y: number, tall: number): string {
  return [
    `L${x + 14} ${y}`,
    `Q${x + 20} ${y - 7} ${x + 26} ${y}`, // P wave
    `L${x + 36} ${y}`,
    `L${x + 40} ${y + 5}`, // Q
    `L${x + 46} ${y - tall}`, // R
    `L${x + 52} ${y + 11}`, // S
    `L${x + 57} ${y}`,
    `L${x + 68} ${y}`,
    `Q${x + 79} ${y - 14} ${x + 90} ${y}`, // T wave
    `L${x + BEAT_W} ${y}`,
  ].join(" ");
}

function ecgPath(): string {
  let d = "M0 46";
  for (let i = 0; i < BEATS * 2; i++) d += " " + beat(i * BEAT_W, 46, 36);
  return d;
}

/** ECG-style trace paced at the measured resting heart rate. */
export function EcgStrip({ bpm, color, height = 84 }: { bpm: number | null; color: string; height?: number }) {
  const w = BEAT_W * BEATS * 2;
  const seconds = bpm ? (BEATS * 60) / bpm : 0;
  return (
    <div className="ecg-window w-full rounded-md" style={{ height }} role="img" aria-label={bpm ? `Heart rhythm trace paced at ${Math.round(bpm)} beats per minute` : "No heart rate reading"}>
      <svg viewBox={`0 0 ${w} 84`} preserveAspectRatio="none" className={bpm ? "ecg-track block h-full" : "block h-full w-[200%]"} style={bpm ? { animationDuration: `${seconds.toFixed(2)}s` } : undefined} aria-hidden>
        {bpm ? (
          <>
            <path d={ecgPath()} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.18" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={ecgPath()} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <path d={`M0 46 H${w}`} stroke="#55618a" strokeWidth="2" strokeDasharray="6 6" />
        )}
      </svg>
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-8" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 26 - ((v - lo) / span) * 22] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={`${line} L100 30 L0 30 Z`} fill={color} fillOpacity="0.1" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="1.8" fill={color} />
    </svg>
  );
}

/** The heart, front and centre: rhythm, rate, variability, pressure and oxygen against the personal baseline. */
export function HeartCard({ status, bpm, verdict, vitals, kit }: HeartCardProps) {
  const color = STATUS_HEX[status];
  const beatSeconds = bpm ? 60 / bpm : 1.1;
  return (
    <section id="heart" data-testid="heart-card" data-status={status} aria-label="Heart health" className="card overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full" style={{ background: `radial-gradient(closest-side, ${color}33, transparent)` }} />
      <div className="relative grid gap-6 p-6 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="flex items-center gap-5">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
            {bpm && <span aria-hidden className="absolute h-20 w-20 animate-ring rounded-full border-2" style={{ borderColor: color, animationDuration: `${(beatSeconds * 2).toFixed(2)}s` }} />}
            <svg viewBox="0 0 64 60" className={bpm ? "h-24 w-24 animate-heartbeat will-change-transform" : "h-24 w-24"} style={{ animationDuration: `${beatSeconds.toFixed(2)}s` }} aria-hidden>
              <defs>
                <linearGradient id="heart-fill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#ff8a9a" />
                  <stop offset="0.55" stopColor="#ff5c6c" />
                  <stop offset="1" stopColor="#b02a4a" />
                </linearGradient>
              </defs>
              <path d="M32 56 C12 42 3 30 3 19 C3 9 11 3 19 3 C25 3 30 6 32 11 C34 6 39 3 45 3 C53 3 61 9 61 19 C61 30 52 42 32 56 Z" fill="url(#heart-fill)" />
              <path d="M12 17 C12 12 16 8 21 8" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M8 30 H22 L26 22 L32 40 L37 26 L40 30 H56" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="label">Heart health</p>
            <p className="flex items-baseline gap-2">
              <span data-testid="heart-bpm" className="num font-display text-6xl font-semibold leading-none text-ink">{bpm ? Math.round(bpm) : "—"}</span>
              <span className="text-sm text-soft">bpm resting</span>
            </p>
            <div className="mt-2"><StatusPill status={status} /></div>
          </div>
        </div>

        <div className="min-w-0">
          <EcgStrip bpm={bpm} color={color} />
          <p data-testid="heart-verdict" className="mt-2 text-sm text-ink">{verdict}</p>
        </div>
      </div>

      <dl className="relative grid grid-cols-2 gap-px border-t border-line/70 bg-line/40 lg:grid-cols-4">
        {vitals.map((v) => (
          <div key={v.id} data-testid={`heart-${v.id}`} data-status={v.status} className="bg-bg-alt/80 p-4">
            <dt className="flex items-center justify-between gap-2">
              <span className="label">{v.label}</span>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[v.status], boxShadow: `0 0 8px ${STATUS_HEX[v.status]}` }} />
            </dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              <span className="num font-display text-2xl font-semibold text-ink">{v.value}</span>
              <span className="text-xs text-soft">{v.unit}</span>
            </dd>
            <dd className="num text-[11px] text-soft">{v.versus} <span className="sr-only">Status: {v.status}.</span></dd>
            <dd className="mt-1"><Spark values={v.spark} color={STATUS_HEX[v.status]} /></dd>
          </div>
        ))}
      </dl>

      <div className="relative flex flex-wrap items-center gap-2 border-t border-line/70 px-6 py-3">
        <span className="label">Cardiac kit on board</span>
        {kit.length ? kit.map((k) => (<span key={k} className="chip">{k}</span>)) : <span className="text-xs text-soft">None in this profile</span>}
        <span className="ml-auto"><SourceLink id="nasa-hrp-risks" label="NASA cardiovascular risk" /></span>
      </div>
    </section>
  );
}
