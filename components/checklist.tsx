"use client";

import * as React from "react";

/** A simple tick-off checklist. State stays on this device. */
export function Checklist({ id, items }: { id: string; items: { title: string; detail?: string }[] }) {
  const [done, setDone] = React.useState<boolean[]>(() => items.map(() => false));
  const count = done.filter(Boolean).length;
  return (
    <div data-testid={`checklist-${id}`}>
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={item.title} className="flex items-start gap-3 rounded-lg border border-line bg-bg-alt/60 px-3 py-2.5">
            <input
              id={`${id}-${i}`} type="checkbox" checked={done[i]}
              onChange={(e) => setDone((d) => d.map((v, k) => (k === i ? e.target.checked : v)))}
              className="mt-1 h-5 w-5 cursor-pointer accent-[#3dd6c4]"
            />
            <label htmlFor={`${id}-${i}`} className="cursor-pointer text-sm">
              <span className={done[i] ? "text-soft line-through" : "font-medium text-ink"}>{i + 1}. {item.title}</span>
              {item.detail && <span className="block text-soft">{item.detail}</span>}
            </label>
          </li>
        ))}
      </ol>
      <p className="num mt-2 text-xs text-soft" aria-live="polite">{count} of {items.length} done</p>
    </div>
  );
}
