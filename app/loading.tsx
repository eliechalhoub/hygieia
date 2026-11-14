/** Shown while a page's data is being read. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-16 text-soft">
      <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-teal" />
      Reading onboard data…
    </div>
  );
}
