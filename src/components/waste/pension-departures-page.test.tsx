import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect } from "vitest"

let mockCity = { selectedCityId: 1, selectedCityName: "San Francisco" }

vi.mock("@/components/waste/WasteCityContext", () => ({
  useWasteCity: () => mockCity,
}))

import { PensionDeparturesPage } from "./pension-departures-page"

describe("PensionDeparturesPage", () => {
  it("renders the controls for a supported city (SF)", () => {
    mockCity = { selectedCityId: 1, selectedCityName: "San Francisco" }
    render(<PensionDeparturesPage />)
    expect(screen.getByText("Pension-spiking departures")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /run report/i })).toBeInTheDocument()
    // Empty-state prompt (no saved run yet)
    expect(screen.getByText(/no saved run yet/i)).toBeInTheDocument()
  })

  it("shows an unavailable notice for an unsupported city (Chicago)", () => {
    mockCity = { selectedCityId: 3, selectedCityName: "Chicago" }
    render(<PensionDeparturesPage />)
    expect(screen.getByText(/not available for Chicago/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /run report/i })).not.toBeInTheDocument()
  })
})
