import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { getCrew, getMission } from "@/lib/server/queries";
import { PROFILE_ORDER, PROFILES } from "@/lib/profiles";
import { dirOf } from "@/lib/i18n";
import { getLang } from "@/lib/server/lang";

// Fonts are self-hosted (SIL Open Font License) so the demo works offline.
const spaceGrotesk = localFont({ src: "./fonts/space-grotesk-latin-wght-normal.woff2", variable: "--font-space-grotesk", weight: "300 700", display: "swap" });
const inter = localFont({ src: "./fonts/inter-latin-wght-normal.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
const jetbrains = localFont({ src: "./fonts/jetbrains-mono-latin-wght-normal.woff2", variable: "--font-jetbrains", weight: "100 800", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hygieia — onboard crew health",
  description: "Hygieia: an onboard crew-health assistant for deep-space missions. NASA Space Apps 2026, team Jovian Elites.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#090E1D" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const mission = getMission();
  const crew = getCrew();
  return (
    <html lang={lang} dir={dirOf(lang)} className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell
          mission={{
            currentDay: mission.currentDay,
            maxDay: mission.maxDay,
            profileId: mission.profile.id,
            profileLabel: mission.profile.label,
            delaySeconds: mission.commsDelaySeconds,
            delayLabel: mission.profile.comms.label,
            earth: Boolean(mission.profile.earth),
          }}
          lang={lang}
          crew={crew.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName }))}
          profiles={PROFILE_ORDER.map((id) => ({ id, label: PROFILES[id].label }))}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
