# Deploying Hygieia

Hygieia is one Node process with a SQLite file. It is a demo: the database is rebuilt from the seed whenever it is missing, so any host that can run a container or `npm start` works.

> **Status.** Nothing has been deployed and no domain has been registered yet. Both need the team's own Google Cloud and GoDaddy accounts. The steps below are written to be followed as they are; fill in the two placeholders when you do:
>
> - Deployed URL: `https://<service>-<hash>-<region>.a.run.app` — _not deployed yet_
> - Domain: `hygieia-space.<tld>` — _not registered yet_
>
> The container image has not been built on this machine (Docker is not installed here). The standalone production build it is based on has been run locally.

## 1. Run locally

Needs Node 22 or newer.

```bash
npm install
npm run demo
```

`npm run demo` seeds the database on Day 143 with the Transit profile, starts the app on port 3000 and opens the browser. It needs no network. Only the AI chat needs the internet and an `OPENAI_API_KEY` in `.env.local`.

Other commands:

```bash
npm run fetch-data   # optional: refresh the NASA/NOAA snapshots (needs the internet)
npm run seed         # rebuild hygieia.db (add: -- --day 143 --profile mars)
npm run dev          # development server
npm run build        # production build
npm start            # production server on port 3000
npm test             # Vitest: engine, data adapters, storyline
npm run test:e2e     # production build + Playwright storyline test
```

The end-to-end test uses an installed Microsoft Edge on Windows and Chrome elsewhere. To use Playwright's own browser instead: `npx playwright install chromium`, then set `PW_CHANNEL=chromium`.

## 2. Google Cloud Run

Cloud Run builds the image from the `Dockerfile` in this folder.

1. Install the gcloud CLI and sign in:

   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

2. Deploy from source:

   ```bash
   gcloud run deploy hygieia --source . --region europe-west1 --allow-unauthenticated --port 8080 --memory 512Mi --min-instances 0 --max-instances 1
   ```

   `--max-instances 1` matters: each instance has its own SQLite file, so two instances would show two different missions.

3. Optional, for the AI chat. Store the key as a secret and attach it:

   ```bash
   printf "YOUR_KEY" | gcloud secrets create openai-api-key --data-file=-
   gcloud run services update hygieia --region europe-west1 --set-secrets OPENAI_API_KEY=openai-api-key:latest
   ```

   Locally, put the key in `.env.local` as `OPENAI_API_KEY=...`. The model defaults to `gpt-6-luna` with `OPENAI_REASONING_EFFORT=none`.

   Without it, the chat panel says "Chat unavailable offline — everything else works."

4. The command prints the service URL. Open it. The first request seeds the database (about a second).

What to expect on Cloud Run:

- The database is in `/tmp` inside the container. A cold start rebuilds it on Day 143. Logs, incidents and standing orders entered during a session are lost when the instance stops. This is intended for the demo.
- `HYGIEIA_DAY` and `HYGIEIA_PROFILE` set the day and profile used at seed time: `--set-env-vars HYGIEIA_DAY=143,HYGIEIA_PROFILE=transit`.

## 3. GoDaddy domain

Register a domain with the GoDaddy offer (for example `hygieia-space.<tld>`), then point a subdomain at Cloud Run.

1. Verify the domain with Google and create the mapping:

   ```bash
   gcloud domains verify hygieia-space.TLD
   gcloud beta run domain-mappings create --service hygieia --domain app.hygieia-space.TLD --region europe-west1
   ```

   The second command prints the DNS records to create. For a subdomain it is one CNAME.

2. In GoDaddy: **My Products → Domains → DNS → Add New Record**.

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | CNAME | `app` | `ghs.googlehosted.com.` | 1 hour |

   Use the exact value gcloud printed if it differs. Google issues the HTTPS certificate once the record is visible; this can take from a few minutes to a few hours.

3. Check:

   ```bash
   gcloud beta run domain-mappings describe --domain app.hygieia-space.TLD --region europe-west1
   ```

Domain mappings are offered in a limited set of Cloud Run regions. If your region does not support them, either deploy to one that does (`europe-west1` and `us-central1` do) or put the service behind a load balancer.

**Project page on GoDaddy hosting.** The offer includes a year of hosting. Use it for the static project page (pitch, video, sources) on the root domain `hygieia-space.TLD`, with a button linking to `https://app.hygieia-space.TLD`. Upload plain HTML through the hosting file manager; it needs no build step.

## 4. Laptop tunnel fallback

If the cloud deploy is not ready on demo day, run the app on a laptop and expose it.

Cloudflare Tunnel (no account needed for a temporary URL):

```bash
npm run build
npm start
```

```bash
cloudflared tunnel --url http://localhost:3000
```

Or localtunnel:

```bash
npx localtunnel --port 3000
```

Both print a public HTTPS URL. To put it on the GoDaddy domain for the day, add a forwarding rule in GoDaddy (**DNS → Forwarding**) from `app.hygieia-space.TLD` to that URL.

A tunnel exposes your laptop's copy of the demo to anyone with the URL. There is no sign-in in Hygieia. Stop the tunnel after the demo.

## 5. Optional mirror on Azure

Not required. Azure App Service can run the same `Dockerfile`: create a Web App for Containers on the free tier, push the image to a registry it can read, and set `WEBSITES_PORT=8080`.
