# Hygieia — container for Google Cloud Run (or any container host).
# The SQLite database is rebuilt from the seed on every cold start. That is
# intended: this is a demo with synthetic crew data.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone HYGIEIA_DB=/tmp/hygieia-build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
# The database lives in the container's writable temp space and is seeded on first request.
ENV HYGIEIA_DB=/tmp/hygieia.db HYGIEIA_DAY=143 HYGIEIA_PROFILE=transit
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Read from disk at run time: sources, profiles, triage trees, knowledge base, snapshots.
COPY --from=build /app/content ./content
COPY --from=build /app/data/snapshots ./data/snapshots
EXPOSE 8080
CMD ["node", "server.js"]
