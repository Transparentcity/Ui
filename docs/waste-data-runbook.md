# Waste Data Runbook

Every dataset the planned fraud detectors need — per source and per city — with
verified access paths, formats, costs, and the honest verdict on what is not
gettable without a city partnership.

- **Compiled:** 2026-08-29
- **Scope:** the 9 launched cities (SF, Oakland, Chicago, Detroit, Denver,
  Cincinnati, NYC, Austin, Seattle)
- **Verification:** live schema checks (Socrata `/api/views/{id}.json`, ArcGIS
  FeatureServer fields, a live Checkbook NYC API call) + primary-source access
  terms. Re-verify any source before building against it; schemas drift.

**Verdict legend** (used throughout):

| Verdict | Meaning |
|---|---|
| 🟢 **GETTABLE NOW** | Free or already ingested; structured access |
| 🟠 **WITH EFFORT** | Scraping, PDF extraction, FOIA/PRA, or small fees |
| 🔴 **PARTNERSHIP** | Only via a data-sharing agreement with the city |

---

## 1. Data already in hand

The platform already ingests, per city, via Socrata/ArcGIS portals: employee
salaries, vendor payments (checkbook), contracts, per-year budgets,
lobbying/campaign finance, and 311 service requests. Anything computable from
payment history, payroll history, and contract records needs no new sourcing:

- **Vendor dedupe** ("one vendor, two names") — fuzzy matching on names + the
  address fields available in SF/Chicago/NYC contract data.
- **Dormant vendor reactivation**, **new-vendor ramp** ("new vendor, big money
  fast"), and **just-under-limit clustering** — pure payment-history math.
- **Fuzzy duplicate payments** — on voucher/document IDs + amount/date/vendor
  similarity (invoice numbers are not public anywhere current; see §4).
- **Confirmed-case linkage and cross-city flags** — the product's own findings
  and dispositions.
- **Peer percentiles** — cross-city benchmarking over data already normalized
  across the 9 cities.

---

## 2. The screening core — external sources

Reference lists to screen vendors and grantees against. A hit on any of these
is a near-confirmed, "hard evidence"-tier finding.

**Pull cadence policy:** everything feeds the weekly Sunday waste refresh, so
weekly pulls are the default and slow-moving registries go monthly — no daily
jobs anywhere.

### SAM.gov exclusions (federal debarment) — 🟢 GETTABLE NOW

The anchor dataset. GSA produces the full active-exclusions file daily, but a
weekly pull is all a weekly detector run needs.

- **Access:** [Exclusions API](https://open.gsa.gov/api/exclusions-api/) +
  [Entity/Exclusions Extracts](https://open.gsa.gov/api/sam-entity-extracts-api/)
  (JSON/CSV); static V2 extracts on SAM.gov Data Services need no key.
- **Cost:** Free. Needs a free SAM.gov account with "Read Public" permission +
  API key.
- **Cadence:** **Weekly** — Saturday night, ahead of the Sunday waste refresh.
  Rate limits (as low as 10 req/day for roleless users) are irrelevant at that
  cadence.
- **Effort:** Trivial — single weekly ingest job. Extends the existing D9/D20
  checks from lookup to full-file screening.

### State debarment & suspension lists — 🟢 GETTABLE NOW (scraping-grade)

All free, all messy. Expect small lists, no APIs, name-only matching. Fewer
than half of states report these well (Good Jobs First), so treat state lists
as a supplement to SAM, not a substitute.

- **CA:** [DGS suspended firms](https://www.dgs.ca.gov/PD/Resources/Page-Content/Procurement-Division-Resources-List-Folder/SB-DVBE-Program-Violations-and-Sanctions)
  (web/PDF) + DIR debarments; SF publishes its
  [own city list](https://www.sf.gov/resource--2022--suspended-and-debarred-contractors).
- **IL:** split across three CPO sites
  ([General Services](https://cpo-general.illinois.gov/suspensions-debarments.html),
  CDB, Higher-Ed), HTML; the HFS OIG Medicaid sanctions list is separate and
  larger.
- **NY:** best in class — [DOL debarment list](https://dol.ny.gov/debarred-list)
  (PDF, frequent) + [searchable app](https://apps.labor.ny.gov/EDList/searchPage.do)
  + OGS non-responsible entities page.
- **TX:** [Comptroller debarred vendor list](https://comptroller.texas.gov/purchasing/programs/vendor-performance-tracking/debarred-vendors.php) — a PDF.
- **WA:** [L&I "not allowed to bid"](https://secure.lni.wa.gov/debarandstrike/contractordebarlist.aspx)
  (web table) + DES debarment page.
- **Cadence:** **Monthly** re-scrape with change detection; these lists move
  slowly.
- **Effort:** 6–10 bespoke scrapers/PDF parsers with change monitoring. Budget
  a few days each; they rarely change shape.

### IRS nonprofit data (grant screening) — 🟢 GETTABLE NOW

- **Access:** [Form 990 XML bulk](https://www.irs.gov/charities-non-profits/form-990-series-downloads)
  (IRS.gov; pre-Oct-2021 archive on AWS) +
  [TEOS bulk](https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads)
  (Pub 78, auto-revocations) +
  [EO Business Master File](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf)
  with EINs.
- **Cost:** Free.
- **Cadence:** **Monthly**, matching the IRS refresh cycle.
- **Powers:** NP4 registration checks, revoked-status screening, officer names
  for grantee↔vendor overlap (NP5), fiscal-sponsor unmasking (NP3).
- **Effort:** Easy–moderate; 990 XML schema versioning is the only pain.

### USAspending + SAM subawards — 🟢 GETTABLE NOW

- **Access:** free bulk + REST API; the entire production database ships as a
  nightly [Amazon RDS snapshot](https://aws.amazon.com/blogs/publicsector/announcing-usaspending-gov-on-an-amazon-rds-snapshot).
  FSRS.gov retired March 2025 — subaward data now via SAM.gov public APIs.
- **Powers:** cross-checking city vendors that are also federal
  contractors/subrecipients; corroborating vendor identity and size claims.
- **Cadence:** **Monthly** filtered pulls — the source updates more often, but
  vendor cross-checks don't need it.
- **Effort:** easy, but large volume — pull filtered slices, not the full
  snapshot.

### Court records (confirmed-case seeding) — 🟠 WITH EFFORT

- **Access:** [PACER](https://pacer.uscourts.gov/pacer-pricing-how-fees-work):
  $0.10/page, $3/doc cap, fees waived under $30/quarter — fine for
  hand-curating a fraud seed set. RECAP/CourtListener's free API is the
  practical bulk supplement.
- **Limits:** state courts (Cook County, Wayne County…) are fragmented portals
  with no uniform API — manual seeding only. City OIG/auditor reports (§4) are
  the richer seed source anyway.

### SSA Death Master File — 🔴 PARTNERSHIP

**Do not build this on public data.** Access is gated (NTIS certification
$2,930/yr + firewall form $268 + attestation $525/3yr + subscription
$4,645–12,762/yr + an accredited security assessment — call it $8–16k/yr), and
it's SSN-keyed while public payroll data has names only. Name-matching produces
unusable false positives.

- **Path:** deceased-payee detection becomes a **partnership feature**: the
  city supplies SSNs under agreement (§6). Obituary/state-index alternatives
  are screening-grade at best.

---

## 3. Business registries by state

Secretary-of-State data powers "banned or dissolved vendor paid," shell
fingerprints (shared registered agents/addresses), and officer names for the
employee↔vendor screen. The 9 cities span 8 states.

| State | Cities | Verdict | Access & cost | Officer / agent data |
|---|---|---|---|---|
| CO | Denver | 🟢 | Best available: [Business Entities](https://data.colorado.gov) Socrata dataset (`4ykn-tg5h`), public domain, free SODA API + CSV (source updates ~daily; pull weekly) | Registered agent name/address, status, principal address |
| NY | NYC | 🟢 | [Active Corporations](https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdp6) on data.ny.gov — 4.27M rows, free SODA API, monthly snapshot | Registered agent, DOS address, CEO for corps; LLC officer data thinner |
| OH | Cincinnati | 🟢 | Free search with CSV export + [free monthly bulk reports](https://www.ohiosos.gov/business/business-reports) (new filings, dissolutions) | Via filings |
| WA | Seattle | 🟠 | Old bulk extract **discontinued**; current path is CCFS Advanced Search with Excel export — workable but clunky | Registered agent + governors (officers) in CCFS records |
| CA | SF, Oakland | 🟠 | Free [bizfile](https://sos.ca.gov/business-programs/bizfile) search + free-tier REST API; bulk "Master Unload" reportedly ~$100 (unverified on SOS's own page) | Via Statements of Information |
| TX | Austin | 🟠 | No free search: [SOSDirect](https://www.sos.state.tx.us/corp/sosda/index.shtml) at $1.00/search prepaid; bulk files purchasable, pricing unverified — contact SOS | Officers/directors via filings |
| IL | Chicago | 🔴 | Free search at ilsos.gov but **no bulk and scraping expressly prohibited** (720 ILCS 5/16D); bulk via paid data sales/FOIA or third parties | Via third-party coverage |
| MI | Detroit | 🟠 | Free search on the new MiBusiness Registry portal; no public bulk/API found — likely FOIA or paid data sales. Confirm with LARA | Unverified |

> **Gap coverage:** an [OpenCorporates](https://opencorporates.com) low tier
> (~£2,250/yr ≈ $3k, ~200 calls/day; commercial use requires a paid plan)
> papers over the IL/MI/TX holes through one clean JSON API. Their free
> public-benefit program won't cover a for-profit product. Pricing has churned
> recently — confirm tiers before budgeting.

---

## 4. City-by-city portal inventory

Verified against live schemas. Beware federated portal search: naive queries
surface other governments' datasets.

| City | Checkbook / payments | Vendor addresses | Invoice #s | Payroll names | Bid tabs | Subcontractors |
|---|---|---|---|---|---|---|
| **SF** | 🟢 `n9pm-xkyq` vouchers, PO + contract # | 🟢 via `ebsh-uavg` (PO-line street/city/zip/contact) | — | 🔴 `88g8-5mnd` "Employee Name" is **numeric IDs**; names via CPRA (Transparent California has them) | 🟠 City Partner sourcing events, PDF/HTML, some behind login | 🔴 CMD LBE affidavits in PeopleSoft; public output is PDF audits |
| **Oakland** | 🔴 **no checkbook dataset found** | — | — | 🟠 unverified on portal; CPRA-able | — | — |
| **Chicago** | 🟢 `s4vu-giwb` voucher #, contract #, vendor name | 🟢 via Contracts `rsxa-ify5` (address 1/2, city, zip per contract); M/WBE directory scrapeable | — | 🟢 `xzkq-xp2w` full names + titles | 🟠 Bid Tabulation search (webapps1.chicago.gov/vcsearch/bidtabs), PDFs | 🔴 M/WBE via B2GNow; commitments in contract PDFs |
| **Detroit** | 🔴 richest schema of all (invoice #, check #, vendor city/zip) but **frozen at FY2021**; current = FOIA | 🟠 in stale data only | 🟠 in stale data only | 🟠 unverified on portal | — | — |
| **Denver** | 🟢 ArcGIS per-year checkbook layers; PaymentId, PO, payee city/state | 🟠 city/state only, no street | — | 🟠 unverified on portal | 🟠 results pages at denvergov.org (web/PDF) | — |
| **Cincinnati** | 🟢 `qrj9-83t8` TRANS_ID, CHECK_NO, vendor name | — | — | 🟢 `wmj4-ygbf` names, titles, hire date | — | — |
| **NYC** | 🟢 Checkbook API (live-verified; site is WAF-403 but API responds) — 3.16M FY25 rows, document + contract IDs | 🟢 SBS certified list `ci93-uc8s` (addresses, DBAs, principals); City Record awards carry VendorAddress | — | 🟢 `k397-673e` full names + titles | 🟠 awardees only via City Record `dg92-zbpx`; no all-bidder data in PASSPort | 🟢 **first-class**: `sub_vendor`, `associated_prime_vendor`, sub-contract IDs in the spending feed |
| **Austin** | 🟢 eCheckbook `8c6z-qnmj` vendor codes + payment document IDs | — | — | 🟠 not on portal; Texas PIA (Texas Tribune publishes it) | 🟠 **best in class**: Bid Tabs on Austin Finance Online ~1hr after close, per-vendor price PDFs | — |
| **Seattle** | 🔴 **no checkbook dataset exists** (Open Budget aggregates only); vendor detail = PRA | — | — | 🟢 `2khk-5ukd` names, titles, hourly rate | 🟠 contract search + ProcureWare (web) | — |

### Also verified per city

- **Campaign finance & lobbying** — 🟢 GETTABLE NOW. SF Ethics on DataSF
  (`pitq-e56w` transactions, `b947-pj2q` lobbyists); NYC CFB CSV exports
  2001–2025 + eLobbyist `fmf3-knd8` + Doing Business contributions `fbkk-n4e3`;
  Chicago lobbying structured (`tq3e-t5yq`) but *contributions live at the
  Illinois State Board of Elections* (bulk downloads); Seattle races covered by
  WA PDC on data.wa.gov (`kv7h-kjye`); Austin structured since 2020 (addresses
  redacted online).
- **Employee home addresses** — confirmed absent from every payroll schema
  inspected. Correct and expected; the employee↔vendor screen matches on
  *names vs. vendor officers/principals*, not addresses.
- **Audit & OIG reports** — 🟠 WITH EFFORT. Universally PDF (Chicago OIG
  quarterly investigation summaries are the best confirmed-case seed material;
  NYC Comptroller HTML+PDF; SF CSA; Austin Auditor; Seattle OIG; Denver
  Auditor). No machine-readable findings feed anywhere — LLM extraction
  pipeline required.

---

## 5. Detector → data dependency map

| Planned detector | Verdict | Needs | Notes |
|---|---|---|---|
| Certainty tiers, snooze, precision floors, shadow mode, confirmed-case linkage, cross-city flags, peer percentiles, tip channel, watch buttons | 🟢 | Own data only | No new sourcing. Build first. |
| Banned vendor paid | 🟢 | SAM weekly extract + state lists | SAM alone covers day one; state scrapers extend it. |
| Dissolved vendor paid / shell registration checks | 🟢 | SoS registries (§3) | CO/NY/OH free now; CA/TX/WA cheap; IL/MI via OpenCorporates. |
| One vendor, two names (dedupe) | 🟢 | Own payments + contract addresses | Address join strongest in SF/Chicago/NYC. |
| Dormant reactivation · new-vendor ramp · under-limit clusters | 🟢 | Own payment history | — |
| Fuzzy duplicate payments | 🟢 | Own payments (voucher/doc IDs) | Invoice-number variant impossible publicly; heuristics on amount/date/vendor instead. |
| Same name, both sides (employee ↔ vendor officer) | 🟠 | Payroll names + vendor officer names | Strongest in NYC (Doing Business – People `2sps-j9st`); workable Chicago/Seattle/Cincinnati; SF needs CPRA names; Austin needs PIA. Rank as "strong signal," not proof. |
| Rigged bidding (spread compression, rotation, loser-becomes-sub) | 🟠 | Bid tabulations + sub data | Per-city scrapers + PDF extraction. Start Austin, then Chicago. Loser-becomes-sub is NYC-only today. |
| Nonprofit grant screens (NP1–NP6 upgrades) | 🟢 | IRS 990/BMF/Pub 78 | Free monthly. |
| Employee ↔ vendor bank/TIN/address match | 🔴 | City vendor master + payroll file | The state-auditor-grade test. Flagship partnership feature. |
| Deceased payee | 🔴 | DMF + SSNs from city | Drop from public roadmap. |
| Sequential invoice numbers | 🔴 | Invoice numbers | Never public (stale Detroit excepted). Partnership feature. |
| Any vendor detector — Seattle & Oakland | 🔴 | Vendor-level payments | No public checkbook; PRA/partnership. Detroit current-year likewise. |

---

## 6. The partnership data ask

Everything public data can't support becomes the concrete value proposition for
a city data-sharing agreement. The ask, in priority order:

1. **Vendor master file** — vendor ID, legal + DBA names, remit-to address,
   phone, TIN, bank account (hashed is fine for matching), create/modify dates.
2. **Payroll extract** — employee ID, name, home address, bank account
   (hashed), SSN (or an agreed hash) for DMF matching, hire/term dates.
3. **Invoice-level AP detail** — invoice numbers, dates, line amounts (unlocks
   sequential-invoice and true duplicate-invoice tests).
4. **Current vendor payments** where no checkbook is public — Seattle, Oakland,
   current-year Detroit.
5. **Bid tabulations as data** where only PDFs are posted.

> **The pitch:** "Give us these five files under agreement and we'll run the
> checks state auditors call the strongest fraud tests that exist —
> employee-vendor account matching, deceased-payee screening, true duplicate
> invoices — none of which anyone can run on public data alone." The free-data
> screens are the demo that earns this conversation.

---

## 7. Budget & build order

| Line item | Annual cost | Unlocks |
|---|---|---|
| SAM.gov + state debarment + CO/NY/OH registries + IRS + USAspending + city portals | $0 | The entire screening core |
| OpenCorporates low tier | ~$3,000 | IL/MI/TX registry gap coverage, one API |
| TX SOSDirect + CA bulk + misc. fees | ~$300–800 | Direct-source TX/CA registry data |
| PACER (mostly fee-waived) | ~$0–120 | Confirmed-case seeds |
| *Not recommended:* Death Master File | $8–16k + audit | Nothing, without SSNs — partnership instead |

### Suggested ingestion order

1. **SAM.gov weekly extract** — one job, timed ahead of the Sunday refresh;
   immediate "hard evidence" findings.
2. **CO + NY + OH registries** — free structured APIs; proves the
   registry-screen pattern on 3 of 9 cities.
3. **State debarment scrapers** (CA, IL, NY, TX, WA first — covers 7 of 9
   cities).
4. **IRS nonprofit bulk** — upgrades the whole NP detector family.
5. **NYC officer names** (`2sps-j9st` + SBS `ci93-uc8s`) — the employee↔vendor
   pilot, in the city with the best data.
6. **OpenCorporates** — after confirming current pricing, to close IL/MI/TX.
7. **Austin bid-tab scraper** — the bid-rigging pilot; Chicago second.
8. **OIG/audit PDF extraction** — confirmed-case seed corpus, starting with
   Chicago OIG quarterlies.

---

## 8. Start here: San Francisco at zero cost

The agreed kickoff: prove the screening core in one city, spending nothing.
Everything below uses data already ingested or free sources.

1. **SAM.gov weekly extract → SF vendor screen.** One ingest job + one name
   matcher over the SF vendor list. First "Banned vendor paid" findings, $0.
2. **CA + SF debarment scrapers.** DGS suspended firms, DIR debarments, and
   SF's own suspended-contractors list — three small scrapers, monthly cadence.
3. **Supplier-address join.** Enrich SF vendors with street/city/zip/contact
   from `ebsh-uavg` (Purchasing Commodity Data), keyed on PO/contract number —
   unlocks address-based vendor dedupe and shared-address shell fingerprints.
4. **Own-history detectors on SF payments** (`n9pm-xkyq`): dormant-vendor
   reactivation, new-vendor ramp, just-under-limit clustering, fuzzy duplicate
   payments on voucher + amount/date/vendor similarity.
5. **CA SOS free-tier API spot checks.** Registration/dissolution status for
   vendors that trip any other detector (free tier is rate-limited, so check
   flagged vendors only, not the whole file).

Explicitly deferred (not zero-cost or not SF-gettable): CA SOS bulk file
(~$100), OpenCorporates, employee-name matching (SF payroll publishes numeric
IDs — needs CPRA), bid tabs (partially behind City Partner login), DMF.

---

## 9. Verification caveats

Verified by live schema inspection and primary-source terms pages, August 2026.
Not verified — confirm before committing:

- CA SOS bulk price (~$100 figure is from secondary sources)
- TX and MI bulk-data offerings (contact the SOS/LARA directly)
- OpenCorporates' exact current tiers (site is JS-gated; pricing has churned)
- Oakland vendor payments (appears absent — worth one direct portal pass + a
  PRA test)
- Denver/Oakland/Detroit payroll schemas
- Whether Seattle bid results consistently include all bidders
- Whether SF City Partner bid tabs are public without login

Registry and portal schemas drift — re-verify any source before building
against it, and add change-detection monitoring to every scraper from day one.
