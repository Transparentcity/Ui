import { describe, it, expect } from "vitest";
import {
  adaptSeymour,
  adaptReportDetail,
  adaptDetector,
  adaptFinding,
} from "./adapters";
import type {
  WasteAdminSeymourFeed,
  WasteAdminReportDetail,
  WasteAdminDetectorRow,
  WasteAdminFindingRow,
} from "@/lib/api/wasteAdmin";

describe("adaptSeymour — never throws on a partial/malformed feed", () => {
  it("handles missing cluster/suggestion arrays", () => {
    const feed = { read_of_the_day: null } as unknown as WasteAdminSeymourFeed;
    const out = adaptSeymour(feed);
    expect(out.clusters).toEqual([]);
    expect(out.suggested).toEqual([]);
    expect(out.todaysRead).toBe("");
  });

  it("handles a cluster with no finding_ids", () => {
    const feed = {
      read_of_the_day: "x",
      clusters: [{ id: "c1", title: "Acme", finding_ids: undefined, department: "DPW" }],
      suggested_investigations: [],
    } as unknown as WasteAdminSeymourFeed;
    const out = adaptSeymour(feed);
    expect(out.clusters[0].findings).toBe(0);
    expect(out.clusters[0].entity).toBe("Acme");
  });
});

describe("adaptReportDetail — never throws when findings is missing", () => {
  it("defaults findings to an empty detector set", () => {
    const r = {
      slug: "proc-q2",
      title: "Procurement Q2",
      period: "Q2",
      findings_count: 0,
      estimated_exposure: null,
      materiality: null,
      updated_at: null,
      status: "draft",
    } as unknown as WasteAdminReportDetail;
    const out = adaptReportDetail(r);
    expect(out.detectors).toEqual([]);
  });
});

describe("adaptDetector — historical only when a real anchor exists", () => {
  const base = {
    id: "vendor_d9_ghost",
    name: "Ghost vendor",
    severity: "high",
    category: "vendor",
  } as unknown as WasteAdminDetectorRow;

  it("returns empty historical when there is no anchor markdown", () => {
    const d = adaptDetector({ ...base, historical_anchor_md: null } as WasteAdminDetectorRow);
    expect(d.historical.summary).toBe("");
  });

  it("populates historical when anchor markdown is present", () => {
    const d = adaptDetector({
      ...base,
      historical_anchor_md: "Nuru / AzulWorks (2018)\nMailbox vendor billed $1.4M.",
      standards_basis: "GAO Yellow Book",
    } as WasteAdminDetectorRow);
    expect(d.historical.summary).toContain("AzulWorks");
    expect(d.historical.case).toBe("Nuru / AzulWorks (2018)");
  });
});

describe("adaptFinding — sanitizes stringified nulls and dedupes", () => {
  const base = {
    id: 1,
    finding_id: "F-1",
    detector_key: "vendor_d9_ghost",
    detector_name: "Ghost vendor",
    severity: "high",
    finding_status: "open",
  } as unknown as WasteAdminFindingRow;

  it('drops literal "null" entity/department/subcategory', () => {
    const f = adaptFinding({
      ...base,
      entity_name: "null",
      subcategory: "null",
      department: "null",
      headline: "Ghost vendor flagged",
      description: "Ghost vendor flagged",
    } as WasteAdminFindingRow);
    expect(f.subject).not.toContain("null");
    expect(f.department).toBe("—");
  });

  it("suppresses detail when it duplicates the headline", () => {
    const f = adaptFinding({
      ...base,
      entity_name: "Acme Corp",
      headline: "Same text",
      description: "Same text",
    } as WasteAdminFindingRow);
    expect(f.detail).toBe("");
    expect(f.subject).toContain("Acme Corp");
  });
});

describe("adaptFinding — plain-English narrator (admin/waste port)", () => {
  it("rewrites a vague backend headline into a tuned one + adds a why-line", () => {
    const f = adaptFinding({
      id: 1,
      finding_id: "F-1",
      detector_key: "payroll_d6_hours",
      detector_name: "D6 Hours Feasibility (Hard Cap)",
      entity_name: "Sheriff",
      headline: "overtime payment distribution is statistically unusual",
      estimated_dollar_impact: 456000,
      severity: "critical",
      finding_status: "open",
    } as unknown as WasteAdminFindingRow);
    expect(f.headline.toLowerCase()).toContain("physically possible");
    expect(f.headline).toContain("Sheriff");
    expect((f.why ?? "").toLowerCase()).toContain("physically impossible");
  });

  it("falls back to the backend headline for an uncovered detector_key", () => {
    const f = adaptFinding({
      id: 2,
      finding_id: "F-2",
      detector_key: "some_future_detector",
      entity_name: "Dept X",
      headline: "A perfectly good backend headline",
      severity: "low",
      finding_status: "open",
    } as unknown as WasteAdminFindingRow);
    expect(f.headline).toBe("A perfectly good backend headline");
    expect(f.why ?? "").toBe("");
  });

  it("preserves raw fields needed for source drill-through", () => {
    const f = adaptFinding({
      id: 4,
      finding_id: "F-4",
      detector_key: "vendor_d19_sole_source",
      detector_name: "D19 Sole Source",
      category: "contracts",
      subcategory: "Sole Source Abuse",
      entity_name: "Color Health",
      estimated_dollar_impact: 84000000,
      severity: "high",
      finding_status: "open",
    } as unknown as WasteAdminFindingRow);
    expect(f.category).toBe("contracts");
    expect(f.subcategory).toBe("Sole Source Abuse");
    expect(f.entity).toBe("Color Health");
    expect(f.tool).toBe("D19 Sole Source");
    expect(f.amountValue).toBe(84000000);
  });

  it("strips internal detector codes from the rendered detail", () => {
    const f = adaptFinding({
      id: 3,
      finding_id: "F-3",
      detector_key: "vendor_d19_sole_source",
      entity_name: "Color Health",
      headline: "No-bid award",
      description: "Awarded without competition (D19, D23)",
      severity: "high",
      finding_status: "open",
    } as unknown as WasteAdminFindingRow);
    expect(f.detail).not.toContain("(D19, D23)");
  });
});
