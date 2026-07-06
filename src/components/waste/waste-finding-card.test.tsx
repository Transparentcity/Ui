import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { WasteFindingCard } from "./waste-finding-card"
import { makeFinding } from "./test-utils"

describe("WasteFindingCard", () => {
  const onToggle = vi.fn()
  const onAskSeymour = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders a plain-English headline in the collapsed state", () => {
    const finding = makeFinding({ metric: "$2.3M", metricDetail: "above peer average" })
    render(<WasteFindingCard finding={finding} isExpanded={false} onToggle={onToggle} />)
    // The collapsed row shows one derived headline; for an unmapped tool it
    // falls back to "<entity> — <metric> <metricDetail>".
    // "Fire Department" also appears in the entity pill, so match the headline
    // by its unique metric-detail fragment.
    expect(screen.getAllByText(/Fire Department/).length).toBeGreaterThan(0)
    expect(screen.getByText(/above peer average/)).toBeInTheDocument()
  })

  it("renders severity badge with correct label", () => {
    render(<WasteFindingCard finding={makeFinding({ severity: "critical" })} isExpanded={false} onToggle={onToggle} />)
    expect(screen.getByText("CRIT")).toBeInTheDocument()
  })

  it("renders NEW badge when is_new is true", () => {
    render(<WasteFindingCard finding={makeFinding({ is_new: true })} isExpanded={false} onToggle={onToggle} />)
    expect(screen.getByText("New")).toBeInTheDocument()
  })

  // ── Expand / Collapse ──────────────────────────────────────────────────────

  it("calls onToggle when the card is clicked", () => {
    render(<WasteFindingCard finding={makeFinding()} isExpanded={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByText(/above peer average/))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it("shows description when expanded", () => {
    const finding = makeFinding({ description: "Excessive overtime detected in Fire Department." })
    render(<WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />)
    expect(screen.getByText(/Excessive overtime detected/)).toBeInTheDocument()
  })

  it("does not show description when collapsed", () => {
    render(<WasteFindingCard finding={makeFinding({ description: "Secret text" })} isExpanded={false} onToggle={onToggle} />)
    expect(screen.queryByText("Secret text")).not.toBeInTheDocument()
  })

  // ── Show details button (loading + error) ─────────────────────────────────

  it("shows 'Show source records' button for payroll findings when expanded", () => {
    const finding = makeFinding({ category: "Payroll", entity: "Fire Department" })
    render(<WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />)
    expect(screen.getByText("Show source records")).toBeInTheDocument()
  })

  it("shows loading indicator when details are being fetched", async () => {
    // Mock fetch to be slow
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {}) // never resolves
    )
    const finding = makeFinding({ category: "Payroll", entity: "Fire Department" })
    render(<WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />)

    fireEvent.click(screen.getByText("Show source records"))
    await waitFor(() => {
      expect(screen.getByText("Loading details...")).toBeInTheDocument()
    })
  })

  it("shows error message when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"))
    const finding = makeFinding({ category: "Payroll", entity: "Fire Department" })
    render(<WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />)

    fireEvent.click(screen.getByText("Show source records"))
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument()
    })
  })

  it("shows detail table when fetch succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { year: "2024", employee_identifier: "EMP001", job: "Firefighter", hours: "3200", salaries: "80000", overtime: "45000", total_salary: "125000" },
      ],
    } as unknown as Response)
    const finding = makeFinding({ category: "Payroll", entity: "Fire Department" })
    render(<WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />)

    fireEvent.click(screen.getByText("Show source records"))
    await waitFor(() => {
      expect(screen.getByText("EMP001")).toBeInTheDocument()
    })
  })

  // ── Ask Seymour ────────────────────────────────────────────────────────────

  it("calls onAskSeymour with the finding when 'Ask Seymour' is clicked", () => {
    const finding = makeFinding()
    render(
      <WasteFindingCard
        finding={finding}
        isExpanded={true}
        onToggle={onToggle}
        onAskSeymour={onAskSeymour}
      />
    )
    fireEvent.click(screen.getByText("Ask Seymour"))
    expect(onAskSeymour).toHaveBeenCalledWith(finding)
  })

  it("does not render Ask Seymour button when collapsed", () => {
    render(
      <WasteFindingCard
        finding={makeFinding()}
        isExpanded={false}
        onToggle={onToggle}
        onAskSeymour={onAskSeymour}
      />
    )
    expect(screen.queryByText("Ask Seymour")).not.toBeInTheDocument()
  })

  // ── Keyboard & Accessibility ──────────────────────────────────────────────

  it("toggles when Enter key is pressed on the card", () => {
    const toggle = vi.fn()
    render(<WasteFindingCard finding={makeFinding()} isExpanded={false} onToggle={toggle} />)
    const card = screen.getByRole("button", { expanded: false })
    fireEvent.keyDown(card, { key: "Enter" })
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it("toggles when Space key is pressed on the card", () => {
    const toggle = vi.fn()
    render(<WasteFindingCard finding={makeFinding()} isExpanded={false} onToggle={toggle} />)
    const card = screen.getByRole("button", { expanded: false })
    fireEvent.keyDown(card, { key: " " })
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it("sets aria-expanded true when expanded and false when collapsed", () => {
    const finding = makeFinding()

    const { container, rerender } = render(
      <WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />
    )
    // The outer card div is the first child of the container and has tabIndex=0
    const card = container.firstElementChild as HTMLElement
    expect(card).toHaveAttribute("aria-expanded", "true")

    rerender(<WasteFindingCard finding={finding} isExpanded={false} onToggle={onToggle} />)
    expect(card).toHaveAttribute("aria-expanded", "false")
  })

  // ── Retry on details error ────────────────────────────────────────────────

  it("shows a Retry button when details fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"))
    const finding = makeFinding({ category: "Payroll", entity: "Fire Department" })
    render(<WasteFindingCard finding={finding} isExpanded={true} onToggle={onToggle} />)

    fireEvent.click(screen.getByText("Show source records"))
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument()
    })
  })

  // ── Entity visibility ─────────────────────────────────────────────────────

  it("renders entity tag visibly (not hidden) on all screen sizes", () => {
    const finding = makeFinding({ entity: "Fire Department" })
    render(<WasteFindingCard finding={finding} isExpanded={false} onToggle={onToggle} />)
    const entityEl = screen.getByText("Fire Department")
    expect(entityEl).toBeInTheDocument()
    expect(entityEl).toBeVisible()
  })
})
