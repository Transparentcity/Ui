import { render, screen } from "@testing-library/react";

import {
  DispositionSelect,
  DISPOSITION_OPTIONS,
  DISMISS_REASONS,
} from "@/components/waste/disposition-select";

describe("DISPOSITION_OPTIONS data integrity", () => {
  it("has exactly 7 disposition types", () => {
    expect(DISPOSITION_OPTIONS).toHaveLength(7);
  });

  it("every option has a non-empty value and label", () => {
    for (const opt of DISPOSITION_OPTIONS) {
      expect(opt.value.length).toBeGreaterThan(0);
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it("option values are unique", () => {
    const values = DISPOSITION_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("includes all required disposition types", () => {
    const values = DISPOSITION_OPTIONS.map((o) => o.value);
    expect(values).toContain("confirmed_fraud");
    expect(values).toContain("confirmed_waste");
    expect(values).toContain("policy_violation");
    expect(values).toContain("data_error");
    expect(values).toContain("false_positive");
    expect(values).toContain("under_investigation");
    expect(values).toContain("inconclusive");
  });
});

describe("DispositionSelect rendering", () => {
  it("renders the trigger with a placeholder", () => {
    render(
      <DispositionSelect onValueChange={() => {}} placeholder="Choose…" />
    );
    expect(screen.getByText("Choose…")).toBeInTheDocument();
  });

  it("renders with the default placeholder when none is provided", () => {
    render(<DispositionSelect onValueChange={() => {}} />);
    expect(screen.getByText("Select disposition…")).toBeInTheDocument();
  });
});

describe("DISMISS_REASONS data integrity", () => {
  it("keyboard keys are unique single characters", () => {
    const keys = DISMISS_REASONS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toHaveLength(1);
  });

  it("every reason has a label and a structured note", () => {
    for (const r of DISMISS_REASONS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.note.length).toBeGreaterThan(0);
    }
  });

  it("maps to valid disposition enum values only", () => {
    const valid = new Set(DISPOSITION_OPTIONS.map((o) => o.value));
    for (const r of DISMISS_REASONS) expect(valid.has(r.value)).toBe(true);
  });

  it("substantiated already-known findings count as true positives", () => {
    const known = DISMISS_REASONS.find((r) => r.label.startsWith("Already known"));
    expect(known?.value).toBe("confirmed_waste");
  });

  it("distinguishes detector-logic vs calibration vs entity failures in notes", () => {
    const notes = DISMISS_REASONS.map((r) => r.note.toLowerCase());
    expect(notes.some((n) => n.includes("legitimate"))).toBe(true);
    expect(notes.some((n) => n.includes("threshold"))).toBe(true);
    expect(notes.some((n) => n.includes("entity"))).toBe(true);
  });
});
