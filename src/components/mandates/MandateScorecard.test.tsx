import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MandateScorecard from "./MandateScorecard";
import { NOW, compliance, mandate, standard911 } from "./mandateFixtures";
import {
  formatMandateValue,
  mandatePillKind,
  mandateReferenceLine,
  mandateStreakText,
} from "@/lib/mandates";

const twelve = <T,>(v: T) => Array.from({ length: 12 }, () => v);

describe("mandate status rules", () => {
  it("maps backend statuses to pills", () => {
    expect(mandatePillKind(compliance(twelve("met" as const)), "month", NOW)).toBe("met");
    expect(mandatePillKind(compliance(["met", "missed"]), "month", NOW)).toBe("missed");
    expect(mandatePillKind(compliance(["tracked"]), "month", NOW)).toBe("tracked");
    expect(mandatePillKind(compliance(["met", "no_data"]), "month", NOW)).toBe("no_data");
    expect(mandatePillKind(compliance([]), "month", NOW)).toBe("no_data");
  });

  it("is at risk when the latest period met but a recent one missed", () => {
    expect(mandatePillKind(compliance(["missed", "met", "met"]), "month", NOW)).toBe("at_risk");
  });

  it("reads as no recent data when the latest period is stale", () => {
    const c = compliance(["met"], { latest_period: "2025-01-01" });
    expect(mandatePillKind(c, "month", NOW)).toBe("no_data");
    expect(mandatePillKind(c, "year", NOW)).toBe("met");
  });

  it("writes streak text with grain and plurals", () => {
    expect(mandateStreakText(compliance(twelve("missed" as const)), "month")).toBe(
      "Missed 12 months running"
    );
    expect(mandateStreakText(compliance(["missed", "met", "met"]), "quarter")).toBe(
      "Met 2 quarters running"
    );
    expect(mandateStreakText(compliance(["met", "missed"]), "month")).toBe(
      "Missed the latest month"
    );
    expect(mandateStreakText(compliance(["tracked", "tracked"]), "month")).toBeNull();
  });

  it("formats % values with one decimal and other units with a noun", () => {
    expect(formatMandateValue(76.04, "%")).toBe("76.0%");
    expect(formatMandateValue(1203, "people")).toBe("1,203 people");
    expect(formatMandateValue(null, "%")).toBe("No data");
  });

  it("builds a reference line for >=, <= and pace, not tracked", () => {
    expect(mandateReferenceLine(standard911)?.y).toBe(90);
    expect(mandateReferenceLine({ ...standard911, operator: "pace" })?.y).toBe(90);
    expect(mandateReferenceLine({ ...standard911, operator: "tracked" })).toBeNull();
    expect(mandateReferenceLine({ ...standard911, target: null })).toBeNull();
  });
});

describe("MandateScorecard", () => {
  it("renders one row per mandate with pill, streak, value and links", () => {
    const missed = mandate(compliance(twelve("missed" as const)));
    const jail = mandate(compliance(twelve("met" as const)), {
      metric_key: "sf_mandate_jail_adp",
      metric_name: "Jail population",
      standard: {
        ...standard911,
        operator: "<=",
        target: 1562,
        unit: "people",
        title: "Jail population within rated capacity",
        text: "Average daily jail population at or below 1,562",
        owner_department: "Sheriff's Office",
        report_url: null,
        report_name: null,
      },
    });
    render(<MandateScorecard mandates={[missed, jail]} slug="san-francisco" state="ready" now={NOW} />);

    const rows = screen.getAllByTestId("mandate-row");
    expect(rows).toHaveLength(2);

    const first = within(rows[0]);
    expect(first.getByText("911 calls answered within 15 seconds")).toBeInTheDocument();
    expect(first.getByText("Missed")).toHaveAttribute("data-kind", "missed");
    expect(first.getByText("Missed 12 months running")).toBeInTheDocument();
    expect(first.getByText("75.0%")).toBeInTheDocument();
    expect(first.getByText("Standard: ≥ 90.0%")).toBeInTheDocument();
    expect(first.getByText("Dept of Emergency Management")).toBeInTheDocument();
    expect(first.getByRole("link", { name: /see the data/i })).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/sf_mandate_911_answer_15s"
    );
    expect(first.getByRole("link", { name: /mandated report/i })).toHaveAttribute(
      "href",
      standard911.report_url
    );
    expect(first.getByRole("img")).toBeInTheDocument();

    const second = within(rows[1]);
    expect(second.getByText("Meets standard")).toBeInTheDocument();
    expect(second.getByText("Met 12 months running")).toBeInTheDocument();
    expect(second.getByText("Standard: ≤ 1,562 people")).toBeInTheDocument();
    expect(second.queryByRole("link", { name: /mandated report/i })).toBeNull();
  });

  it("shows At risk and No recent data pills", () => {
    const risky = mandate(compliance(["missed", "met", "met"]));
    const empty = mandate(compliance([]), { metric_key: "x_empty" });
    render(<MandateScorecard mandates={[risky, empty]} slug="sf" state="ready" now={NOW} />);
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText("No recent data")).toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no mandates", () => {
    render(<MandateScorecard mandates={[]} slug="sf" state="ready" />);
    expect(screen.getByText(/no legal mandates are tracked/i)).toBeInTheDocument();
  });

  it("shows a not-public notice on 403", () => {
    render(<MandateScorecard mandates={[]} slug="sf" state="forbidden" />);
    expect(screen.getByText(/not public yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("mandate-row")).toBeNull();
  });

  it("shows loading and error states", () => {
    const { rerender } = render(<MandateScorecard mandates={[]} slug="sf" state="loading" />);
    expect(screen.getByText(/loading legal mandates/i)).toBeInTheDocument();
    rerender(<MandateScorecard mandates={[]} slug="sf" state="error" errorMessage="boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
