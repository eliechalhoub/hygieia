/**
 * npm run seed [-- --day 143 --profile transit --seed 2026]
 * Rebuilds hygieia.db from the scripted storyline and the committed snapshots.
 */
import { getHandle } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import type { ProfileId } from "@/lib/profiles";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const handle = getHandle({ autoSeed: false });
seedDatabase(handle.sqlite, handle.db, {
  day: arg("day") ? Number(arg("day")) : undefined,
  seed: arg("seed") ? Number(arg("seed")) : undefined,
  profile: arg("profile") as ProfileId | undefined,
});
handle.sqlite.close();
