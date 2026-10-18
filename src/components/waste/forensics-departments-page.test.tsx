import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { ForensicsDepartmentsPage } from "./forensics-departments-page"

vi.mock("./waste-shell", () => ({
  WasteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("./forensics-shell", () => ({
  ForensicsShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("./tc-score-badge", () => ({
  TCScoreBadge: ({ score }: { score: number }) => <span>{score}</span>,
  TCTierBadge: () => <span>tier</span>,
}))
vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({ selectedCityId: 1 }),
}))
const useWasteEntityScores = vi.fn()
vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteEntityScores: (args: unknown) => useWasteEntityScores(args),
}))

const dept = (over: Record<string, unknown> = {}) => ({
  entity_name: "POL Police",
  composite_score: 64.5,
  signal_count: 7,
  top_detector: "infrastructure_d5_budget_variance",
  score_delta: null,
  ...over,
})

describe("ForensicsDepartmentsPage", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows readable detector names, not raw keys", () => {
    useWasteEntityScores.mockReturnValue({ data: { items: [dept()] }, isLoading: false })
    render(<ForensicsDepartmentsPage />)
    expect(screen.getByText("D5 Budget Variance")).toBeInTheDocument()
    expect(screen.queryByText(/infrastructure d5/i)).not.toBeInTheDocument()
  })

  it("hides the Trend column when no department has a score change", () => {
    useWasteEntityScores.mockReturnValue({
      data: { items: [dept(), dept({ entity_name: "MYR Mayor", score_delta: 0 })] },
      isLoading: false,
    })
    render(<ForensicsDepartmentsPage />)
    expect(screen.queryByText("Trend")).not.toBeInTheDocument()
  })

  it("shows the Trend column when any department has a change", () => {
    useWasteEntityScores.mockReturnValue({
      data: { items: [dept({ score_delta: 4.2 }), dept({ entity_name: "MYR Mayor" })] },
      isLoading: false,
    })
    render(<ForensicsDepartmentsPage />)
    expect(screen.getByText("Trend")).toBeInTheDocument()
    expect(screen.getByText("+4")).toBeInTheDocument()
  })
})
