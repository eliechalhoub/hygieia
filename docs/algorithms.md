# How Hygieia's algorithms work

Everything here lives in `lib/engine/` unless stated. The engine is pure TypeScript with no database, Node or browser imports, so the same code runs on the server (alerts, dashboards) and in the browser (the slider). Tests are in `tests/engine.test.ts` and `tests/storyline.test.ts`.

**Read this first.** The methods are standard and the code is tested, but the numbers that tune them are demo values unless a source is named. Nothing here is medically validated.

| Step | Question it answers | File |
|---|---|---|
| 1. Baseline | What is normal for this person? | `baseline.ts` |
| 2. Status | How far from normal is today? | `status.ts` |
| 3. Trend | Is it drifting steadily? | `baseline.ts`, `status.ts` |
| 4. Score | One readiness number, and why | `score.ts` |
| 5. Anomaly | Is the combination unusual? | `anomaly.ts` |
| 6. Forecast | Where is it heading in 7 days? | `forecast.ts` |
| 7. Early-warning rules | Which known patterns are present? | `rules.ts` |
| 8. Standing orders | What did the flight surgeon pre-authorise? | `rules.ts` |
| 9. Path back to green | What is the smallest change that fixes it? | `counterfactual.ts` |
| 10. Go/no-go | Who is fit for the task, and who can swap in? | `readiness.ts` |

Supporting models: the dose model and space-weather replay (`lib/db/seed.ts`, `lib/data/spaceWeather.ts`), the heat index (`lib/data/environment.ts`), and the delayed link (`lib/server/link.ts`).

---

## 1. Personal baseline

For each astronaut and each metric, the baseline is the **median** of the readings from the 30 days *before* today. Today is left out so a bad day cannot hide itself.

The spread is the **median absolute deviation** (MAD), scaled to be comparable with a standard deviation:

```
scale = max( 1.4826 × MAD,  scaleFloor,  relScaleFloor × |median| )
```

- Median and MAD are used instead of mean and standard deviation because a few bad days barely move them. Up to half the window can be abnormal before the median shifts.
- `scaleFloor` is the smallest day-to-day change worth reacting to for that metric (for example 0.4 h of sleep, 2.4 bpm). Without it, a very steady person would trip an alert on a trivial change. The floors are demo values, listed in `metrics.ts`.
- `relScaleFloor` is used only for radiation dose, whose level depends on the environment: the floor is 11.5 % of the median.
- A baseline needs at least 7 readings. Weekly self-checks (vision, balance) use a 70-day window and need 4.
- A reading older than 2 days (10 for weekly checks) is treated as missing, and the metric shows "No data".

**Limit.** A drift that lasts longer than about two weeks slowly becomes the new baseline. A flight system would freeze the baseline while an alert is open.

## 2. Status: green, amber, red

The robust z-score says how many baseline widths today is from normal:

```
z = (value − median) / scale
```

Each metric has an unhealthy direction: low (sleep, mood, SpO₂), high (resting heart rate, temperature, reaction time, dose) or both (blood pressure, glucose). **Badness** is z in the unhealthy direction and zero otherwise, so sleeping longer than usual is never an alert.

| Badness | Status |
|---|---|
| below 1.5 | green |
| 1.5 to 2.5 | amber |
| above 2.5 | red |

**Hard limits override the z-score.** SpO₂ below 90 % (88 % in the surface profiles) or temperature above 38.0 °C is red whatever the baseline says. Thresholds come from the environment profile (`content/profiles.json`).

A **body region** takes the colour of its worst metric. An astronaut takes the colour of their worst region.

## 3. Steady drift (Theil–Sen trend)

For a metric that is amber or red, the engine looks at the last 5 days and computes the **Theil–Sen slope**: the median of the slopes between every pair of days. One odd reading does not move it, which a least-squares line would follow.

The drift is reported in words ("Falling about 0.2 h a day over the last 5 days") only when all three hold:

- at least 80 % of the day pairs agree on the direction,
- the direction is the unhealthy one,
- the change over the window is at least one baseline width.

## 4. Readiness score

Each metric's badness becomes a penalty between 0 and 1:

```
penalty = clamp( (badness − 1.5) / (4.0 − 1.5), 0, 1 )
```

So a metric costs nothing until it reaches its amber line, and its full weight at 4 baseline widths. A region's penalty is that of its worst metric.

```
score = 100 − 100 × ( 0.5 × worstRegionPenalty + 0.5 × Σ weight_r × penalty_r )
```

Half the score follows the single worst region, so one serious problem cannot be averaged away by seven healthy regions. The other half is a weighted mix. The weights come from the profile: Transit weights radiation and isolation highest; Mars surface weights balance and muscles and bones.

The "Why this score?" panel on the dashboard lists the points each region removed. Below 80 the score is shown amber, below 60 red. The blend, the cut-offs and the weights are design choices, not measurements.

## 5. Whole-body anomaly (Mahalanobis distance)

Single-metric checks miss a combination that is odd as a whole, such as a slightly raised heart rate together with a slightly raised temperature. The engine takes today's values of eight daily metrics (sleep, mood, resting heart rate, HRV, systolic blood pressure, SpO₂, temperature, fluids) as one point and measures its **Mahalanobis distance** from the astronaut's own last 45 days:

```
d² = (x − μ)ᵀ Σ⁻¹ (x − μ)
```

- Σ is the astronaut's own covariance matrix. Its off-diagonal terms are shrunk by 30 % toward zero, because 45 days is little data for 8 dimensions and an unshrunk estimate is unstable.
- The alarm line is the 99 % point of the chi-square distribution with 8 degrees of freedom (about 20.1), computed with the Wilson–Hilferty approximation.
- The contribution of each metric to d² is reported, so the alert names its top contributors.
- With fewer than 20 complete days the check says it cannot run.

`ml-matrix` inverts the matrix.

## 6. Forecast (Holt linear trend)

For each daily metric the engine fits **Holt's linear-trend smoothing** to the last 14 days and projects 7 days ahead:

```
level_t = α × value_t + (1 − α) × (level_{t−1} + trend_{t−1})
trend_t = β × (level_t − level_{t−1}) + (1 − β) × trend_{t−1}
forecast(h) = level + h × trend
```

**Fitting α and β.** Each series gets its own pair from a small grid (α from 0.2 to 0.8, β from 0.05 to 0.3). Among the pairs whose band is still narrow enough to be useful, the one with the smallest one-step error wins. A quiet series ends up with a slow, stable level. A series that has just shifted ends up with a fast level, so the forecast starts near the latest readings.

**The 80 % band** comes from the spread of the one-step errors, widened with the horizon using Holt's error-growth formula.

**The engine abstains, and says why**, when there are fewer than 10 readings in the window, or when no pair gives a band narrower than the distance between the two red lines. A forecast wider than that says nothing useful.

**Limit.** A straight-line trend continues forever. Sleep cannot keep falling by 0.2 h a day for a month. Seven days is the longest horizon shown.

## 7. Early-warning rules

Each rule is a known pattern, checked every day, with the reason written from the numbers it used. Thresholds are demo values unless a source is given.

| Rule | Fires when |
|---|---|
| Infection onset | Temperature and resting heart rate both amber or worse on 2 of the last 3 days, and HRV down |
| Dehydration | Fluids amber or worse on 2 of the last 3 days |
| Fatigue-error risk | Sleep amber or worse on 2 of the last 3 nights, and reaction time or lapses amber or worse |
| Bone and muscle trajectory | 14-day mean exercise below 80 % of the prescription. This is a proxy: bone is not measured |
| SANS progression | Three falling vision self-checks, the latest amber or worse. A screening prompt, not a diagnosis |
| Sleep-schedule drift | Sleep regularity amber or worse on 3 of the last 4 days |
| Radiation exposure | A replayed solar particle event today or yesterday, or daily dose red |
| Cabin air | Cabin CO₂ at or above 3 mmHg (NASA-STD-3001 one-hour limit) with 2 or more crew showing headaches or slow reactions, or CO₂ at or above 6 mmHg |

## 8. Standing orders

The flight surgeon writes a rule in advance: *metric, operator, value, N days in a row → advice*. The order travels up the delayed link and becomes active when it arrives.

The ship evaluates every active order on every data change. It fires when the last N daily readings, ending today, all match. The alert carries the surgeon's name, so the crew knows the advice was pre-authorised and did not need a round trip to Earth.

## 9. Path back to green

This answers: what is the smallest change that brings every drifting metric back to green?

**The response model.** Each drifting metric's badness is stepped forward one day at a time. Four levers pull it back:

| Lever | Unit | Pulls back (badness per unit per day) |
|---|---|---|
| Sleep | hour slept above a "short night" (usual sleep − 1.25 h) | mood 0.5, HRV 0.45, heart rate 0.3, reaction time 0.6, lapses 0.6, sleep regularity 0.7, blood pressure 0.15 |
| Shared crew time | hour per day | mood 0.45, HRV 0.1, heart rate 0.05 |
| Extra exercise | 30 min per day | activity 1.0, glucose 0.2, HRV 0.15, mood 0.1, sleep regularity 0.1 |
| Extra fluids | 0.5 L per day | heart rate 0.2, blood pressure 0.1–0.15 |

- A short night adds harm instead (for example mood +0.3 per hour short).
- Recovery saturates: no metric improves by more than 1.0 baseline width per day.
- Sleep, exercise and fluids set their own metrics directly.
- After the plan ends, the usual routine is assumed.

**These coefficients are demo values.** They are not fitted to flight or clinical data. A real system would learn them per person.

**The search.** A grid of about 900 plans is tried: sleep target (from about usual sleep up to 9 h), 1 to 4 nights, crew time 0 to 2 h, extra exercise 0 to 30 min, extra fluids 0 to 1 L. A plan qualifies if every metric the levers can move is green by the day after the plan ends. The winner has the lowest

```
cost = effort + 1.0 × days until green
```

where effort counts extra sleep hours, crew-time hours, exercise and fluids over the plan's nights. Metrics no lever can move (temperature in an infection, radiation dose) are named and left to the alerts.

**The slider** re-runs the same simulation in the browser with the chosen sleep and crew time, so the projected day moves as you drag.

## 10. Go/no-go and swap suggestions

For each task in the next 7 days, every assigned astronaut is projected to the task day:

- a metric that is already drifting follows its forecast;
- a metric that is green changes only if the whole 80 % band is outside green on the task day;
- if the engine abstained, today's value is carried forward.

The projected values give a projected score. An astronaut is **go** if the score is at or above the task threshold (75 for a spacewalk in microgravity, 78 on a surface, 70 for docking) and no metric is projected red.

For each no-go, a **swap** is suggested from crew who are not assigned, hold the required training, are green today and are projected go. The highest projected score is offered first.

---

## Supporting models

### Radiation dose

```
daily dose = sourced rate × shielding factor × (1 ± 15 %) + solar particle increment
```

- The rate is the published mean for the environment (see `docs/datasets.md`).
- The shielding factor is a fixed 0.97 to 1.03 per bunk (demo value).
- The neutron channel is 30 % of the non-solar dose (CSA figure for the ISS; applied to other environments as a demo value).
- When a real solar particle event is replayed, 2.0 mSv is added on the event day and 0.7 mSv the day after, or 4.0 and 1.4 mSv when GOES also recorded protons above 100 MeV. **The timing is real; these sizes are demo values.** No spike is added in Earth mode.

### Space-weather replay

The latest real particle event that GOES measured at ≥10 MeV is placed on mission Day 120. Every other real event keeps its real distance in days from it. Only GOES ≥10 MeV events raise an onboard alert; events seen only by STEREO-A, SOHO or models are listed but do not, because they describe conditions elsewhere or are predictions.

The NOAA S-level comes from the ≥10 MeV proton flux: S1 at 10 pfu, then a level for every factor of ten.

### Heat index (Earth mode)

Air temperature and humidity from NASA POWER are turned into an apparent temperature with the U.S. National Weather Service procedure: the simple Steadman form, then the Rothfusz regression with its two adjustments when the result is 80 °F or more. The categories are the NWS ones: Caution from 80 °F, Extreme caution from 90 °F, Danger from 103 °F, Extreme danger from 125 °F.

### Delayed link

Every message is stored with `deliver_at = sent_at + one-way delay` and is invisible to the other side until that time. The real delay for each mission day comes from JPL Horizons; the demo compresses the worst case (22 minutes) to 20 seconds.

### Synthetic crew data

The seed draws each reading as the astronaut's mean plus bounded uniform noise, then adds the scripted episodes (`storyEffect` in `lib/db/seed.ts`). The random generator is seeded, so the same seed always gives the same mission.

---

## What the tests check

- **Baseline:** median and MAD; today excluded; robust to outliers; the scale floor.
- **Status:** the 1.5 and 2.5 cut-offs; direction; hard limit beating a wide baseline; region = worst metric.
- **Trend:** Theil–Sen ignores a spike; the sentence appears only for drifting metrics.
- **Score:** 100 when green; the points lost add up; profile weights matter.
- **Anomaly:** quantile approximations; distance along versus against a correlation; top contributors.
- **Forecast:** follows a linear trend; abstains with too few or too noisy readings; faster level after a shift.
- **Path back to green:** never green if nothing changes; more sleep never delays recovery; unaddressable metrics named.
- **Go/no-go:** an untrained green crew member is not offered as a swap.
- **Rules and standing orders:** each rule fires on its pattern and stays quiet on a healthy baseline.
- **Storyline:** the seeded mission reproduces all eight demo steps.
