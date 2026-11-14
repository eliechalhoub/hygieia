import profiles from "@/content/profiles.json";
import { loadDonki, loadGoesProtons } from "@/lib/data/spaceWeather";
import { TREES } from "@/lib/triage";

export const dynamic = "force-dynamic";

/**
 * One JSON bundle the service worker caches for offline use: the triage trees,
 * the environment profiles and the committed space-weather snapshots.
 */
export async function GET() {
  return Response.json({ triage: TREES, profiles, snapshots: { goes_protons: loadGoesProtons(), donki: loadDonki() } });
}
