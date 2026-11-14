import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the theme colour names, so "text-ink" is merged as a
// colour and never mistaken for a font size.
const twMerge = extendTailwindMerge({
  extend: { theme: { color: ["bg", "bg-alt", "panel", "panel-hi", "line", "ink", "soft", "teal", "coral", "ok", "warn", "bad"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} kB`;
}

export function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)} s`;
  return `${Math.round(seconds / 60)} min`;
}
