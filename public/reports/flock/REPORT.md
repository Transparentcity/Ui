# Flock by the Numbers

**What five American cities actually paid Flock Safety, what happened to vehicle theft while the cameras ran, and what happened where they were switched off.**

Transparent City. Draft for review, September 2026. Data as of 2026-08-29 (UTC retrieval timestamps in `scripts/analysis/flock/snapshots/`). Methodology pre-registered at commit `f093c5df` before any outcome was computed; amendments logged in `METHODOLOGY.md` §8. Every number in this document is read from `analysis_results.json`, `supplement.json`, or `snapshots/block_supplement.json`; nothing here was recomputed for the prose. Version 1.0. The canonical, versioned edition of this report is transparent.city/reports/flock, which also carries the data downloads.

---

## Summary

Two American cities switched off their Flock Safety camera networks in the past year, and vehicle theft in both kept falling. Austin ended its contract in June 2025; over the following twelve months its monthly thefts fell 21.8 percent, and over the seven months before Texas DPS installed state-owned Flock readers in the city, 12.7 percent, faster than Chicago, New York, or Seattle in the same windows. Denver removed all 110 cameras in March 2026; three months later, thefts are 17 percent below the prior year. The cities that kept dense networks paid remarkably little for them. San Francisco has paid Flock $5,191,350 across four fiscal years (FY2024 to FY2027), and its vehicle theft fell 49.5 percent in the year and a half following deployment, more than any comparison city. Whether the cameras caused any part of that decline cannot be established from public data, and this report does not claim it. This is a study of seven cities and four camera events, and everything in it is an association.

Three findings, each with its confidence stated:

1. **The cost is small and fully documented.** San Francisco's checkbook shows $5,191,350 paid to Flock Safety across four fiscal years (FY2024 to FY2027): $3,935,000 on the ALPR subscription contract and $1,228,000 so far on a $2,484,532 drone contract. Denver's checkbook shows $179,909 across six payments in late 2025, inside a contract the mayor's office described as just under $500,000. Chicago has paid Flock nothing. These figures match independent reporting.
2. **Where networks were dense, theft fell faster than in comparison cities.** San Francisco −49.5 percent and Oakland −41.9 percent over matched windows, against −36.6 (Chicago), −34.6 (Seattle), and −12.6 percent (New York). The seven-city panel association is −18.2 percent with a permutation p-value of 0.157, which does not clear conventional significance; the pre-registered robustness excluding the 40-camera Austin network gives −26.4 percent, p = 0.017. Austin's small network tracked the comparison cities almost exactly.
3. **Switching the networks off produced no detectable rebound, so far.** Austin and Denver both continued to decline after their networks went dark, at rates as fast as or faster than comparison cities. The windows are short (twelve months and three months) and the report says so.

Alongside these, the governance record is reported in full (§12): immigration-related lookups through Flock's national network, the SFPD June 2026 audit finding 299 unauthorized searches, and the Illinois Secretary of State's finding that Customs and Border Protection accessed Illinois cameras through an undisclosed pilot.

## 1. Why this report exists, and what it does not claim

Flock Safety operates automated license plate readers for more than 5,000 law-enforcement agencies. Since 2025, reporting on immigration-related lookups, state audits, and officer-misuse cases has driven dozens of cities to cancel contracts; the exact national tally (30, 53, or 80, depending on the tracker) is advocacy-sourced and is not relied on here. Austin canceled in June 2025. Denver let its contract expire on March 31, 2026 and removed every camera (110, or 111 by one count). San Francisco, which deployed 400 cameras in 2024, and Oakland, which renewed its 290-camera network in December 2025, kept theirs.

Both sides argue mostly from anecdotes and tallies. What has been missing is the middle layer: the contracts and payments in city checkbooks, and the crime series in city open-data portals, analyzed under rules fixed in advance. Transparent City ingests exactly these datasets for its covered cities. That is the whole contribution of this report. We claim no access to Flock, no access to police departments, and nothing that cannot be re-queried by any reader.

The design supports association language only. Seven cities and four camera events cannot identify a causal effect, and the report uses "coincided with" and "following" throughout, never "caused."

## 2. National context: theft was falling everywhere

This is the most important caveat, so it comes first. The FBI estimates the national motor vehicle theft rate fell 19.4 percent in 2024; the National Insurance Crime Bureau counted 17 percent fewer thefts that year, the largest annual decrease it has recorded in 40 years, and a further 23 percent decline in the first half of 2025. A major driver was the subsidence of the 2022 to 2023 Kia and Hyundai theft wave after manufacturer software fixes, which hit cities unevenly. Colorado felonized all motor vehicle theft in July 2023, before Denver's cameras went up.

Every city in the panel shows a large decline, with or without Flock. Any analysis that shows theft falling after camera installation and stops there is misleading. The questions this report can answer are whether Flock cities fell faster than comparable cities, and what happened at the off-switches.

## 3. Follow the money

Vendor names matching "FLOCK" were queried in each city's payment and contract datasets (one unrelated 2007 individual and a Chicago nonprofit containing the word were excluded).

| City | Source | What it shows | Amount |
|---|---|---|---|
| San Francisco | `cqi5-hm2d` (contracts) | "POL - ALPR subscription," Flock Safety, 2024-02-20 to 2027-02-19 | $3,935,000 agreed |
| San Francisco | `cqi5-hm2d` (contracts) | "POL - Flock Aerodome DFR" (drone as first responder), 2025-09-22 to 2027-09-21 | $2,484,532 agreed |
| San Francisco | `n9pm-xkyq` (payments) | Vouchers paid to FLOCK SAFETY: FY2024 $1,535,000; FY2025 $21,600; FY2026 $2,434,750; FY2027 $1,200,000 | $5,191,350 paid |
| Denver | `wnau-xrqi` (checkbook) | Six payments to FLOCK SAFETY, October to December 2025, "Computer services" | $179,909 |
| Chicago | `s4vu-giwb` (payments) | Zero payments to Flock Safety or Flock Group; CPD's ALPR vendor is Motorola/Vigilant | $0 |
| Oakland | none queryable | Initial 290-camera network was CHP-funded; the city's own two-year renewal, approved December 2025, is roughly $2M per council record | ~$2M (cited) |
| Austin | none queryable | Roughly 40 fixed cameras under a pilot that ended 2025-06-30, per council records and press | n/a (cited) |

The San Francisco figures match independent reporting: the San Francisco Standard, working from city contracting documents, reported that SFPD agreed to pay Flock more than $3.9 million for 2024-02-20 to 2027-02-19, which matches the contract row above; the city's own FY2027 voucher of $1,200,000 shows the annual renewal price. For Denver, the mayor's office approved a contract "for just under $500,000" per Government Technology and CBS Colorado; the $179,909 in the state-published checkbook is the portion inside that checkbook's window, so Denver's visible spend is a floor. San Francisco's program was funded largely by a $17.3 million state Organized Retail Theft Prevention Grant.

Scale matters. San Francisco's adopted budget is roughly $15.9 billion a year; $5.19 million across four fiscal years (FY2024 to FY2027) is about 0.03 percent of a single year's budget. Of the total, $3,935,000 was paid on the camera contract and $1,228,000 on the drone contract. SFPD separately attributes 207 arrests to its Flock ALPRs, including 166 stolen-vehicle arrests. Those are SFPD's numbers, not ours, and they are not independently verifiable from open data.

## 4. Design and pre-registration

The methodology was committed to the repository (commit `f093c5df`, 2026-08-29 21:43 PT) after schema feasibility probes and before any monthly outcome series was assembled. In brief:

- **Panel.** Seven cities, monthly motor vehicle theft counts by occurrence date, 2022-01 to 2026-06. Treated: San Francisco (on 2024-04), Oakland (on 2024-04), Austin (on 2024-02 as pre-registered; the first cameras went live 2024-03-29, and an ON = 2024-04 sensitivity gives −38.6 percent against comparisons of −36.6, −12.6, and −34.6; off 2025-07), Denver (on 2024-04, plus or minus two months, flagged; off 2026-04). Comparisons: Chicago, New York, Seattle. All three are Flock-free but not ALPR-free.
- **S2 pre/post.** For ON events, mean monthly theft in the 12 months before deployment against months 7 to 18 after, skipping a 6-month ramp, with identical windows for each comparison city. For OFF events, all available post months.
- **S3 difference-in-differences.** Log theft on a Flock-active indicator with city and month fixed effects, cluster-robust standard errors, and randomization inference across all 840 assignments of the four treatment paths to the seven cities.
- **S4 event studies.** Monthly coefficients relative to each event, treated city against the three comparisons.
- **S5 recoveries.** Recovered-vehicle counts and recovery-per-theft ratios where published (San Francisco, Oakland).
- **Publication rule.** Results published as computed, favorable or not, in correlational language.

Two items were added after pre-registration and are logged in `METHODOLOGY.md` §8: the verified Texas DPS install date for Austin (2026-02-02), and the block-level supplement S6 in §7 of this report, which is descriptive.

## 5. What the seven cities look like

Annual totals, from the pinned snapshot:

| City | 2022 | 2023 | 2024 | 2025 | 2023 to 2025 |
|---|---|---|---|---|---|
| San Francisco | 8,225 | 8,985 | 7,252 | 4,143 | −53.9% |
| Oakland | 8,431 | 11,271 | 9,234 | 6,219 | −44.8% |
| Denver | 15,005 | 12,249 | 8,723 | 5,575 | −54.5% |
| Austin | 5,102 | 6,790 | 5,829 | 4,269 | −37.1% |
| Chicago | 21,474 | 29,257 | 21,713 | 17,253 | −41.0% |
| New York City | 13,791 | 15,780 | 14,166 | 13,366 | −15.3% |
| Seattle | 6,978 | 9,259 | 7,439 | 5,799 | −37.4% |

Every series declines from its 2023 peak except Denver, which peaked in 2022 and had been falling for a year before its cameras went up, coinciding with Colorado's felony-theft law. Chicago ticks up in 2026 without any Flock change. San Francisco's 53.9 percent decline from 2023 to 2025 independently reproduces, from raw incident data, the 54 percent figure the San Francisco Standard reported from SFPD data.

## 6. Deployment: theft fell faster where cameras were dense

**S2, twelve-month pre-period against months 7 to 18 after the ON event** (mean monthly citywide thefts; comparison columns apply the identical calendar windows):

| Event | Pre mean | Post mean | Change | Chicago | NYC | Seattle |
|---|---|---|---|---|---|---|
| San Francisco on (2024-04) | 744.1 | 375.7 | −49.5% | −36.6% | −12.6% | −34.6% |
| Oakland on (2024-04) | 944.4 | 548.7 | −41.9% | −36.6% | −12.6% | −34.6% |
| Denver on (2024-04) | 942.3 | 505.9 | −46.3% | −36.6% | −12.6% | −34.6% |
| Austin on (2024-02, ~40 cameras) | 577.2 | 370.2 | −35.9% | −36.4% | −12.1% | −30.8% |

The pattern is consistent with camera density mattering. San Francisco (400 cameras, about 49 per 100,000 residents) and Oakland (290 city cameras plus 190 CHP highway cameras) outfell every comparison city. Austin, whose pilot amounted to roughly 40 cameras in a city of a million people, tracked the comparison cities almost exactly. Denver's row carries the Colorado confounders from §2. San Francisco's cameras arrived bundled with the Real-Time Investigation Center, drones, and staffing changes, and the contributions cannot be separated.

**S3, the panel model.** Across all seven cities, city-months with an active Flock network show 18.2 percent lower theft than city and calendar effects predict (coefficient −0.201, cluster SE 0.115). Under the pre-registered permutation test this does not clear conventional significance (p = 0.157); with four treatment paths among seven cities, a co-movement this size arises by chance about one time in six. The pre-registered robustness that excludes the low-dose Austin network sharpens the estimate to −26.4 percent, p = 0.017. Excluding Denver instead yields −14.2 percent, p = 0.183. Shifting San Francisco's start to full deployment (2024-07) changes little (−17.4 percent, p = 0.148). The remaining pre-registered variants, computed on the same snapshot on 2026-09-03: winsorizing each city's monthly counts at its 1st and 99th percentiles gives −18.3 percent, p = 0.148; the model in levels gives −53.5 thefts per month (no permutation run); moving Denver's start to February or June 2024 gives −18.8 percent (p = 0.129) and −17.2 percent (p = 0.169). A conventional 95 percent interval on the primary estimate runs from roughly −35 to +2 percent. The no-ramp version of S2 (months 1 to 12 after switch-on) gives San Francisco −30.4 percent against Chicago −28.5, Seattle −28.3, and New York −10.2, so the head start in this section appears in months 7 to 18 rather than in the first year.

**S4, event studies.** For San Francisco and Oakland, monthly coefficients relative to the three comparison cities drift downward through the post period. San Francisco reaches roughly 55 log points below baseline by month +24; Oakland's post-period coefficients range roughly 10 to 45 points below. The pre-period is flat for San Francisco and less so for Oakland, whose 2023 spike was steeper than the comparisons'. Figures 3 and 4 in the HTML and PDF editions show the coefficients with unadjusted 95 percent whiskers.

How to say this honestly: in the two cities that deployed dense Flock networks and kept them, vehicle theft fell roughly 42 to 50 percent within a year and a half, more than in any of three large comparison cities over the same months. A seven-city panel puts the association at 18 to 26 percent depending on specification, at the edge of what so small a panel can statistically distinguish from coincidence. It is an association consistent with the cameras helping, bundled with everything else those cities did at the same time. It is not proof.

## 7. The view from the block (post-registration supplement, descriptive)

This section was added after pre-registration and is labeled as a supplement. The DeFlock project crowdsources camera locations onto OpenStreetMap; at retrieval on 2026-08-31 its volunteers had mapped 333 SFPD Flock camera positions in San Francisco, about 83 percent of the 400-camera network. Of 30,807 incidents in the window, 390 lacked coordinates and were excluded, leaving 30,417 geocoded incidents; we measured the straight-line distance from each to the nearest mapped camera, then compared the twelve months before deployment (2023-04 to 2024-03) with the post-ramp period (2024-10 to 2026-06) on camera blocks (within 250 meters of a camera) and away from them (500 meters or more from every camera).

| Band | Monthly thefts before | Monthly thefts after | Change |
|---|---|---|---|
| Within 250 m of a mapped camera | 292.3 | 145.0 | −50.4% |
| 500 m or more from every mapped camera | 161.2 | 66.9 | −58.5% |

Two things are visible. First, the cameras sit where the problem was: camera blocks ran 292 thefts a month before deployment against 161 on distant blocks, consistent with SFPD's stated placement on high-traffic corridors. Second, the decline is citywide, not concentrated around camera sites; blocks far from every camera fell slightly more. If the cameras contributed to San Francisco's decline, the geography suggests they did so as an investigative network rather than by deterring theft at particular corners, which is consistent with the randomized literature's null deterrence findings and with what SFPD itself claims, which is arrests.

**Every high-theft neighborhood logged fewer thefts.** All 18 San Francisco analysis neighborhoods with at least 200 thefts in 2023 recorded fewer in 2025:

| Neighborhood | 2023 | 2025 | Change |
|---|---|---|---|
| Bayview Hunters Point | 1,025 | 497 | −51.5% |
| Mission | 941 | 462 | −50.9% |
| South of Market | 538 | 298 | −44.6% |
| Tenderloin | 438 | 274 | −37.4% |
| Sunset/Parkside | 389 | 135 | −65.3% |
| Bernal Heights | 378 | 127 | −66.4% |
| Excelsior | 334 | 152 | −54.5% |
| Western Addition | 297 | 141 | −52.5% |
| West of Twin Peaks | 291 | 91 | −68.7% |
| Financial District/South Beach | 281 | 176 | −37.4% |
| Potrero Hill | 260 | 92 | −64.6% |
| Portola | 259 | 91 | −64.9% |
| Nob Hill | 240 | 109 | −54.6% |
| Outer Mission | 234 | 99 | −57.7% |
| Hayes Valley | 226 | 106 | −53.1% |
| Castro/Upper Market | 216 | 103 | −52.3% |
| Oceanview/Merced/Ingleside | 209 | 95 | −54.5% |
| Visitacion Valley | 201 | 66 | −67.2% |

The steepest declines are in residential districts on the west and south sides, and the smallest are in the dense core. That gradient fits the national story in §2, in which the Kia and Hyundai wave that had made street-parked cars in residential neighborhoods easy targets receded after software fixes.

## 8. The off-switch: no rebound, so far

If dense camera networks were suppressing vehicle theft in real time, switching them off should show up in the data. Two cities ran that experiment.

**Austin** shut its city network down on 2025-06-30. The pre-registered S2 comparison (twelve months before against all twelve available post months) shows monthly theft falling from 388.8 to 304.2, a 21.8 percent decline, against −3.1 percent in Chicago, −9.1 percent in New York, and −17.6 percent in Seattle over the identical months. Because Texas DPS installed state-owned Flock readers along Austin rights-of-way on 2026-02-02, a post-hoc supplement also reports the clean seven-month window (2025-07 to 2026-01): Austin averaged 339.3 thefts a month against 388.8 in the prior year, a 12.7 percent decline, against −3.4 percent (Chicago), −4.3 percent (New York), and −7.0 percent (Seattle). Austin's roughly 40-camera network was small enough that little should have been expected of its removal.

**Denver** went dark at the end of March 2026. Three post months are observable: 303, 381, and 385 thefts against a prior-year mean of 429.2, a 17.0 percent decline, roughly matching Seattle (−19.7 percent) while Chicago rose (+6.9 percent). There is no jump and no visible trend break. Three months is a short window, and criminals' knowledge of camera removal may lag the removal itself.

What this means for the argument: the strongest version of the pro-camera case, that removing the cameras brings theft back, is not supported by the first two natural experiments available, within short windows. Anyone claiming Denver or Austin "paid in crime" for canceling is, on present evidence, wrong, and this report will not say it.

## 9. Recoveries

San Francisco's incident data records recovered vehicles alongside thefts: 7,413 recoveries since April 2024. The recovery-to-theft ratio was roughly 0.72 in the pre-camera period and 0.67 after; recoveries fell in proportion with thefts rather than rising as a share. The categories count incident reports, including vehicles stolen elsewhere and recovered in San Francisco, so the ratio is a rough gauge. It is worth stating plainly because "more recoveries" is a common vendor claim: San Francisco's open data shows fewer thefts and proportionally fewer recovery reports, not a rising recovery rate. Oakland's recovery-labeled categories show a flat ratio near 0.11 throughout, and its taxonomy differs too much from San Francisco's for comparison.

## 10. Data provenance

| Series | Portal | Dataset | Filter |
|---|---|---|---|
| SF thefts / recoveries | data.sfgov.org | `wg3w-h783` | `incident_category = 'Motor Vehicle Theft'` / `'Recovered Vehicle'` |
| SF payments | data.sfgov.org | `n9pm-xkyq` | `vendor = 'FLOCK SAFETY'` |
| SF contracts | data.sfgov.org | `cqi5-hm2d` | `prime_contractor like '%FLOCK%'` |
| Oakland thefts | data.oaklandca.gov | `ppgh-7dqv` | `crimetype = 'STOLEN VEHICLE'` |
| Austin thefts | data.austintexas.gov | `fdj4-gpfu` | `crime_type = 'AUTO THEFT'` |
| Denver thefts | denvergov.org (ArcGIS) | `ODC_CRIME_OFFENSES_P/324` | `OFFENSE_CATEGORY_ID = 'auto-theft'` |
| Denver payments | data.colorado.gov | `wnau-xrqi` | `payee = 'FLOCK SAFETY'` |
| Chicago thefts | data.cityofchicago.org | `ijzp-q8t2` | `primary_type = 'MOTOR VEHICLE THEFT'` |
| Chicago payments (zero-check) | data.cityofchicago.org | `s4vu-giwb` | `vendor_name like '%FLOCK SAFETY%' or '%FLOCK GROUP%'` |
| NYC thefts | data.cityofnewyork.us | `qgea-i56i` + `5uac-w243` | `ofns_desc = 'GRAND LARCENY OF MOTOR VEHICLE'` |
| Seattle thefts | data.seattle.gov | `tazs-3rd5` | `nibrs_offense_code = '240'` |
| SF camera locations (supplement) | OpenStreetMap via Overpass | DeFlock project nodes | `man_made=surveillance`, ALPR, operator SFPD or brand Flock Safety |

All counts are by occurrence date, citywide, monthly. Police data back-fills, so trailing months may rise in later refreshes; the panel ends 2026-06 for this reason. Per-capita rates use Census Vintage-2023 populations, held constant.

## 11. Limitations

- **Small N, stated in our own voice.** Seven cities and four treatment events. No specification here identifies a causal effect, and the permutation test exists precisely because seven clusters make conventional inference unreliable.
- **No causal identification.** Bundled interventions (San Francisco's cameras arrived with a real-time crime center, drones, and staffing changes). The randomized literature on ALPR deterrence, which predates Flock's dense fixed networks, found null effects, and nothing here overturns it.
- **The national wave dominates.** The Kia and Hyundai correction and record national declines moved every series; comparison cities absorb this imperfectly because the wave hit cities unevenly.
- **Comparison cities are Flock-free, not surveillance-free.** Chicago runs Vigilant ALPRs; New York and Seattle have readers of their own.
- **Off-windows are short.** Denver has three months. Austin has seven clean months before state-installed cameras recontaminate the city. Both deserve re-running in a year.
- **Reported crime is not crime.** Vehicle theft is among the best-reported offenses because insurance requires it; it still undercounts.
- **Denver's ON date is approximate** (plus or minus two months), and its checkbook window means its Flock spend is a floor.
- **The block supplement is descriptive and post-hoc.** Camera coordinates are crowdsourced and cover about 83 percent of the network; incident points are snapped to intersections; distance bands are coarse; cameras were placed on the highest-theft corridors, so near and far blocks differ at baseline.
- **Category taxonomies differ across cities.** Counts are never compared in levels across cities; only within-city changes are.

## 12. The governance ledger

The case against Flock in 2025 and 2026 was not that the cameras do not work. It was: local police running immigration-related lookups through Flock's national network despite state law (NPR, 2026-02-17); an Illinois Secretary of State audit in August 2025 finding that Customs and Border Protection accessed Illinois cameras through an undisclosed pilot (Capitol News Illinois); SFPD's own June 2026 audit finding 299 unauthorized searches of its data, including improper federal access (Mission Local); and officers criminally charged with using the system to track ex-partners (WBEZ, 2026-08-27). A federal judge in Norfolk nonetheless held a 176-camera network constitutional in January 2026, a ruling now on appeal, and Flock's August 2026 reforms, which cut the recommended default retention from 30 days to 7 (existing customers keep their settings) and will require a case code on every search by the end of the year, answered several criticisms directly. National cancellation tallies (30, 53, or 80 cities) come from advocacy trackers and are labeled as such.

Our data adds one observation to this ledger: the cities that canceled over these governance failures have not, so far, paid a measurable price in vehicle theft. Cities that keep the cameras are paying little for them; whether they are buying investigative capability is a claim only the departments can make. They also owe their residents the audit discipline that San Francisco's own review showed was missing.

## 13. Conclusion

The public record supports three sentences. Flock's cameras cost the cities in our panel little: $5,191,350 across four fiscal years in San Francisco, $179,909 visible in Denver's checkbook, and zero in Chicago. Where networks were dense, vehicle theft fell farther and faster than in three large comparison cities, an association of 18 to 26 percent in our panel that is present in every specification but statistically fragile in the pre-registered one. And where the cameras were switched off, theft kept falling, which retires the strongest claim made on the cameras' behalf while leaving intact the modest, checkable one: a cheap tool, concrete department-attributed arrests, outsized coincident declines, and governance, not effectiveness, as the thing the fights should be about.

## 14. References

1. SF.gov, "San Francisco begins installing automated license plate readers" (2024). https://www.sf.gov/news--san-francisco-begins-installing-automated-license-plate-readers-disrupt-organized-theft-and
2. SFPD Department Bulletin 24-052. https://www.sanfranciscopolice.org/your-sfpd/policies/department-bulletins-notices/24-052
3. SFPD News Release 25-047, Real-Time Investigation Center results. https://www.sanfranciscopolice.org/news/san-francisco-police-department-real-time-investigation
4. Oaklandside, Newsom and CHP camera announcement (2024-03-29). https://oaklandside.org/2024/03/29/governor-gavin-newsom-announces-license-plate-reader-cameras-flock-safety-oakland/
5. Oaklandside, "Oakland approves $2M Flock surveillance camera plan" (2025-12-17). https://oaklandside.org/2025/12/17/oakland-flock-safety-council-approves-surveillance-cameras/
6. KVUE, Austin reinstalls license plate readers (early February 2024). https://www.kvue.com/article/news/local/license-plate-readers-return-austin-months-after-approval/269-e8c89c3b-e777-43bd-b1e0-fd35d32d661f
7. EFF, "Victory! Austin organizers cancel city's Flock ALPR contract" (June 2025). https://www.eff.org/deeplinks/2025/06/victory-austin-organizers-cancel-citys-flock-alpr-contract
8. KVUE, "Texas DPS installs license plate reader cameras in Austin" (installs 2026-02-02). https://www.kvue.com/article/news/local/dps-license-plate-reader-cameras-austin/269-372ec82a-ab8f-4f95-aa45-b0157dbf9b5c
9. 9NEWS, "Denver removes all 110 Flock license plate reader cameras" (March 2026). https://www.9news.com/article/news/local/denver-removes-flock-license-plate-reader-cameras/73-eaf91d0a-3b90-45f5-8338-dbb9f79a8712
10. Government Technology, "Denver Mayor Extends City's Use of Flock License Plate Readers." https://www.govtech.com/public-safety/denver-mayor-extends-citys-use-of-flock-license-plate-readers
11. San Francisco Standard, SFPD data sharing and the $3.9M contract (2025-09-08). https://sfstandard.com/2025/09/08/sfpd-flock-alpr-ice-data-sharing/
12. FBI UCR, Summary of Reported Crimes in the Nation, 2024. https://cde.ucr.cjis.gov/LATEST/resources/reports/UCR%20Summary%20of%20Reported%20Crimes%20in%20the%20Nation%202024.pdf
13. National Insurance Crime Bureau, 2024 and first-half 2025 releases. https://www.nicb.org/news/news-releases/vehicle-thefts-united-states-fell-17-2024 and https://www.nicb.org/news/news-releases/nationwide-decline-vehicle-thefts-continues-through-first-half-2025
14. Lum, Koper et al., J. Experimental Criminology (2011); NIJ CrimeSolutions rating. https://link.springer.com/article/10.1007/s11292-011-9133-9
15. NPR, "Why some cities are ditching their Flock license plate readers" (2026-02-17). https://www.npr.org/2026/02/17/nx-s1-5612825/flock-contracts-canceled-immigration-survillance-concerns
16. Capitol News Illinois, on the Illinois Secretary of State audit finding CBP access through a Flock pilot (August 2025). https://capitolnewsillinois.com/news/hundreds-of-police-departments-use-camera-company-accused-of-breaking-state-law/
22. San Francisco Standard, reporting the 54 percent decline in vehicle theft from SFPD data (2026-03-25). https://sfstandard.com/2026/03/25/sf-surveillance-state-crime-drones-billionaires/
17. Mission Local, SFPD June 2026 audit, 299 unauthorized searches. https://missionlocal.org/2026/06/federal-agencies-sf-surveillance-flock-data-audit/
18. WBEZ, Flock in the Chicago suburbs (2026-08-27). https://www.wbez.org/public-safety/2026/08/27/flock-license-plate-reader-alpr-chicago-suburb
19. Courthouse News, Norfolk ruling of January 27, 2026 (reported February 2026). https://www.courthousenews.com/judge-holds-norfolks-license-plate-reader-use-constitutional/
20. San Francisco Chronicle, Flock's August 2026 reforms. https://www.sfchronicle.com/crime/article/flock-cameras-ceo-surveillance-policy-22384139.php
21. OpenStreetMap contributors via the DeFlock project (camera locations, retrieved 2026-08-31). https://deflock.me

## Appendix: reproduction

`docs/flock/METHODOLOGY.md` (pre-registration, commit `f093c5df`; amendments in §8). `scripts/analysis/flock/pull_data.py` (portal queries; snapshot with UTC timestamps), `analyze.py` (S1 to S5, randomization inference), `block_analysis.py` (S6 supplement), `build_charts.py` (figures), and `report/` (HTML and PDF editions). Rerunning `pull_data.py` then `analyze.py` regenerates every number from the live portals; trailing months will differ slightly as police data back-fills.
