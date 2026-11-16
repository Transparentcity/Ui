import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  describeExemplar,
  describeExemplars,
  getExemplars,
} from "./waste-exemplars"
import { ExemplarList } from "./waste-exemplar-list"

describe("getExemplars", () => {
  it("reads live runs (caseExemplars) and persisted runs (evidence)", () => {
    expect(getExemplars({ caseExemplars: [{ employee: "A" }] })).toHaveLength(1)
    expect(
      getExemplars({ evidence: { case_exemplars: [{ employee: "B" }, { employee: "C" }] } }),
    ).toHaveLength(2)
  })

  it("is empty when there are none, or the shape is wrong", () => {
    expect(getExemplars({})).toEqual([])
    expect(getExemplars({ evidence: { case_exemplars: "nope" } })).toEqual([])
    expect(getExemplars({ caseExemplars: [null as never, 3 as never] })).toEqual([])
  })
})

describe("describeExemplar", () => {
  it("describes a department-level overtime exemplar", () => {
    const d = describeExemplar({
      employee: "Jane Roe",
      base_salary: 254116.88,
      overtime: 277643.7,
      implied_extra_hours_per_week: 29.1,
    })
    expect(d.who).toBe("Jane Roe")
    expect(d.facts[0]).toContain("$277,644 overtime on $254,117 base pay")
    expect(d.facts[0]).toContain("about 29 extra hours a week")
  })

  it("describes a title-peer outlier by year, with the contrast", () => {
    const d = describeExemplar({
      employee: "P0",
      fiscal_year: 2026,
      base_salary: 195171.8,
      overtime: 272190.04,
      next_highest_overtime: 60137,
      multiple_of_next: 4.5,
      people_in_title: 17,
    })
    expect(d.facts[0]).toMatch(/^FY2026: /)
    expect(d.facts[0]).toContain("4.5× the next-highest of 17 in the title")
  })

  it("says so when no one else in the title was paid overtime", () => {
    const d = describeExemplar({
      employee: "P0",
      overtime: 141808,
      next_highest_overtime: 0,
      multiple_of_next: 141807.9,
      people_in_title: 36,
    })
    expect(d.facts[0]).toContain("no one else in the title of 36")
    expect(d.facts[0]).not.toContain("141807")
  })

  it("describes a pay spike and a departure", () => {
    const d = describeExemplar({
      employee: "X",
      spike_pct: 212.4,
      current_total_comp: 410000,
      departed_next_year: true,
    })
    expect(d.facts[0]).toContain("pay up 212% on the prior average")
    expect(d.facts[0]).toContain("left the next year")
  })

  it("describes a member of an overtime cluster", () => {
    const d = describeExemplar({
      employee: "P0",
      fiscal_year: 2025,
      overtime: 161333,
      base_salary: 170000,
      people_in_title: 5,
      share_of_title_overtime: 1,
    })
    expect(d.facts[0]).toContain("the group held 100% of the title's overtime (5 people)")
  })

  it("describes an hours exemplar with the job and the paid week", () => {
    const d = describeExemplar({
      employee: "P1",
      job: "Counselor",
      paid_hours: 5600,
      weekly_hours: 107.7,
      base_salary: 90000,
      overtime: 80000,
    })
    expect(d.facts[0]).toMatch(/^Counselor: /)
    expect(d.facts[0]).toContain("5,600 paid hours (about 108 a week)")
    expect(d.facts[0]).toContain("$80,000 overtime on $90,000 base pay")
  })

  it("never throws on an empty row", () => {
    expect(describeExemplar({}).who).toBe("Unnamed record")
  })
})

describe("describeExemplars", () => {
  it("drops the job title when every row shares it", () => {
    const same = describeExemplars([
      { employee: "P0", job: "Mech Supt", fiscal_year: 2025, overtime: 1 },
      { employee: "P1", job: "Mech Supt", fiscal_year: 2025, overtime: 2 },
    ])
    expect(same[0].facts[0]).toBe("FY2025: $1 overtime")
    const mixed = describeExemplars([
      { employee: "P0", job: "Mech Supt", fiscal_year: 2025, overtime: 1 },
      { employee: "P1", job: "Clerk", fiscal_year: 2025, overtime: 2 },
    ])
    expect(mixed[0].facts[0]).toBe("Mech Supt, FY2025: $1 overtime")
  })

  it("merges several years for one person and caps the list", () => {
    const rows = [
      { employee: "P0", fiscal_year: 2025, overtime: 100 },
      { employee: "P0", fiscal_year: 2026, overtime: 200 },
      ...Array.from({ length: 8 }, (_, i) => ({ employee: `Q${i}`, overtime: 1 })),
    ]
    const out = describeExemplars(rows, 5)
    expect(out).toHaveLength(5)
    expect(out[0].who).toBe("P0")
    expect(out[0].facts).toHaveLength(2)
  })
})

describe("ExemplarList", () => {
  it("renders the records behind a finding", () => {
    render(
      <ExemplarList
        finding={{
          caseExemplars: [{ employee: "Jane Roe", overtime: 128541, base_salary: 169762 }],
        }}
      />,
    )
    expect(screen.getByTestId("exemplars")).toHaveTextContent("In the public payroll record")
    expect(screen.getByTestId("exemplar")).toHaveTextContent("Jane Roe")
  })

  it("renders nothing when a finding carries none", () => {
    const { container } = render(<ExemplarList finding={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
