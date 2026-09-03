# Flock by the Numbers — Pre-Registered Methodology

**Status:** Committed BEFORE any outcome analysis was run. Data-source probes (schema checks,
category counts, date ranges) were performed to establish feasibility; no monthly outcome
series had been assembled and no pre/post statistic had been computed at the time this
document was committed. Results will be published as computed, favorable to Flock Safety
or not.

**Date:** 2026-08-29
**Author:** Transparent City (Adam Werbach), analysis assisted by Claude
**Code:** `scripts/analysis/flock/`

---

## 1. Research questions

- **RQ1 (footprint & cost):** What have Transparent City's covered cities actually paid
  Flock Safety, per city-checkbook data, and what is that spending in context of city
  budgets and comparable public-safety technology spends?
- **RQ2 (outcomes coincident with deployment):** How did motor vehicle theft (MVT) evolve
  in cities after Flock camera networks went live, relative to (a) their own pre-period and
  (b) comparison cities without Flock contracts?
- **RQ3 (the off-switch):** How did MVT evolve in cities that deactivated Flock networks
  (Austin, June 2025; Denver, March 2026), relative to trend and comparison cities?
- **RQ4 (recoveries):** Where recovered-vehicle data exists (SF, Oakland), how did
  recoveries and the recovery-to-theft ratio evolve around deployment?

We explicitly do NOT attempt to estimate a causal effect of Flock cameras on crime.
The design supports descriptive and quasi-experimental *association* language only.

## 2. Panel

Seven cities, monthly counts, **2022-01 through 2026-06** (last month complete across all
sources; NYC historic data ends 2025-12 and its YTD file covers 2026 through June).
Denver's open dataset is a rolling ~5-year window; its series is used from 2022-01.

| City | Role | Flock status | Event month(s) |
|---|---|---|---|
| San Francisco | Treated (on) | 400 cameras, live | Rollout 2024-03 → 2024-07; primary ON = **2024-04**, sensitivity ON = 2024-07 |
| Oakland | Treated (on) | 290 city + 190 highway (CHP-funded), live | ON = **2024-04** (announced 2024-03-29, installed spring 2024) |
| Austin | Treated (on→off) | ~40 fixed cameras (low dose) | ON = **2024-02**; OFF = **2025-07** (contract ended 2025-06-30) |
| Denver | Treated (on→off) | 110 cameras | ON = **2024-04** (±2 months, flagged); OFF = **2026-04** (contract expired mid-March 2026) |
| Chicago | Comparison | No Flock (Vigilant/Motorola ALPR) | — |
| New York City | Comparison | No Flock city contract known | — |
| Seattle | Comparison | No Flock city contract known (SPD has vehicle-mounted ALPR) | — |

Event-date sources: SF.gov/SFPD Bulletin 24-052; Oaklandside 2024-03-29 (Newsom/CHP);
KVUE/KUT (Austin install Feb 2024, program end June 2025); 9NEWS/Denverite (Denver removal
at contract expiry March 2026, cameras installed "over the past two years"). Denver's ON
month is the least certain and is flagged in all outputs.

## 3. Outcome definitions (fixed before analysis)

Monthly incident counts by **occurrence date** (not report date), citywide:

- **SF** `wg3w-h783`: `incident_category = 'Motor Vehicle Theft'`; secondary
  `incident_category = 'Recovered Vehicle'`. (Dataset begins 2018; incident reports.)
- **Chicago** `ijzp-q8t2`: `primary_type = 'MOTOR VEHICLE THEFT'`.
- **Austin** `fdj4-gpfu`: `crime_type = 'AUTO THEFT'`, by `occ_date`.
- **Oakland** `ppgh-7dqv`: `crimetype = 'STOLEN VEHICLE'`; secondary recovered-vehicle
  categories (`'STOLEN AND RECOVERED VEHICLE'`, `'RECOVERED VEHICLE - OAKLAND STOLEN'`).
  Oakland's category labels are noisy (typo variants exist at trivial counts, <0.1%);
  we use the exact labels listed and disclose the residual.
- **Denver** ArcGIS `ODC_CRIME_OFFENSES_P/FeatureServer/324`:
  `OFFENSE_CATEGORY_ID = 'auto-theft'`, by `FIRST_OCCURRENCE_DATE`.
- **NYC** `qgea-i56i` (through 2025-12) + `5uac-w243` (2026 YTD):
  `ofns_desc = 'GRAND LARCENY OF MOTOR VEHICLE'`, by `cmplnt_fr_dt`.
- **Seattle** `tazs-3rd5`: `nibrs_offense_code = '240'` (Motor Vehicle Theft), by
  `offense_date`.

Late-reporting: police incident data back-fills. The last 1–2 months of any series may
rise in later refreshes. We snapshot all pulls with a retrieval timestamp, end the panel
at 2026-06, and disclose this.

Per-capita rates (descriptive charts only) use Census Bureau Vintage-2023 city population
estimates, held constant.

## 4. Payments / cost data

- **SF**: vendor payments `n9pm-xkyq` and supplier contracts `cqi5-hm2d`,
  `vendor/contractor name LIKE '%FLOCK%'` — full row detail retained.
- **Denver**: checkbook `wnau-xrqi` (data.colorado.gov), `payee LIKE '%FLOCK%'`.
- **Chicago**: payments `s4vu-giwb`, same filter — expected result: no Flock Safety rows
  (negative finding, reported as such; the unrelated "Christian Fellowship Flock" nonprofit
  is excluded by requiring 'FLOCK SAFETY' or 'FLOCK GROUP').
- **Austin, Oakland**: no queryable city checkbook located on their open-data portals;
  contract values cited from council records and press, labeled as such.

## 5. Analytical specifications (fixed before analysis)

1. **S1 — Descriptive series:** monthly MVT per city, raw and per 100k, with event lines.
2. **S2 — Pre/post comparison:** for each treated city, mean monthly MVT in the 12 months
   before the ON month vs. months 7–18 after (skipping a 6-month ramp), and the same for
   OFF events (no ramp skip; report all available post months). Percent changes reported
   with the comparison cities' change over identical windows alongside.
3. **S3 — Difference-in-differences:** `log(MVT_ct) = α_c + γ_t + β·FlockActive_ct + ε_ct`
   on the 7-city monthly panel, where `FlockActive` is 1 in city-months with an operating
   city Flock network (SF 2024-04+, Oakland 2024-04+, Austin 2024-02..2025-06,
   Denver 2024-04..2026-03). OLS with city-clustered standard errors, PLUS — because 7
   clusters make asymptotic inference unreliable — **randomization inference**: permute the
   treatment profile across cities (all 7-choose assignments of the 4 observed treatment
   paths to the 7 cities, holding timing fixed), and report the permutation p-value for β.
4. **S4 — Event studies:** for Austin and Denver OFF events and SF/Oakland ON events,
   monthly coefficients relative to event month from
   `log(MVT_ct) = α_c + γ_t + Σ_k δ_k·1[t − E_c = k]` over k ∈ [−12, +max available].
5. **S5 — Recoveries (SF, Oakland):** monthly recovered-vehicle counts and
   recoveries-per-theft ratio, descriptive with event lines.

Robustness (all reported): levels instead of logs; dropping the ramp-skip; ON = 2024-07
for SF; excluding Austin (low dose, ~40 cameras); excluding Denver (uncertain ON date and
only ~3 post-OFF months); winsorizing at monthly p1/p99.

## 6. Pre-registered confounders and limitations

- **National MVT decline:** US motor vehicle theft fell sharply in 2024–2025 (FBI), driven
  partly by the subsidence of the 2022–23 Kia/Hyundai theft wave after software fixes.
  Time fixed effects + comparison cities absorb the national trend only imperfectly,
  because the Kia/Hyundai wave hit cities unevenly.
- **Colorado SB23-097** (felonized all auto theft, effective July 2023) and Denver's
  broader anti-theft push predate Flock and coincide with Denver's decline.
- **Austin post-OFF contamination:** Texas DPS installed its own Flock readers in Austin
  after the city contract ended (verified after pre-registration and disclosed here: DPS confirmed installing readers along state rights-of-way in Austin on 2026-02-02, per KVUE, https://www.kvue.com/article/news/local/dps-license-plate-reader-cameras-austin/269-372ec82a-ab8f-4f95-aa45-b0157dbf9b5c , and Spectrum News, 2026-02-13; Austin's clean city-off window is therefore 2025-07 through 2026-01, seven months, and the report labels the seven-month cut as a post-hoc supplement alongside the pre-registered 12-month version); Austin's OFF period
  is therefore "city network off," not "no Flock in Austin."
- **Bundled interventions:** SF's cameras arrived with the Real-Time Investigation Center,
  drone program, and staffing changes; effects cannot be separated.
- **Comparison cities are Flock-free, not surveillance-free** (Chicago: Vigilant; Seattle:
  vehicle-mounted ALPR; NYC: extensive ALPR via other vendors). The contrast identifies
  the *Flock fixed-camera network* margin only loosely.
- **Reported crime ≠ true crime;** MVT is among the better-reported offenses (insurance),
  which is why it is the primary outcome.
- **Small N:** 7 cities, 4 treatment events. No specification here supports causal claims,
  and the report will say so in its own voice.

## 7. Publication rules

Correlational language only ("coincided with", "following"). Every published number
traces to a dataset ID + query, or to a named external source. SFPD arrest-assist counts
are attributed to SFPD. Advocacy-sourced counts (e.g., national cancellation tallies) are
labeled as such. The governance controversies (ICE-related lookups, the SFPD June 2026
audit, the Illinois CBP pilot) are reported alongside favorable findings. Results are
published regardless of direction.

## 8. Amendments after pre-registration

- 2026-09-03: Section 6, Austin post-OFF contamination date verified and cited (KVUE, 2026-02-02 installs). No specification changed.
- 2026-08-31: Supplement S6 (block-level near/far camera comparison and neighborhood before/after, San Francisco only) added after outcomes were computed; disclosed as post-hoc and descriptive in the report.
- 2026-09-03: Robustness variants promised in section 5 and not yet reported (levels, no ramp skip, winsorizing at p1/p99) computed from the same pinned snapshot with no new data pull; plus a Denver ON-date sensitivity (2024-02 and 2024-06). All reported on the public page and in REPORT.md. No specification changed.
- 2026-09-03: Citation review corrections, no specification changed: (a) Austin's first cameras went live 2024-03-29 per KVUE, after the pre-registered ON month of 2024-02 (the scheduled date); an Austin ON = 2024-04 sensitivity is reported. (b) Denver's contract expired 2026-03-31, not mid-March; the OFF month (2026-04) is unchanged. (c) San Francisco's Census Vintage-2023 population corrected to 808,988 (808,437 was the 2022 ACS figure); per-capita rates recomputed from the same snapshot, changing no count and no percent change.
