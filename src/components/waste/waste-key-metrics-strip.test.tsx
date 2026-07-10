import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteKeyMetricsStrip } from "./waste-key-metrics-strip"

vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({
    selectedCityId: 57260,
    selectedCitySlug: "san-francisco",
  }),
}))

/* eslint-disable @typescript-eslint/no-explicit-any */
const modalProps = vi.fn()
vi.mock("@/components/MetricChartsModal", () => ({
  default: (props: any) => {
    modalProps(props)
    return props.isOpen ? <div data-testid="charts-modal">{props.metricId}</div> : null
  },
}))
/* eslint-enable @typescript-eslint/no-explicit-any */

const useWasteKeyMetrics = vi.fn()
vi.mock("@/lib/hooks/useWasteKeyMetrics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/hooks/useWasteKeyMetrics")>()
  return {
    ...orig,
    useWasteKeyMetrics: (cityId: number | null) => useWasteKeyMetrics(cityId),
  }
})

const OT_METRIC = {
  id: 634,
  metricKey: "ot-share",
  name: "Overtime Share of Regular Pay",
  subcategory: "payroll",
  value: 11.8,
  trend: { pct: 1.2, dir: "up" as const },
  status: "completed" as const,
}

describe("WasteKeyMetricsStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWasteKeyMetrics.mockReturnValue({
      byCategory: { payroll: [OT_METRIC] },
      isLoading: false,
      valuesLoading: false,
    })
  })

  it("renders value chips with trend for the category", () => {
    render(<WasteKeyMetricsStrip category="payroll" />)
    const strip = screen.getByTestId("waste-key-metrics")
    expect(strip.textContent).toContain("Overtime Share of Regular Pay")
    expect(strip.textContent).toContain("12%")
    expect(strip.textContent).toContain("+1.2%")
  })

  it("renders nothing when the category has no metrics", () => {
    render(<WasteKeyMetricsStrip category="confirmed" />)
    expect(screen.queryByTestId("waste-key-metrics")).not.toBeInTheDocument()
  })

  it("labels unvalued metrics instead of showing blanks", () => {
    useWasteKeyMetrics.mockReturnValue({
      byCategory: {
        payroll: [{ ...OT_METRIC, value: null, trend: null, status: "never" }],
      },
      isLoading: false,
      valuesLoading: false,
    })
    render(<WasteKeyMetricsStrip category="payroll" />)
    expect(screen.getByTestId("waste-key-metrics").textContent).toContain(
      "not run yet",
    )
  })

  it("opens the chart modal with the metric and city slug on click", () => {
    render(<WasteKeyMetricsStrip category="payroll" />)
    fireEvent.click(screen.getByText("Overtime Share of Regular Pay"))
    expect(screen.getByTestId("charts-modal")).toBeInTheDocument()
    expect(modalProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metricId: 634,
        metricKey: "ot-share",
        citySlug: "san-francisco",
        isOpen: true,
      }),
    )
  })
})
