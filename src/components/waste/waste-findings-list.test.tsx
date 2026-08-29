import { render, screen, fireEvent } from "@testing-library/react"
import { vi } from "vitest"
import { WasteFindingsList } from "@/components/waste/waste-findings-list"
import { makeFinding } from "@/components/waste/test-utils"
import type { WasteFinding } from "@/lib/apiClient"

/** Two findings whose evidence order is deterministic: "strong" (corroborated,
 *  high confidence) must outrank "weak" (bigger dollars, low confidence). */
function makePair(): WasteFinding[] {
  return [
    makeFinding({
      id: "weak",
      db_id: 1,
      amount: 5_000_000,
      confidence_score: 0.1,
      corroboration_count: 0,
    } as Partial<WasteFinding>),
    makeFinding({
      id: "strong",
      db_id: 2,
      amount: 500_000,
      confidence_score: 0.9,
      corroboration_count: 3,
    } as Partial<WasteFinding>),
  ]
}

describe("WasteFindingsList evidence sort", () => {
  it("orders by evidence score, not raw amount", () => {
    render(<WasteFindingsList findings={makePair()} sortMode="evidence" />)
    const rows = document.querySelectorAll("[data-finding-row]")
    expect(Array.from(rows).map((r) => r.getAttribute("data-finding-row"))).toEqual([
      "strong",
      "weak",
    ])
  })

  it("sinks findings the auditor already dismissed", () => {
    const findings = makePair()
    ;(findings[1] as unknown as Record<string, unknown>)["latest_disposition"] = {
      disposition: "false_positive",
    }
    render(<WasteFindingsList findings={findings} sortMode="evidence" />)
    const rows = document.querySelectorAll("[data-finding-row]")
    expect(Array.from(rows).map((r) => r.getAttribute("data-finding-row"))).toEqual([
      "weak",
      "strong",
    ])
  })

  it("shows the keyboard legend only when triage is possible", () => {
    const { rerender } = render(
      <WasteFindingsList findings={makePair()} sortMode="evidence" />,
    )
    expect(screen.queryByTestId("keyboard-triage-legend")).not.toBeInTheDocument()

    rerender(
      <WasteFindingsList
        findings={makePair()}
        sortMode="evidence"
        onDispose={vi.fn()}
      />,
    )
    expect(screen.getByTestId("keyboard-triage-legend")).toBeInTheDocument()
  })
})

describe("WasteFindingsList keyboard triage", () => {
  it("j moves the highlight and f flags the highlighted finding", () => {
    const onDispose = vi.fn().mockResolvedValue(undefined)
    render(
      <WasteFindingsList
        findings={makePair()}
        sortMode="evidence"
        onDispose={onDispose}
      />,
    )
    fireEvent.keyDown(window, { key: "j" }) // highlight "strong" (rank 1)
    fireEvent.keyDown(window, { key: "f" })
    expect(onDispose).toHaveBeenCalledTimes(1)
    expect(onDispose.mock.calls[0][0].id).toBe("strong")
    expect(onDispose.mock.calls[0][1]).toBe("under_investigation")
  })

  it("number keys dismiss with the structured reason note", () => {
    const onDispose = vi.fn().mockResolvedValue(undefined)
    render(
      <WasteFindingsList
        findings={makePair()}
        sortMode="evidence"
        onDispose={onDispose}
      />,
    )
    fireEvent.keyDown(window, { key: "j" })
    fireEvent.keyDown(window, { key: "2" }) // "Threshold too tight"
    expect(onDispose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "strong" }),
      "false_positive",
      expect.stringContaining("threshold too tight"),
    )
  })

  it("ignores keys while typing in an input", () => {
    const onDispose = vi.fn().mockResolvedValue(undefined)
    render(
      <div>
        <input aria-label="notes" />
        <WasteFindingsList
          findings={makePair()}
          sortMode="evidence"
          onDispose={onDispose}
        />
      </div>,
    )
    fireEvent.keyDown(window, { key: "j" })
    fireEvent.keyDown(screen.getByLabelText("notes"), { key: "f" })
    expect(onDispose).not.toHaveBeenCalled()
  })

  it("does not re-triage a finding already handled this session", () => {
    const onDispose = vi.fn().mockResolvedValue(undefined)
    render(
      <WasteFindingsList
        findings={makePair()}
        sortMode="evidence"
        onDispose={onDispose}
      />,
    )
    fireEvent.keyDown(window, { key: "j" })
    fireEvent.keyDown(window, { key: "f" })
    // Highlight auto-advanced to "weak"; move back up to "strong" and retry.
    fireEvent.keyDown(window, { key: "k" })
    fireEvent.keyDown(window, { key: "f" })
    expect(onDispose).toHaveBeenCalledTimes(1)
  })
})
