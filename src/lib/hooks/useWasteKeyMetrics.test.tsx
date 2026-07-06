import { renderHook } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import {
  useWasteKeyMetrics,
  formatMetricValue,
} from "./useWasteKeyMetrics"

const useMetrics = vi.fn()
const useBatchComparisons = vi.fn()
vi.mock("@/lib/hooks/useMetrics", () => ({
  useMetrics: (opts: unknown, q: unknown) => useMetrics(opts, q),
  useBatchComparisons: (req: unknown) => useBatchComparisons(req),
}))

const METRICS = [
  { id: 634, metric_name: "Overtime Share", metric_key: "ot-share", category: "waste", subcategory: "payroll", is_active: true, last_execution_status: "completed" },
  { id: 706, metric_name: "Vendor Concentration", metric_key: "vendor-hhi", category: "waste", subcategory: "procurement", is_active: true, last_execution_status: "completed" },
  { id: 720, metric_name: "PO Box Vendor %", metric_key: "po-box", category: "waste", subcategory: "procurement", is_active: true, last_execution_status: "failed" },
  { id: 800, metric_name: "Findings Readout", metric_key: "readout", category: "waste", subcategory: "readout", is_active: true, last_execution_status: "completed" },
  { id: 810, metric_name: "311 Response Time", metric_key: "resp", category: "waste", subcategory: "service_delivery", is_active: true, last_execution_status: "completed" },
]

describe("useWasteKeyMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMetrics.mockReturnValue({ data: METRICS, isLoading: false })
    useBatchComparisons.mockReturnValue({
      data: {
        634: { ytd: { current_period_value: 11.8, comparison_period_value: 10.6 } },
        706: { ytd: { current_period_value: 0.42, comparison_period_value: 0.42 } },
      },
      isLoading: false,
    })
  })

  it("groups metrics onto module categories and excludes readout", () => {
    const { result } = renderHook(() => useWasteKeyMetrics(57260))
    expect(Object.keys(result.current.byCategory).sort()).toEqual([
      "contracts",
      "infrastructure",
      "payroll",
    ])
    expect(
      result.current.byCategory.contracts.map((m) => m.id).sort(),
    ).toEqual([706, 720])
    // readout metrics never appear
    const all = Object.values(result.current.byCategory).flat()
    expect(all.find((m) => m.id === 800)).toBeUndefined()
  })

  it("computes YTD values and trends, flat under 0.05%", () => {
    const { result } = renderHook(() => useWasteKeyMetrics(57260))
    const ot = result.current.byCategory.payroll[0]
    expect(ot.value).toBe(11.8)
    expect(ot.trend?.dir).toBe("up")
    const hhi = result.current.byCategory.contracts.find((m) => m.id === 706)!
    expect(hhi.trend?.dir).toBe("flat")
  })

  it("sorts valued metrics ahead of unvalued ones", () => {
    const { result } = renderHook(() => useWasteKeyMetrics(57260))
    expect(result.current.byCategory.contracts[0].id).toBe(706)
    expect(result.current.byCategory.contracts[1].status).toBe("failed")
  })

  it("returns nothing while the city is unresolved", () => {
    useMetrics.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useWasteKeyMetrics(null))
    expect(result.current.byCategory).toEqual({})
  })
})

describe("formatMetricValue", () => {
  it("formats compactly and handles nulls", () => {
    expect(formatMetricValue(null)).toBe("—")
    expect(formatMetricValue(1_250_000)).toBe("1.3M")
    expect(formatMetricValue(0.427)).toBe("0.427")
    expect(formatMetricValue(11.84)).toBe("11.8")
  })
})
