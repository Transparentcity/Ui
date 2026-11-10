# Waste module (`/waste`)

Admin-only surface for browsing waste/fraud/abuse findings produced by the
backend detector pipeline. Simplified in July 2026 to three tabs over one
landing page. Since November 2026 the landing page leads with a ranked
**Top leads** shortlist and everything is ordered by strength of evidence
(see "Lead grading" below), not by severity or dollar size.

## Shell

The module renders inside the standard app shell. `src/app/waste/layout.tsx`
wraps every route in `WasteAppShell` (`waste-app-shell.tsx`), which renders the
shared `/home` `Sidebar` on the left and offsets the content beside it. The rail
is navigation-only here: its actions route to the `/home` SPA via the deep-link
query params `/home` consumes on mount (`?city_id=` / `?district=` / `?place_id=`
for places, `?view=feed|inbox` for the two rail nav items). `WasteShell`
(`waste-shell.tsx`) is the per-page right column: the ADMIN VIEW banner (which
carries the admin-tools gear), the city header row (city picker + last-pull
label + Seymour toggle), and the purple-eyebrow module head, above the tabbed
content and the persistent Seymour rail. The visual language is a grayscale
"ledger" (aligned tabular numbers in `--font-data`, headings in `--font-heading`,
purple reserved for links/actions and the eyebrow).

## Routes

| Route | Renders |
|---|---|
| `/waste` | Top leads, then findings by area (the module landing page) |
| `/waste/categories/[category]` | Area detail: finding cards, best leads first. `?finding=<id>` opens and scrolls to one finding (Top leads links here) |
| `/waste/departments` | Department risk profiles |
| `/waste/reports` | Report builder + per-detector-class workpapers |
| `/waste/reports/[slug]` | Workpaper detail with CSV/JSON export |
| `/waste/methodology`, `/waste/settings/thresholds`, `/waste/api` | Gear-menu admin tools |

Every pre-simplification URL (`/waste/forensics/*`, `/waste/executive`,
`/waste/queue`, `/waste/investigations`, `/waste/dashboard`, `/waste/scores`)
is a one-line redirect stub to its nearest equivalent. Delete them only if
you are sure no bookmarks or shared links remain.

## Data flow

Two backend surfaces feed the module:

1. **Persisted runs** (`/api/waste/runs` + `/api/waste/runs/{id}/result`):
   the categories grid, category detail, and report builder read the merged
   result of recent completed runs via `useLatestPersistedWasteResult`.
2. **Admin read endpoints** (`/api/admin/waste/*`): the city picker
   (`/cities`), and the Reports workpapers (`/reports`, `/reports/{slug}`).

### Load-time performance

Two mechanisms keep `/waste` fast; both live outside this directory:

- **Optimistic city resolution** (`useWasteSelectedCity`): while the city
  list loads, the stored `waste:selectedCityId` is trusted so the runs /
  result / key-metric queries start in parallel with the `/cities` fetch.
- **Cross-visit cache** (`src/lib/wasteQueryPersister.ts`, wired into
  `src/app/providers.tsx`): an exact allowlist of weekly artifacts — the
  merged persisted result and the city list — persists to IndexedDB for
  7 days, so return visits paint from last week's data and revalidate in
  the background. Mutable state (queue, accuracy, thresholds) is
  deliberately not persisted. Invariants: bump `WASTE_CACHE_BUSTER` on
  breaking payload-shape changes; persisted queries keep
  `gcTime: WASTE_CACHE_MAX_AGE` (an in-memory GC would drop them from disk
  on the next write); logout calls `clearPersistedWasteCache()` because
  IndexedDB outlives the localStorage clears.

### The never-blank merge (`mergePersistedRuns` in `waste-utils.ts`)

- Fetches up to 10 recent completed runs, but stops downloading result
  payloads at the first error-free full run (the common case fetches one).
- Per category, the newest run that (a) actually covered that category and
  (b) recorded no family-level error for it is authoritative. A run with
  `category != null` is scoped: it only speaks for its own category, so a
  payroll-only run can never blank contracts.
- When a newer run errored for a family, findings carry over from an older
  run and are labeled "Earlier run" on the cards.
- `data === null` from the hook means **no completed runs exist** (first-run
  state, renders the empty state with the refresh panel), which is distinct
  from "runs exist with zero findings" (renders zero-count category cards).

### Weekly refresh (job #2)

Data is produced by the backend `weekly_waste_refresh` custom scheduled job
(Sundays, all configured+launched cities). `WasteRefreshPanel` (gear menu,
and inline in the first-run empty state) shows the last run's **per-city**
outcomes parsed from the job result — the schedule-level status can read
"completed" even when every city failed — plus next run time and a Run Now
trigger via `runCustomScheduledJob`. Run Now always executes full runs.

## Key metrics

Waste metrics are ordinary platform metrics with `category="waste"`, built
via Seymour and grouped by subcategory (`procurement`, `payroll`, `capital`,
`service_delivery`, `fraud_risk`; `readout` metrics are findings-count KPIs
and excluded from display). `useWasteKeyMetrics` maps subcategories onto the
module's categories and joins YTD values/trends from the batch-comparisons
API. Surfaces: a headline number on each `/waste` category card, and the
`WasteKeyMetricsStrip` chips above each category's findings (click for the
full chart). Year-grain share metrics populate once Platform PR #122 is
deployed and the metrics re-run.

## Lead grading (what ranks where, and why)

Before November 2026 the module ranked on severity, and the backend derived
severity mostly from dollars. On a baseline run of the three waste cities,
78-93% of findings were High or Critical and the top ten in each city was
bookkeeping: a department "7,387% over budget" because it pays the city's
health insurer, the school board flagged as "both grantee and vendor", a
contract "$58 billion over" from a junk column. One of thirty top-ten rows
was a real lead.

Ranking is now on **evidence**. `waste-leads.ts` is the single place this
lives in the UI; the backend computes the same thing in
`services/waste/lead_grading.py` and ships it on each finding as
`lead_score`, `lead_tier`, `lead_reasons` and `known_case`. The UI prefers
those fields and computes them itself for payloads persisted before the
backend had them, so the page ranks sensibly on any stored run. **Keep
`TOOL_GRADES`, `SIGNAL_GROUP` and the weights in step with the backend.**

Each detector has an evidence grade:

| Grade | Meaning | Examples |
|---|---|---|
| direct | The pattern is visible in named records an auditor can pull | Orders priced just under the bid limit, same-day split orders, a contract paid past its ceiling (confirmed in the ledger), hours beyond what a week holds |
| pattern | Suggestive, with common innocent explanations | The same amount paid twice, a contract grown by add-ons, payments with no contract after expiry, a fast-growing grantee |
| context | Statistical or department-level background; never a lead alone | Benford, round numbers, budget variance, concentration, 311 trends, sole-source on its own, three-or-more identical payments (instalments), name-only employee/vendor matches, clustering under guessed limits |

```
score = grade base (55 / 30 / 8)
      + 10 if it names a payee, person or contract
           (or a department, when the grade is direct)
      + corroboration: +15 per other direct detector, +8 per other pattern
        detector on the same entity, capped at 25
      + materiality: log-scaled dollars, at most 10
      - 10 if the finding itself rests on partial data
tier  = "lead" (>= 60, shown as "Strong lead"), "review" (30-59, "Worth a
        look"), "context" (< 30, "Background")
```

Rules that keep the score honest, each learned from a false lead:

- **Dollars only break ties.** Materiality is log-scaled and capped, so no
  amount of money makes a background signal a lead.
- **Same signal, counted once.** Same-day splits, rolling-window splits, the
  vendor threshold profile and payment clustering under a limit are one
  signal (`SIGNAL_GROUP`), as are the pair and run forms of repeat payments.
- **Direct evidence is lifted only by other direct evidence.** A soft flag
  agreeing with a hard one adds nothing.
- **Departments get no corroboration credit.** Any large department trips
  several department-level detectors at once; that is size.
- **Structural payees are not vendors.** Governments, pension funds,
  insurers, utilities and banks are paid by statute or tariff; findings
  about the normal shape of those payments are dropped by the backend and
  graded as background by the UI mirror (`isStructuralFinding`).
- **Already public is labelled, not hidden.** A live finding whose entity
  matches a confirmed case, and overtime in police, fire, sheriff and
  emergency departments, carry `known_case` and an "Already public" chip.

### Top leads (`waste-top-leads.tsx`)

The landing page opens with the answer to "what should I look at first":
up to ten new leads across all areas, strong leads first. One row per
entity; at most three rows per detector per department for strong leads (a
department that prices hundreds of orders under the bid limit is one story
with two named examples, not ten rows of one sentence) and five per
detector overall for worth-a-look rows; roll-up "N detectors flagged this
entity" cards are skipped in favour of the finding itself; anything already
public is left out and counted in a footer line. A row shows the plain
headline and the fact specific to that finding; expanding it shows the
record, why it matters, what could explain it innocently (the finding's
caveat), why it ranks where it does, and a link into the area page.

Below it, the area table shows **Strong leads / Worth a look / All
findings** per area. The old High+ and Exposure columns are gone: both were
dollar-driven, so every row read alarming and none could be acted on.

Area names are plain language and live in one table
(`WASTE_CATEGORY_LABELS` / `WASTE_CATEGORY_DESCRIPTIONS` in
`waste-utils.ts`): "Contracts and purchasing", "Payroll and overtime",
"Conflicts of interest", "Lobbying and campaign money", "City services and
budgets", "Flagged in several areas", "Known cases".

Area pages default to the **Best leads** sort (toggle: Best leads /
Severity / Amount), which is `sortByLead` over the area's findings graded
against the whole run (corroboration counts detectors in any area).
Dismissed findings sink to the bottom. Cards carry the tier chip, the
"Already public" chip, and a "Why it ranks here" line when expanded.

`findingEvidenceScore` / `sortByEvidenceScore` in `waste-utils.ts` (the
earlier P(real) x dollars ranking) are kept for callers outside these
pages; the area pages no longer use them.

## Triage (the learning loop)

Finding cards on category detail pages carry Flag / Dismiss / Skip controls
(`QuickDisposition`). Flag posts `under_investigation`; Skip writes nothing.
Dismiss opens a five-reason picker (`DISMISS_REASONS` in
`disposition-select.tsx`) whose reasons map onto the backend enum **and**
carry a structured `notes` string preserving *why* — the enum alone can't
distinguish "detector logic misread the pattern" (legitimate explanation)
from "calibration" (threshold too tight) from "entity resolution" (wrong
entity), and those imply different fixes. "Already known (substantiated)"
maps to `confirmed_waste`, not `inconclusive`: a substantiated case is a
true positive for detector calibration. Dispositions feed detector precision
on the backend, which calibrates severity, so triaging findings directly
sharpens the detectors.

In the flat sorts (Evidence / Amount) the list also supports **keyboard
triage** (`waste-findings-list.tsx`): `j`/`k` move a highlight, `f` flags,
`1`–`5` dismiss with the corresponding reason, `s` skips (when wired), Esc
clears. Keyboard verdicts are mirrored onto the card via `triageOverride`.
Findings already carrying a `latest_disposition` are navigation-only — the
buttons don't render and keyboard verdicts are ignored, because re-disposing
the same finding week after week corrupts the precision counters.

Cards show an auditor-validated precision chip ("87% precision · 23
reviewed") once a detector has 3+ reviewed findings; below 10 reviews the
chip is grey and labeled *(provisional)* — 2/3 vs 3/3 is a coin flip — and
its tooltip carries the Wilson 95% lower bound. The same stats appear as a
per-detector line on `/waste/settings/thresholds` (`DetectorPrecisionHint`),
so threshold tuning is informed by labeled outcomes: <40% precision reads
"tightening candidate", ≥70% reads "validated; avoid loosening".

The triage buttons require the numeric `db_id` on the finding payload
(Platform PR #123); older payloads degrade to no triage row.

## Uncategorized bucket

`normalizeWasteCategory` routes unrecognized backend category strings to an
`uncategorized` bucket (it used to silently fall back to `payroll`). The
categories grid shows an "Uncategorized" row only when findings actually
land there, so a new or renamed backend category surfaces visibly instead of
polluting Payroll & Personnel. `resolveRunScope` treats a run whose scope
label normalizes to `uncategorized` as covering nothing.

## Cities

The picker is backend-driven: `useWasteSelectedCity` filters
`/api/admin/waste/cities` on `configured && launched`. Launching a new waste
city requires **no UI change** — add the city's dataset config to the
backend `city_dataset_registry.py` and flip `is_launched`. City-list
failures (e.g. 403 for a non-admin) surface as a banner in `WasteShell`.

## Testing

Lead grading and the shortlist rules are covered in `waste-leads.test.ts`
(every rule above has a test named for the false lead it prevents) and the
landing page in `forensics-categories-page.test.tsx`.

Component tests live next to their components; the merge semantics are
covered in `waste-utils.test.ts` ("run coverage" describe block), the panel
behaviors in `waste-refresh-panel.test.tsx`, the page loading/error/empty
states in `waste-reports-page.test.tsx` / `waste-workpaper-page.test.tsx` /
`forensics-categories-page.test.tsx`, and CSV escaping (including the
formula-injection guard) in `src/lib/waste/report-csv.test.ts`.

Note: Node 25 ships a global `localStorage` stub that shadows jsdom's in
vitest; tests that touch localStorage define their own mock (see
`useWasteSelectedCity.test.tsx`).

## Backend counterparts

- Detector pipeline + persistence: `src/transparentcity/services/waste/` in
  the Platform repo; error-handling and persistence invariants are
  documented in `docs/waste/DETECTOR_ERROR_HANDLING.md` there.
- Workpaper endpoints: `src/transparentcity/api/routes/waste_admin.py`.
- Lead grading: `services/waste/lead_grading.py`; structural payees:
  `services/waste/detectors/counterparty.py`. The November 2026 loop log,
  with the baseline and what each change fixed, is
  `docs/waste/LEAD_QUALITY_LOOPS_2026-11.md` in the Platform repo.
