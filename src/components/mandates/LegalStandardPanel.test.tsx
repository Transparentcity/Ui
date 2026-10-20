import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LegalStandardPanel from "./LegalStandardPanel";
import { NOW, compliance, standard911 } from "./mandateFixtures";

describe("LegalStandardPanel", () => {
  it("renders nothing without a standard", () => {
    const { container } = render(<LegalStandardPanel standard={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the standard, citation, owner, report, consequences and method note", () => {
    render(<LegalStandardPanel standard={standard911} standardsBasis="NENA-STA-020.1" />);
    expect(screen.getByRole("heading", { name: "Legal standard" })).toBeInTheDocument();
    expect(screen.getByText(standard911.text)).toBeInTheDocument();
    expect(screen.getByText("Target: ≥ 90.0%")).toBeInTheDocument();
    expect(screen.getByText(standard911.citation)).toBeInTheDocument();
    expect(screen.getByText("NENA-STA-020.1")).toBeInTheDocument();
    expect(screen.getByText("Dept of Emergency Management")).toBeInTheDocument();
    expect(screen.getByText("Robert Smuts, Deputy Director")).toBeInTheDocument();
    expect(screen.getByText("Contact: performance.con@sfgov.org")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "911 Call Volume and Response" })).toHaveAttribute(
      "href",
      standard911.report_url
    );
    expect(screen.getByText(/consequences of missing it \(medium severity\)/i)).toBeInTheDocument();
    expect(screen.getByText(standard911.sanctions!)).toBeInTheDocument();
    expect(screen.getByText(standard911.method_note!)).toBeInTheDocument();
    // No compliance passed (e.g. 403 during dark launch): no status pill.
    expect(screen.queryByText("Missed")).toBeNull();
    expect(screen.queryByText("Meets standard")).toBeNull();
  });

  it("shows status, latest value and streak when compliance is available", () => {
    const c = compliance(Array.from({ length: 5 }, () => "missed" as const));
    render(
      <LegalStandardPanel
        standard={standard911}
        compliance={c}
        scorecardHref="/c/san-francisco/mandates"
      />
    );
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByText("75.0% in Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("Missed 5 months running")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all of the city.s legal standards/i })).toHaveAttribute(
      "href",
      "/c/san-francisco/mandates"
    );
  });

  it("renders a minimal standard without optional fields", () => {
    render(
      <LegalStandardPanel
        standard={{
          operator: "tracked",
          target: null,
          unit: "units",
          grain: "year",
          text: "Report housing production annually",
          citation: "",
        }}
      />
    );
    expect(screen.getByText("Report housing production annually")).toBeInTheDocument();
    expect(screen.queryByText(/target:/i)).toBeNull();
    expect(screen.queryByText(/legal source/i)).toBeNull();
  });

  it("says when a stale result was last reported", () => {
    render(
      <LegalStandardPanel
        standard={standard911}
        compliance={compliance(["met"], { latest_period: "2025-01-01" })}
        now={NOW}
      />
    );
    expect(screen.getByText("Meets standard")).toBeInTheDocument();
    expect(screen.getByText(/Last report Jan 2025; a newer one is overdue/)).toBeInTheDocument();
  });
});
