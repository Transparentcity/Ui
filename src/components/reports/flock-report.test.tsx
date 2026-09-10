import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { FlockReport } from "./flock-report"

describe("FlockReport", () => {
  it("renders the report with its key sections and figures", () => {
    render(<FlockReport />)
    expect(screen.getByTestId("flock-report")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: /flock by the numbers/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /key findings/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /the off-switch/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /the governance ledger/i })).toBeInTheDocument()
    // Pinned numbers reach the page.
    expect(screen.getAllByText(/\$5,191,350/).length).toBeGreaterThan(0)
    // Generated figures are inlined.
    expect(document.querySelectorAll("svg[role='img']").length).toBeGreaterThanOrEqual(15)
  })

  it("contains no em or en dashes in its prose", () => {
    const { container } = render(<FlockReport />)
    expect(container.textContent).not.toMatch(/[—–]/)
  })
})
