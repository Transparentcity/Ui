/**
 * Shared test utilities for waste module interactive tests.
 */
import { vi } from "vitest"
import type { WasteFinding, WasteReviewQueueItem, WasteInvestigation, WasteThreshold, WasteEntityScore } from "@/lib/apiClient"

// ── ResizeObserver polyfill (needed by Radix UI) ────────────────────────────

export function installResizeObserver() {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver
  }
}

// ── TanStack Query mock factories ───────────────────────────────────────────

/** Returns a shape matching UseQueryResult in its "success" state. */
export function makeMockQuery<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: "success" as const,
    refetch: vi.fn().mockResolvedValue({ data }),
    ...overrides,
  }
}

/** Returns a shape matching UseQueryResult in its "loading" state. */
export function makeMockQueryLoading() {
  return {
    data: undefined,
    error: null,
    isLoading: true,
    isFetching: true,
    isError: false,
    isSuccess: false,
    isPending: true,
    status: "pending" as const,
    refetch: vi.fn(),
  }
}

/** Returns a shape matching UseQueryResult in its "error" state. */
export function makeMockQueryError(msg = "Something went wrong") {
  return {
    data: undefined,
    error: new Error(msg),
    isLoading: false,
    isFetching: false,
    isError: true,
    isSuccess: false,
    isPending: false,
    status: "error" as const,
    refetch: vi.fn(),
  }
}

/** Returns a shape matching UseMutationResult in its idle state. */
export function makeMockMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
    status: "idle" as const,
    variables: undefined,
    ...overrides,
  }
}

/** Returns a mutation mock in its "pending" (loading) state. */
export function makeMockMutationPending() {
  return makeMockMutation({ isPending: true, isIdle: false, status: "pending" })
}

// ── Domain object factories ─────────────────────────────────────────────────

export function makeFinding(overrides: Partial<WasteFinding> = {}): WasteFinding {
  return {
    id: "F-001",
    category: "Payroll",
    subcategory: "Overtime Abuse",
    entity: "Fire Department",
    severity: "critical",
    confidence: "high",
    confidence_reason: "Statistical outlier",
    tool: "Pareto Detector",
    description: "Excessive overtime detected in Fire Department.",
    metric: "$2.3M",
    metricDetail: "above peer average",
    amount: 2300000,
    priority_score: 95,
    is_new: false,
    is_partial_data: false,
    caveat: null,
    ...overrides,
  } as WasteFinding
}

export function makeQueueItem(overrides: Partial<WasteReviewQueueItem> = {}): WasteReviewQueueItem {
  return {
    id: "qi-1",
    city_id: 1,
    finding_id: 100,
    finding_category: "Payroll",
    finding_subcategory: "Overtime Abuse",
    finding_entity_name: "Fire Department",
    finding_description: "Excessive overtime in Fire Dept",
    finding_detector_key: "overtime_abuse",
    finding_severity: "critical",
    composite_score: 88.5,
    priority: "critical",
    status: "pending",
    assigned_to: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    ...overrides,
  } as WasteReviewQueueItem
}

export function makeInvestigation(overrides: Partial<WasteInvestigation> = {}): WasteInvestigation {
  return {
    id: "inv-1",
    city_id: 1,
    title: "Fire Dept Overtime Investigation",
    status: "open",
    lead_auditor_id: "auditor@city.gov",
    opened_at: "2026-01-10T00:00:00Z",
    closed_at: null,
    final_disposition: null,
    finding: {
      id: 100,
      severity: "critical",
      entity_name: "Fire Department",
      subcategory: "Overtime Abuse",
      description: "Excessive overtime detected",
      finding_description: "Excessive overtime detected",
    },
    entity_score: { composite_score: 88.5 },
    actions: [],
    ...overrides,
  } as unknown as WasteInvestigation
}

export function makeThreshold(overrides: Partial<WasteThreshold> = {}): WasteThreshold {
  return {
    id: 1,
    city_id: 1,
    detector_key: "overtime_hours",
    detector_name: "Overtime Hours Threshold",
    category: "payroll",
    field_label: "Max weekly OT hours",
    current_value: 40,
    default_value: 40,
    min_value: 0,
    max_value: 100,
    ...overrides,
  } as WasteThreshold
}

export function makeEntityScore(overrides: Partial<WasteEntityScore> = {}): WasteEntityScore {
  return {
    id: "es-1",
    city_id: 1,
    entity_name: "Acme Corp",
    entity_type: "vendor",
    composite_score: 75,
    severity_tier: "high",
    signal_count: 5,
    top_detector: "duplicate_payments",
    last_scored_at: "2026-02-01T00:00:00Z",
    score_delta: 3.2,
    signals: [
      { detector_key: "duplicate_payments", contribution: 40 },
      { detector_key: "threshold_avoidance", contribution: 35 },
    ],
    ...overrides,
  } as unknown as WasteEntityScore
}
