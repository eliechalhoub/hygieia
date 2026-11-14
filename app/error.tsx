"use client";

import Link from "next/link";

/** A page failed to render. Triage does not depend on this page, so point to it. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-3 py-16">
      <h1 className="font-display text-2xl font-semibold">This page could not be shown</h1>
      <p className="text-sm text-soft">{error.message || "Something went wrong while reading onboard data."}</p>
      <p className="text-sm text-soft">If the database is missing, run <code className="font-mono text-ink">npm run seed</code>. Emergency triage still works.</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="h-9 cursor-pointer rounded-md bg-teal px-4 text-sm font-medium text-bg">Try again</button>
        <Link href="/triage" className="flex h-9 items-center rounded-md bg-bad px-4 text-sm font-semibold text-bg">Emergency triage</Link>
      </div>
    </div>
  );
}
