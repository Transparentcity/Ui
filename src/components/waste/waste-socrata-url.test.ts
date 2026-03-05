import { describe, it, expect } from "vitest"
import { buildSocrataDetailsUrl, isOnRoadmap } from "./waste-finding-card"
import { makeFinding } from "./test-utils"

// ── isOnRoadmap ─────────────────────────────────────────────────────────────

describe("isOnRoadmap", () => {
  it("returns true when tool contains '(On Roadmap)'", () => {
    expect(isOnRoadmap(makeFinding({ tool: "Address Clustering (On Roadmap)" }))).toBe(true)
  })

  it("returns true when subcategory contains '(On Roadmap)'", () => {
    expect(isOnRoadmap(makeFinding({ subcategory: "Ghost Vendor (On Roadmap)" }))).toBe(true)
  })

  it("returns true when description contains 'On Roadmap:'", () => {
    expect(isOnRoadmap(makeFinding({ description: "On Roadmap: This detector is planned for Q2." }))).toBe(true)
  })

  it("returns true for confirmed category with roadmap detector name", () => {
    expect(
      isOnRoadmap(
        makeFinding({
          category: "confirmed",
          id: "CONF-1",
          subcategory: "Waste - Address Clustering",
        })
      )
    ).toBe(true)
  })

  it("returns true for id starting with CONF- and roadmap detector", () => {
    expect(
      isOnRoadmap(
        makeFinding({
          category: "other",
          id: "CONF-5",
          subcategory: "Test - Fiscal Sponsor Opacity",
        })
      )
    ).toBe(true)
  })

  it("returns false for confirmed category with non-roadmap detector", () => {
    expect(
      isOnRoadmap(
        makeFinding({
          category: "confirmed",
          subcategory: "Waste - Overtime Abuse",
        })
      )
    ).toBe(false)
  })

  it("returns false for a normal finding", () => {
    expect(isOnRoadmap(makeFinding())).toBe(false)
  })
})

// ── buildSocrataDetailsUrl ──────────────────────────────────────────────────

describe("buildSocrataDetailsUrl", () => {
  // ── Payroll ─────────────────────────────────────────────────────────────

  it("returns null for payroll with empty entity", () => {
    expect(buildSocrataDetailsUrl(makeFinding({ entity: "" }))).toBeNull()
  })

  it("builds overtime-sorted URL for Overtime Abuse subcategory", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Overtime Abuse",
      entity: "Fire Department",
    }))!
    expect(url).toContain("88g8-5mnd.json")
    expect(url).toContain(encodeURIComponent("overtime desc"))
    expect(url).toContain(encodeURIComponent("Fire Department"))
  })

  it("builds overtime-sorted URL for Department OT Outlier", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Department OT Outlier",
      entity: "Police Dept",
    }))!
    expect(url).toContain(encodeURIComponent("overtime desc"))
  })

  it("builds overtime-sorted URL for Benford Anomaly", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Benford Anomaly",
      entity: "DPW",
    }))!
    expect(url).toContain(encodeURIComponent("overtime desc"))
  })

  it("builds overtime-sorted URL when tool includes 'Pareto'", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "General Check",
      tool: "Pareto Detector",
      entity: "Fire Department",
    }))!
    expect(url).toContain(encodeURIComponent("overtime desc"))
  })

  it("builds hours-sorted URL for Hours Feasibility", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Hours Feasibility",
      entity: "Parks Dept",
    }))!
    expect(url).toContain(encodeURIComponent("hours desc"))
  })

  it("builds hours-sorted URL for Impossibility Check", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Impossibility Check",
      entity: "Parks Dept",
    }))!
    expect(url).toContain(encodeURIComponent("hours desc"))
  })

  it("builds total_salary-sorted URL for Pension Spiking", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Pension Spiking Alert",
      entity: "Fire Department",
      tool: "Pension Detector",
    }))!
    expect(url).toContain(encodeURIComponent("total_salary desc"))
  })

  it("builds comp-time URL for Comp Time Manipulation", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Comp Time Manipulation",
      entity: "Police Dept",
    }))!
    expect(url).toContain(encodeURIComponent("other_salaries desc"))
    expect(url).toContain(encodeURIComponent("other_salaries / salaries"))
  })

  it("strips parenthetical from entity for payroll department filter", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Payroll",
      subcategory: "Overtime Abuse",
      entity: "Fire Department (SF)",
    }))!
    expect(url).toContain(encodeURIComponent("Fire Department"))
    expect(url).not.toContain(encodeURIComponent("(SF)"))
  })

  // ── Contracts / Vendor ──────────────────────────────────────────────────

  it("builds vendor URL for default contract finding", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "General",
      entity: "Acme Corp",
    }))!
    expect(url).toContain("n9pm-xkyq.json")
    expect(url).toContain(encodeURIComponent("vendor = 'Acme Corp'"))
  })

  it("builds duplicate payments URL with amount filter", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "Duplicate Payments",
      entity: "Acme Corp",
      amount: 50000,
      metricDetail: "3 payments of $50,000 each",
    }))!
    expect(url).toContain(encodeURIComponent("vendor = 'Acme Corp'"))
    expect(url).toContain(encodeURIComponent("vouchers_paid = 50000"))
  })

  it("builds ghost vendor URL", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Vendor",
      subcategory: "Ghost Vendor",
      entity: "Shell LLC",
    }))!
    expect(url).toContain(encodeURIComponent("vendor = 'Shell LLC'"))
  })

  it("builds unregistered vendor URL", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Vendor",
      subcategory: "Unregistered Vendor",
      entity: "Unknown Inc",
    }))!
    expect(url).toContain(encodeURIComponent("vendor = 'Unknown Inc'"))
  })

  it("builds misdirected payment URL with PO and amount", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "Misdirected Payment",
      entity: "PO 12345",
      metricDetail: "paid identical $90,000.00 to 3 vendors",
    }))!
    expect(url).toContain(encodeURIComponent("purchase_order = '12345'"))
    expect(url).toContain(encodeURIComponent("vouchers_paid = 90000.00"))
  })

  it("builds statistical anomaly URL with department filter", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "Statistical Anomaly",
      entity: "Public Works",
    }))!
    expect(url).toContain(encodeURIComponent("department = 'Public Works'"))
  })

  it("builds threshold avoidance URL with range filter", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "Threshold Avoidance",
      entity: "DPW (Limit $10K)",
      metricDetail: "Range $9,000-$9,999",
    }))!
    expect(url).toContain(encodeURIComponent("department = 'DPW'"))
    expect(url).toContain(encodeURIComponent("vouchers_paid >= 9000"))
    expect(url).toContain(encodeURIComponent("vouchers_paid <= 9999"))
  })

  it("builds threshold avoidance URL without range as fallback", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "Threshold Avoidance",
      entity: "DPW (Limit $10K)",
      metricDetail: "suspicious pattern",
    }))!
    expect(url).toContain(encodeURIComponent("department = 'DPW'"))
    expect(url).not.toContain("vouchers_paid >=")
  })

  it("escapes single quotes in vendor name", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Contracts",
      subcategory: "General",
      entity: "O'Brien's Supply",
    }))!
    expect(url).toContain(encodeURIComponent("vendor = 'O''Brien''s Supply'"))
  })

  // ── Infrastructure ────────────────────────────────────────────────────

  it("builds infrastructure cluster URL with coordinates", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Infrastructure",
      subcategory: "Infrastructure Cluster",
      entity: "Mission",
      description: "Cluster of 15 sewer complaints near (37.76, -122.42) in last 90 days.",
    }))!
    expect(url).toContain("vw6y-z8j6.json")
    expect(url).toContain(encodeURIComponent("within_circle(point, 37.76, -122.42, 500)"))
  })

  it("builds infrastructure cluster URL with neighborhood fallback", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Infrastructure",
      subcategory: "Infrastructure Cluster",
      entity: "Mission",
      description: "High concentration of water complaints",
    }))!
    expect(url).toContain(encodeURIComponent("neighborhoods_sffind_boundaries = 'Mission'"))
  })

  it("builds infrastructure cluster URL with keyword filter", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Infrastructure",
      subcategory: "Infrastructure Cluster",
      entity: "Mission",
      description: "sewer issues",
    }))!
    // Should include SOQL LIKE filters for infra keywords
    expect(url).toContain(encodeURIComponent("lower(service_name) like '%sewer%'"))
  })

  it("builds response time deterioration URL", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Infrastructure",
      subcategory: "Response Time Deterioration",
      entity: "DPW",
    }))!
    expect(url).toContain(encodeURIComponent("agency_responsible = 'DPW'"))
  })

  it("builds district equity gap URL", () => {
    const url = buildSocrataDetailsUrl(makeFinding({
      category: "Infrastructure",
      subcategory: "District Equity Gap",
      entity: "District 5",
    }))!
    expect(url).toContain(encodeURIComponent("supervisor_district = '5'"))
  })

  // ── Unknown category ──────────────────────────────────────────────────

  it("returns null for unknown category", () => {
    expect(buildSocrataDetailsUrl(makeFinding({ category: "other" }))).toBeNull()
  })
})
