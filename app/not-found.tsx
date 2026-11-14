import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-16">
      <h1 className="font-display text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-soft">There is nothing at this address.</p>
      <Link href="/" className="text-teal hover:underline">Back to the crew dashboard</Link>
    </div>
  );
}
