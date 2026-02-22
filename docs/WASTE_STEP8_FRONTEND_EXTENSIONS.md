# Waste Detection — Step 8 Frontend Extensions

Four new Next.js pages plus four dashboard widgets that complete the
waste-detection feedback loop: scoring entities, triaging findings,
investigating cases, and tuning detector sensitivity.

## New Routes

| Route                              | Component                    | Purpose                                              |
|------------------------------------|------------------------------|------------------------------------------------------|
| `/waste/scores`                    | `EntityScoresPage`           | Sortable / filterable table of entity risk scores     |
| `/waste/queue`                     | `ReviewQueuePage`            | Auditor workbench for triaging findings               |
| `/waste/investigations`            | `InvestigationsListPage`     | List of all investigations with status filter          |
| `/waste/investigations/[id]`       | `InvestigationDetailPage`    | Full investigation view with action timeline           |
| `/waste/settings/thresholds`       | `ThresholdConfigPage`        | Per-detector sensitivity sliders (admin only)          |

## Dashboard Widgets

Added to the existing `/waste` overview (payroll tab):

| Widget                  | Data Source         | Display                                           |
|-------------------------|---------------------|---------------------------------------------------|
| `SeverityDonut`         | `entity_scores`     | Recharts PieChart by severity tier                |
| `QueueStatus`           | `review_queue_items` | Stat cards: pending / assigned / disposed          |
| `AccuracyBars`          | `detector_accuracy`  | Horizontal bar chart of precision rates            |
| `InvestigationSummary`  | `investigations`     | Open / in-progress / pending / closed + overdue    |

## Shared Components

| Component           | File                        | Description                                              |
|---------------------|-----------------------------|----------------------------------------------------------|
| `SeverityBadge`     | `severity-badge.tsx`        | Color-coded badge (critical=red, high=orange, etc.)       |
| `ScoreBar`          | `score-bar.tsx`             | Horizontal 0–100 bar with color gradient + numeric label  |
| `DispositionSelect` | `disposition-select.tsx`    | Radix Select dropdown with all 7 disposition types         |
| `ActionCard`        | `action-card.tsx`           | Card: action type icon, title, status, due date, assignee  |

## API Layer

### New Types (in `src/lib/apiClient.ts`)

- `WasteEntityScore`, `WasteEntityScoreSignal`, `WasteEntityScoresPage`
- `WasteInvestigation`, `WasteInvestigationAction`, `WasteInvestigationsPage`
- `CreateInvestigationActionRequest`, `CloseInvestigationRequest`
- `WasteThreshold`, `UpdateThresholdRequest`

### New API Functions

| Function                          | Method | Endpoint                                          |
|-----------------------------------|--------|----------------------------------------------------|
| `getWasteEntityScores`            | GET    | `/api/waste/scores`                                |
| `getWasteInvestigations`          | GET    | `/api/waste/investigations`                        |
| `getWasteInvestigation`           | GET    | `/api/waste/investigations/{id}`                   |
| `createInvestigationAction`       | POST   | `/api/waste/investigations/{id}/actions`           |
| `closeInvestigation`              | POST   | `/api/waste/investigations/{id}/close`             |
| `exportInvestigationEvidence`     | GET    | `/api/waste/investigations/{id}/export`            |
| `getWasteThresholds`             | GET    | `/api/waste/thresholds`                            |
| `updateWasteThresholds`          | PUT    | `/api/waste/thresholds`                            |

### New Hooks (in `src/lib/hooks/useWaste.ts`)

| Hook                             | staleTime | Purpose                                    |
|----------------------------------|-----------|--------------------------------------------|
| `useWasteEntityScores`           | 30s       | Paginated entity scores with sort/filter    |
| `useWasteInvestigations`         | 30s       | Paginated investigations list               |
| `useWasteInvestigation`          | 30s       | Single investigation detail                 |
| `useCreateInvestigationAction`   | mutation  | Add action to investigation timeline         |
| `useCloseInvestigation`          | mutation  | Close investigation with disposition         |
| `useWasteThresholds`            | 60s       | Detector thresholds for a city               |
| `useUpdateWasteThresholds`      | mutation  | Batch-update threshold values                |

## Role Gates

| Page               | Minimum Role   |
|--------------------|----------------|
| Entity Scores      | viewer         |
| Review Queue       | ig_analyst     |
| Investigation      | ig_analyst (view: auditor) |
| Thresholds         | city_admin     |

All pages use `WasteShell` which requires Auth0 authentication.

## Sidebar Navigation

Four new entries added to the waste sidebar:

1. **Entity Scores** — `/waste/scores` (Target icon)
2. **Review Queue** — `/waste/queue` (ListChecks icon)
3. **Investigations** — `/waste/investigations` (Search icon)
4. **Thresholds** — `/waste/settings/thresholds` (SlidersHorizontal icon)

## Testing

Tests for shared components and data registries:

```bash
# Run all Step 8 tests
npm run test -- --grep "SeverityBadge|ScoreBar|DispositionSelect|ActionCard|step8"

# Run all waste tests
npm run test -- src/components/waste/
```

Test files:
- `severity-badge.test.tsx` — rendering, color mapping, case insensitivity
- `score-bar.test.tsx` — clamping, color thresholds, width calculation
- `disposition-select.test.tsx` — option completeness, rendering
- `action-card.test.tsx` — rendering, overdue logic, all action types
- `waste-step8-data.test.ts` — data integrity for options, orderings, categories

## File Map

```
src/
├── app/waste/
│   ├── scores/page.tsx
│   ├── queue/page.tsx
│   ├── investigations/
│   │   ├── page.tsx                   (list)
│   │   └── [id]/page.tsx             (detail)
│   └── settings/thresholds/page.tsx
├── components/waste/
│   ├── severity-badge.tsx            + .test.tsx
│   ├── score-bar.tsx                 + .test.tsx
│   ├── disposition-select.tsx        + .test.tsx
│   ├── action-card.tsx               + .test.tsx
│   ├── entity-scores-page.tsx
│   ├── review-queue-page.tsx
│   ├── investigation-detail-page.tsx
│   ├── investigations-list-page.tsx
│   ├── threshold-config-page.tsx
│   ├── waste-step8-data.test.ts
│   └── widgets/
│       ├── severity-donut.tsx
│       ├── queue-status.tsx
│       ├── accuracy-bars.tsx
│       └── investigation-summary.tsx
└── lib/
    ├── apiClient.ts                  (types + functions added)
    └── hooks/useWaste.ts             (hooks added)
```
