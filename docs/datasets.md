# How each dataset is used

Hygieia mixes **real public data** from space agencies with **synthetic crew data**. This page says, for every dataset, where it comes from, what was taken from it, what the code does with it, and where it shows on screen.

The rule the app follows: it never goes online while running. `npm run fetch-data` downloads the data into `data/snapshots/`, the snapshots are committed, and the app reads only those files. If a download fails, the previous snapshot is kept and a warning is logged.

The machine-readable list is `content/sources.json`; the app shows it at `/sources`. Any number on screen that claims to be real carries an "ⓘ source" link to its entry there.

## At a glance

| Dataset | Agency | How it reaches the app | Drives |
|---|---|---|---|
| [DONKI space-weather events](https://ccmc.gsfc.nasa.gov/tools/DONKI/) | NASA / CCMC | Snapshot `donki.json` | Solar particle events on the mission timeline, radiation alerts, dose spikes |
| [GOES proton flux](https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json) | NOAA SWPC | Snapshot `goes_protons.json` | Current S-level and the flux chart |
| [Planetary K index](https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json) | NOAA SWPC | Snapshot `kp_index.json` | Geomagnetic activity card |
| [Horizons ephemeris](https://ssd.jpl.nasa.gov/horizons/) | NASA / JPL | Snapshot `light_time.json` | Real link delay for each mission day; the 22-minute worst case |
| [OSDR study metadata](https://visualization.osdr.nasa.gov/biodata/api/) | NASA | Snapshot `osdr_studies.json` | "Evidence in NASA OSDR" links in the knowledge base |
| [POWER surface weather](https://power.larc.nasa.gov/) | NASA LaRC | Snapshot `power_heat.json` | Outdoor heat card in Earth mode |
| [MSL RAD cruise](https://doi.org/10.1126/science.1235989) | NASA / SwRI | Published value | Transit dose rate |
| [MSL RAD surface](https://doi.org/10.1126/science.1244797) | NASA / SwRI | Published value | Mars surface dose rate |
| [Chang'E 4 LND](https://doi.org/10.1126/sciadv.aaz1334) | CNSA / Kiel / DLR | Published value | Lunar surface dose rate |
| [DOSIS and DOSIS 3D](https://doi.org/10.1051/swsc/2017005) | ESA / DLR | Published values | Station dose rate (a demo midpoint between two published anchors) |
| [ISS neutron share](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) | CSA | Published value | Neutron channel of the dosimeter |
| HRP [hazards](https://www.nasa.gov/hrp/hazards/), [risks](https://www.nasa.gov/hrp/risks/), [research](https://www.nasa.gov/hrp/ongoing-hrp-research/) | NASA | Page content | About page, knowledge base, sensor design |
| [NASA-STD-3001 CO₂ limit](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf) | NASA OCHMO | Published value | Cabin CO₂ amber line |
| [Exercise countermeasure](https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/) | NASA | Published value | Exercise prescription in microgravity |
| [Heat-index method](https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml) | NOAA NWS | Published formula | Heat index and its categories |
| [Background radiation](https://www.unscear.org/unscear/en/publications/2008_1.html) | UNSCEAR | Published value | Earth-mode dose rate |
| [Physical activity guideline](https://www.who.int/publications/i/item/9789240015128) | WHO | Published value | Earth-mode activity target |

Eight more are linked for the reader but not used in any calculation; they are listed at the end.

---

## Fetched into snapshots

### NASA/CCMC DONKI — space-weather events

- **Source.** [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/), through `https://ccmc.gsfc.nasa.gov/DONKI-API/get/{SEP|FLR|GST}`, with `api.nasa.gov/DONKI` (needs `NASA_API_KEY`) and `kauai.ccmc.gsfc.nasa.gov/DONKI/WS` as fallbacks. Credit: NASA/CCMC DONKI.
- **What is taken.** The last 365 days of solar energetic particle events (SEP), solar flares (FLR) and geomagnetic storms (GST). The API refuses ranges over 60 days, so the year is fetched in 60-day windows. Only M- and X-class flares are kept; smaller flares would make the file several times larger.
- **Fields used.** Event id, time, instruments that detected it, flare class, source region, the DONKI record link, and linked events.
- **What the code does.** `lib/data/spaceWeather.ts` picks the latest SEP that GOES measured at ≥10 MeV and places it on mission Day 120. Every other event keeps its real distance in days from that one ("replay mode"). SEP records measured by GOES at ≥10 MeV become `solar_particle_event` entries on the timeline. Those raise the radiation alert, the storm-shelter checklist, a dosimeter reminder for each crew member, and a spike in the seeded dose data.
- **On screen.** Space Weather page (event tables, dose impact), crew dashboard panel, the radiation card on each astronaut page, and the alert text, each with a link to the DONKI record.
- **Limits.** DONKI reports that an event happened, not how strong it was. Hygieia therefore labels replayed storms "S1 or higher", and the size of the dose spike is a demo value. Events seen only by STEREO-A or SOHO, or produced by forecast models, are listed but raise no alert.

### NOAA SWPC — GOES integral proton flux

- **Source.** <https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json>. U.S. public domain. Credit: NOAA SWPC. The S-scale is defined on NOAA's [space weather scales page](https://www.swpc.noaa.gov/noaa-scales-explanation).
- **What is taken.** Seven days of 5-minute proton flux from the primary GOES satellite. Only the ≥10 MeV channel is kept, reduced to the hourly maximum so a storm onset is not smoothed away.
- **What the code does.** `sLevelFromFlux` turns the latest value into a NOAA S-level: S1 at 10 pfu, S2 at 100, S3 at 1 000, S4 at 10 000, S5 at 100 000.
- **On screen.** "NOAA S-level now" and the log-scale flux chart on the Space Weather page; the S-level on the crew dashboard.
- **Limits.** It is a snapshot. "Now" means the moment `fetch-data` last ran, and the page shows that time.

### NOAA SWPC — planetary K index

- **Source.** <https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json>. U.S. public domain.
- **What is taken.** About a week of 3-hourly Kp values.
- **What the code does.** `gLevelFromKp` maps Kp to the NOAA G-scale (G1 at Kp 5).
- **On screen.** The Geomagnetic activity card on the Space Weather page.
- **Limits.** Shown for context only. It matters most in low Earth orbit and raises no onboard alert.

### NASA/JPL Horizons — Earth–Mars and Earth–Moon light time

- **Source.** [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), through `https://ssd.jpl.nasa.gov/api/horizons.api`. Credit: NASA/JPL Horizons.
- **What is taken.** Distance and one-way light time of Mars from Earth's centre every 5 days from the fictional mission start (1 June 2035) over one full Earth–Mars cycle, and of the Moon daily for a month.
- **What the code does.** `marsLightMinutes` interpolates the series to the calendar date of the current mission day.
- **On screen.** "Real Earth–Mars one-way light time on mission Day N" on the crew dashboard and the Houston console.
- **What it settles.** The brief's "up to 22 minutes" is confirmed by this data: the maximum over the cycle is 22.1 minutes and the minimum 3.2. The Moon averages 1.28 seconds. Both profile delays now cite Horizons.
- **Limits.** The mission dates are fictional, so the day-by-day value is illustrative. The range is real.

### NASA OSDR — Biological Data API

- **Source.** [OSDR Biological Data API](https://visualization.osdr.nasa.gov/biodata/api/), endpoint `v2/query/datasets/`. Credit: NASA Open Science Data Repository.
- **What is taken.** Metadata only: accession id, study title and organism for all datasets (about 650). No raw omics data is downloaded.
- **What the code does.** The fetch script tags each title by topic (bone, muscle, immune, eye, cardiovascular, radiation, microbiome, sleep, nutrition, human) and keeps about 40: the human spaceflight datasets (Inspiration4 and astronaut studies) plus up to four rodent spaceflight studies per topic. `evidenceFor` in `lib/server/kb.ts` matches each knowledge-base note to up to three of them, human datasets first.
- **On screen.** "Evidence in NASA OSDR" under each note on `/kb`.
- **Limits.** The match is by keyword in the title. The links are related open datasets, not evidence for any specific sentence, and the page says so. The NASA Twins Study did not appear under that name in the API.

### NASA POWER — surface weather (Earth mode)

- **Source.** [NASA POWER](https://power.larc.nasa.gov/), through `https://power.larc.nasa.gov/api/temporal/daily/point`. Credit: NASA Langley Research Center POWER Project.
- **What is taken.** 45 days of daily maximum and mean 2 m air temperature and mean relative humidity for one demo site: São Gabriel da Cachoeira, Amazonas, Brazil.
- **What the code does.** `heatIndexC` applies the U.S. National Weather Service heat-index procedure; `heatCategory` assigns the NWS category.
- **On screen.** The "Outdoor heat today" card on the crew dashboard when the Remote clinic profile is selected.
- **Why POWER and not Meteomatics.** The brief suggested Meteomatics for this, which needs an account. POWER is free, needs no key, and is NASA data.
- **Limits.** POWER lags real time by several days, so "today" is the latest day in the snapshot. The maximum temperature is paired with the daily mean humidity, which slightly overstates the afternoon heat index.

---

## Published values built into the model

These are single numbers taken from papers and agency pages. They are stored in `content/sources.json` and `content/profiles.json`; a unit test checks that each profile's dose rate equals the value of the source it cites.

### Radiation dose rates

| Environment | Rate | Source |
|---|---|---|
| Transit to Mars, inside the spacecraft | 1.8 mSv/day | MSL RAD cruise measurements. [Zeitlin et al., *Science* 2013](https://doi.org/10.1126/science.1235989) (the paper reports 1.84 ± 0.33) |
| Mars surface | 0.67 mSv/day | MSL RAD in Gale Crater. [Hassler et al., *Science* 2014](https://doi.org/10.1126/science.1244797) (the SwRI/NASA release quotes 0.67; the paper gives 0.64 ± 0.12) |
| Lunar surface | 1.369 mSv/day | Chang'E 4 Lunar Lander Neutrons and Dosimetry. [Zhang et al., *Science Advances* 2020](https://doi.org/10.1126/sciadv.aaz1334) (1369 µSv/day) |
| Station, low Earth orbit | 0.575 mSv/day | A demo midpoint, not a single published number. It sits between two published anchors: the Chang'E 4 paper puts the lunar rate at about 2.6 times the ISS rate (about 0.53 mSv/day), and [Berger et al., 2017](https://doi.org/10.1051/swsc/2017005) report up to 0.647 mSv/day in Columbus (DOSIS 3D, end of May 2016) |
| Remote clinic, Earth | 0.0066 mSv/day | [UNSCEAR 2008 report](https://www.unscear.org/unscear/en/publications/2008_1.html): world-average natural background, 2.4 mSv per year |

**How they are used.** The seed generator (`writeDose` in `lib/db/seed.ts`) draws each crew member's daily dose as the rate × a fixed shielding factor × ±15 % day-to-day variation. Switching profile regenerates the dose data at the new rate. The radiation card shows the rate with its source, the mission-to-date total against the plan, and the planned split by phase ("most dose is received in transit": 66 %). The phase durations in that plan are demo values; the rates are the sourced ones.

### Neutron share — CSA

The Canadian Space Agency [states](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) that neutrons contribute about 30 % of total radiation on the ISS. Hygieia's simulated dosimeter (modelled on CSA's CANS instrument) reports a neutron channel at 30 % of the non-solar dose. In the Station profile that is the sourced figure; in the other profiles the same share is applied and labelled a demo value.

### Cabin CO₂ limit — NASA-STD-3001

NASA's standard (requirement V2 6004, summarised in the [OCHMO carbon dioxide technical brief](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)) limits the average one-hour CO₂ partial pressure to 3 mmHg. That is the amber line for the cabin-air alert and the cabin card. The red line (6 mmHg) is a demo value.

### Exercise — NASA

NASA [reports](https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/) that station crews exercise an average of two hours a day. The microgravity profiles use 120 minutes a day as the prescription behind the bone-and-muscle alert. The 90 minutes in the surface profiles is a demo value. Earth mode uses the [WHO guideline](https://www.who.int/publications/i/item/9789240015128) of at least 150 minutes of moderate activity a week; the 30 minutes a day is Hygieia's reading of it.

### Heat-index method — NOAA NWS

The Rothfusz regression and its adjustments are the National Weather Service's [heat-index equation](https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml), as are the category thresholds (80, 90, 103 and 125 °F).

### Hazards, risks and research — NASA Human Research Program

- **[Five hazards](https://www.nasa.gov/hrp/hazards/).** The About page maps each hazard to Hygieia's features.
- **[Seventeen risks](https://www.nasa.gov/hrp/risks/).** One knowledge-base note per risk, grouped honestly into monitored, self-check only, and knowledge base only.
- **[Ongoing research](https://www.nasa.gov/hrp/ongoing-hrp-research/).** The simulated sensors are modelled on real studies: the wrist band (activity, sleep, light) on ARCHeR, which monitored well-being, activity and sleep on Artemis II, the common core set of measures on Standard Measures, the treadmill-free Transit profile on Zero T2. Thigh Cuff and B-Complex appear only as research under investigation, never as treatments, in the knowledge base and in the AI assistant's instructions.

---

## Linked, not used in a calculation

| Dataset | Agency | Why it is only linked |
|---|---|---|
| [OSDR RadLab](https://visualization.osdr.nasa.gov/radlab/) | NASA | A portal of multi-agency ISS dosimetry. The demo does not download a series from it, so no "real ISS dosimeter" line is plotted |
| [OSDR Environmental Data Application](https://visualization.osdr.nasa.gov/eda/) | NASA | Real ISS cabin telemetry. The demo does not download a series from it; cabin samples are synthetic and labelled demo values |
| [HREDA](https://hreda.esac.esa.int/) and its [DOSIS record](https://doi.org/10.57780/esa-r0cv51c) | ESA | The open archive entry for the DOSIS experiment (Dose Distribution inside the ISS) |
| [PADLES](https://humans-in-space.jaxa.jp/spacerad/EI000.html) (Kibo passive dosimetry) | JAXA | An independent ISS dose record a real system could cross-check against |
| [SEDA-AP on DARTS](https://darts.isas.jaxa.jp/stp/seda) | JAXA / ISAS | Radiation and plasma data from outside Kibo, 2009–2018; a candidate second space-weather source |
| [MARE on Artemis I](https://www.dlr.de/en/research-and-transfer/featured-topics/mission-moon/artemis-programme/the-mare-cosmic-radiation-experiment-on-board-artemis-i) | DLR | Beyond-low-Earth-orbit dose measured in body phantoms; motivates per-crew dose tracking |
| [EMBRACE](https://www2.inpe.br/climaespacial/portal/en/the-embrace-program/) | INPE (Brazil) | Brazil's space-weather programme; a candidate regional source |
| [CSA open data portal](https://donnees-data.asc-csa.gc.ca/) | CSA | A place to look for Canadian ISS dosimetry data; nothing from it is used |

---

## What is not real

- **The crew and every health reading.** Generated by a seeded random generator around a scripted storyline.
- **Cabin environment samples** (CO₂, pressure, temperature, noise, light).
- **The size of the dose spike** during a replayed solar particle event.
- **Recovery coefficients, most clinical thresholds, and the triage trees.**

Each of these is labelled "demo value" in the interface and listed under `demo-thresholds` on the Sources page.

## Refreshing the data

```bash
npm run fetch-data
```

One part only: `npx tsx scripts/fetch-data.ts donki` (or `goes`, `osdr`, `horizons`, `kp`, `power`). Then run `npm run seed` so the database picks up the new snapshots and fetch times.
