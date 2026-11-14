import type { NextConfig } from "next";

// Hygieia renders everything at request time from a local SQLite file, so the
// scaffold's Cache Components / Partial Prefetching flags are left off
// (see node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md).
const nextConfig: NextConfig = {
  experimental: {
    // The production proxy forwards localhost:9098 as x-forwarded-host while
    // browsers invoke Server Actions from the public site origin.
    serverActions: {
      allowedOrigins: ["hygieia.health"],
    },
  },
  // The Docker image sets NEXT_OUTPUT=standalone for a small Cloud Run container.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  serverExternalPackages: ["better-sqlite3"],
  // The seeded database and snapshots are read from disk at runtime.
  outputFileTracingIncludes: {
    "/*": ["./content/**/*", "./data/snapshots/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
