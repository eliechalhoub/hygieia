import type { Lang } from "@/lib/i18n";

/** The interface is English-only. */
export async function getLang(): Promise<Lang> {
  return "en";
}
