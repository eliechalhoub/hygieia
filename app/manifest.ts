import type { MetadataRoute } from "next";

/** Web app manifest: lets the crew install Hygieia as a standalone app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hygieia — onboard crew health",
    short_name: "Hygieia",
    description: "Onboard crew-health assistant demo. Not medically validated.",
    start_url: "/",
    display: "standalone",
    background_color: "#090E1D",
    theme_color: "#090E1D",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Emergency triage", url: "/triage" }],
  };
}
