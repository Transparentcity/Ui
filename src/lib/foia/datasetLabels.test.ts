import { describe, it, expect } from "vitest"
import { datasetLabel } from "./datasetLabels"

describe("datasetLabel", () => {
  it("returns known label for police_incidents", () => {
    expect(datasetLabel("police_incidents")).toBe("Police Incidents")
  })

  it("returns known label for use_of_force", () => {
    expect(datasetLabel("use_of_force")).toBe("Use of Force")
  })

  it("returns known label for 911_calls", () => {
    expect(datasetLabel("911_calls")).toBe("911 Calls")
  })

  it("returns known label for all mapped types", () => {
    expect(datasetLabel("officer_complaints")).toBe("Officer Complaints")
    expect(datasetLabel("arrest_records")).toBe("Arrest Records")
    expect(datasetLabel("budget_expenditures")).toBe("Budget Expenditures")
    expect(datasetLabel("building_permits")).toBe("Building Permits")
    expect(datasetLabel("traffic_stops")).toBe("Traffic Stops")
    expect(datasetLabel("jail_bookings")).toBe("Jail Bookings")
    expect(datasetLabel("court_records")).toBe("Court Records")
  })

  it("converts unknown snake_case to Title Case", () => {
    expect(datasetLabel("fire_department_calls")).toBe("Fire Department Calls")
  })

  it("converts single word to capitalized", () => {
    expect(datasetLabel("permits")).toBe("Permits")
  })

  it('returns "Unknown" for null', () => {
    expect(datasetLabel(null)).toBe("Unknown")
  })

  it('returns "Unknown" for undefined', () => {
    expect(datasetLabel(undefined)).toBe("Unknown")
  })

  it('returns "Unknown" for empty string', () => {
    expect(datasetLabel("")).toBe("Unknown")
  })
})
