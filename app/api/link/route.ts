import { linkSnapshot } from "@/lib/server/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Polled by the header: advances the delayed link and lists what is in transit. */
export async function GET() {
  return Response.json(linkSnapshot(), { headers: { "cache-control": "no-store" } });
}
