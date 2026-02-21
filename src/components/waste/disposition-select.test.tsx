import { render, screen } from "@testing-library/react";

import {
  DispositionSelect,
  DISPOSITION_OPTIONS,
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
