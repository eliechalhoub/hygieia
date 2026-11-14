import * as React from "react";

type P = React.SVGProps<SVGSVGElement>;
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconChat = (p: P) => (<svg {...base} {...p}><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /></svg>);
export const IconX = (p: P) => (<svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const IconAlert = (p: P) => (<svg {...base} {...p}><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17.5v.5" /></svg>);
export const IconMinus = (p: P) => (<svg {...base} {...p}><path d="M5 12h14" /></svg>);
export const IconPlus = (p: P) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const IconArrow = (p: P) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconBack = (p: P) => (<svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
export const IconMic = (p: P) => (<svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const IconSignal = (p: P) => (<svg {...base} {...p}><path d="M4 18v-2M9 18v-6M14 18V8M19 18V4" /></svg>);
export const IconSun = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>);
export const IconCheck = (p: P) => (<svg {...base} {...p}><path d="m5 12 5 5 9-10" /></svg>);
export const IconLock = (p: P) => (<svg {...base} {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const IconInfo = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>);
export const IconSend = (p: P) => (<svg {...base} {...p}><path d="M21 3 3 10l7 3 3 7 8-17z" /></svg>);

/** Hygieia mark: a bowl with a rising pulse line (the bowl of Hygieia, minus the serpent). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#0E1530" stroke="#3DD6C4" strokeWidth="1.5" />
      <path d="M8 13h16a8 8 0 0 1-16 0z" fill="none" stroke="#EEF2F8" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 21v4M12 26h8" stroke="#EEF2F8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 10h5l2-4 3 7 2-3h6" fill="none" stroke="#3DD6C4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
