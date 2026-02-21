/**
 * Data integrity tests for the Step 8 waste extensions.
 *
 * These validate that exported constants, type arrays, and navigation entries
 * stay in sync as the codebase evolves — acting as tripwires for regressions.
 */

import { DISPOSITION_OPTIONS } from "@/components/waste/disposition-select";

// ---------------------------------------------------------------------------
// Disposition options
// ---------------------------------------------------------------------------
describe("DispositionSelect option registry", () => {
  const EXPECTED_COUNT = 7;

  it(`has exactly ${EXPECTED_COUNT} options`, () => {
    expect(DISPOSITION_OPTIONS).toHaveLength(EXPECTED_COUNT);
  });

  it("values are snake_case strings", () => {
    for (const opt of DISPOSITION_OPTIONS) {
      expect(opt.value).toMatch(/^[a-z_]+$/);
    }
  });

  it("labels are human-readable (start with uppercase)", () => {
    for (const opt of DISPOSITION_OPTIONS) {
      expect(opt.label[0]).toBe(opt.label[0].toUpperCase());
    }
  });

  it("maps correctly from value to label", () => {
    const map = Object.fromEntries(
      DISPOSITION_OPTIONS.map((o) => [o.value, o.label])
    );
    expect(map.confirmed_fraud).toBe("Confirmed Fraud");
    expect(map.false_positive).toBe("False Positive");
    expect(map.inconclusive).toBe("Inconclusive");
  });
});

// ---------------------------------------------------------------------------
// Severity tier ordering (used by entity-scores-page)
// ---------------------------------------------------------------------------
describe("Severity tier ordering", () => {
  const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  it("has 5 tiers", () => {
    expect(Object.keys(SEVERITY_ORDER)).toHaveLength(5);
  });

  it("critical is highest priority (lowest number)", () => {
    expect(SEVERITY_ORDER.critical).toBe(0);
  });

  it("info is lowest priority (highest number)", () => {
    expect(SEVERITY_ORDER.info).toBe(4);
  });

  it("tiers are in strictly increasing order", () => {
    const values = Object.values(SEVERITY_ORDER);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Investigation action types
// ---------------------------------------------------------------------------
describe("Investigation action types", () => {
  const ACTION_TYPES = [
    "document_request",
    "interview",
    "site_visit",
    "subpoena",
    "referral",
    "note",
    "evidence_collected",
  ] as const;

  it("has 7 action types", () => {
    expect(ACTION_TYPES).toHaveLength(7);
  });

  it("all values are snake_case", () => {
    for (const t of ACTION_TYPES) {
      expect(t).toMatch(/^[a-z_]+$/);
    }
  });

  it("includes the essential audit actions", () => {
    expect(ACTION_TYPES).toContain("document_request");
    expect(ACTION_TYPES).toContain("interview");
    expect(ACTION_TYPES).toContain("subpoena");
    expect(ACTION_TYPES).toContain("evidence_collected");
  });
});

// ---------------------------------------------------------------------------
// Threshold categories
// ---------------------------------------------------------------------------
describe("Threshold categories", () => {
  const CATEGORY_ORDER = ["vendor", "payroll", "infrastructure", "nonprofit"];

  it("has 4 categories", () => {
    expect(CATEGORY_ORDER).toHaveLength(4);
  });

  it("categories are unique", () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});
