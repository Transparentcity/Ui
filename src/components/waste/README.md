# Waste module (`/waste`)

Admin-only surface for browsing waste/fraud/abuse findings produced by the
backend detector pipeline. Simplified in July 2026 to three tabs over one
landing page.

## Routes

| Route | Renders |
|---|---|
| `/waste` | Findings by category (the module landing page) |
| `/waste/categories/[category]` | Category detail: filterable finding cards |
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

## Triage (the learning loop)

Finding cards on category detail pages carry Flag / Dismiss / Skip controls
(`QuickDisposition`). Flag posts `under_investigation`; Dismiss posts a
reason (`false_positive` / `data_error` / `inconclusive`); Skip writes
nothing. Dispositions feed detector precision on the backend, which
calibrates severity, so triaging findings directly sharpens the detectors.
Cards also show an auditor-validated precision chip ("87% precision · 23
reviewed") once a detector has 3+ reviewed findings.

The triage buttons require the numeric `db_id` on the finding payload
(Platform PR #123); older payloads degrade to no triage row.

## Cities

The picker is backend-driven: `useWasteSelectedCity` filters
`/api/admin/waste/cities` on `configured && launched`. Launching a new waste
city requires **no UI change** — add the city's dataset config to the
backend `city_dataset_registry.py` and flip `is_launched`. City-list
failures (e.g. 403 for a non-admin) surface as a banner in `WasteShell`.

## Testing

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
