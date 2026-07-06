import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { WasteReportStatusChip } from "./waste-report-status-chip"

describe("WasteReportStatusChip", () => {
  it.each([
    ["draft", "Draft", "amber"],
    ["under-review", "Under review", "blue"],
    ["final", "Final", "emerald"],
  ])("renders %s with its label and tint", (status, label, tint) => {
    render(<WasteReportStatusChip status={status} />)
    const chip = screen.getByText(label)
    expect(chip.className).toContain(tint)
  })

  it("falls back to Draft styling for unknown statuses", () => {
    render(<WasteReportStatusChip status="archived" />)
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })
})
