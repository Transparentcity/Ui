import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MandateScorecard from "./MandateScorecard";
import { NOW, compliance, mandate, standard911 } from "./mandateFixtures";
import {
  formatMandateValue,
  mandateIsStale,
  mandatePillKind,
  mandateReferenceLine,
  mandateStreakText,
  sortMandatesForScorecard,
  summarizeMandates,
} from "@/lib/mandates";

const twelve = <T,>(v: T) => Array.from({ length: 12 }, () => v);

describe("mandate status rules", () => {
  it("maps backend statuses to pills", () => {
    expect(mandatePillKind(compliance(twelve("met" as const)))).toBe("met");
    expect(mandatePillKind(compliance(["met", "missed"]))).toBe("missed");
    expect(mandatePillKind(compliance(["tracked"]))).toBe("tracked");
    expect(mandatePillKind(compliance(["met", "off_pace"]))).toBe("behind_pace");
    expect(mandatePillKind(compliance(["met", "no_data"]))).toBe("no_data");
    expect(mandatePillKind(compliance([]))).toBe("no_data");
  });

  it("is at risk when the latest period met but a recent one missed", () => {
    expect(mandatePillKind(compliance(["missed", "met", "met"]))).toBe("at_risk");
  });

  it("keeps the real status when the latest period is stale, and flags staleness", () => {
    const c = compliance(["missed"], { latest_period: "2025-01-01" });
    expect(mandatePillKind(c)).toBe("missed");
    expect(mandateIsStale(c, "month", NOW)).toBe(true);
    expect(mandateIsStale(c, "year", NOW)).toBe(false);
  });

  it("sorts failures first and no-target last", () => {
    const met = mandate(compliance(twelve("met" as const)), { metric_key: "a" });
    const tracked = mandate(compliance(["tracked"]), { metric_key: "b" });
    const missed = mandate(compliance(["met", "missed"]), { metric_key: "c" });
    const risky = mandate(compliance(["missed", "met", "met"]), { metric_key: "d" });
    expect(sortMandatesForScorecard([met, tracked, missed, risky]).map((m) => m.metric_key)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("summarizes counts and leads with the longest-running miss", () => {
    const met = mandate(compliance(twelve("met" as const)), { metric_key: "a" });
    const short = mandate(compliance(["met", "missed"]), { metric_key: "b" });
    const long = mandate(compliance(twelve("missed" as const)), {
      metric_key: "c",
      standard: { ...standard911, title: "Ambulances on scene within 10 minutes" },
    });
    const s = summarizeMandates([met, short, long], "San Francisco");
    expect(s.counts).toEqual({ met: 1, missed: 2 });
    expect(s.lead).toBe(
      "Ambulances on scene within 10 minutes has missed its standard for 12 months running."
    );
    expect(summarizeMandates([met], "San Francisco").lead).toBe(
      "San Francisco is meeting every legal standard with a numeric target."
    );
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
  it("renders one row per mandate with pill, streak, value and a link to the metric", () => {
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
    // The law and the responsible department live on the metric page now.
    expect(first.queryByText("Dept of Emergency Management")).toBeNull();
    expect(first.queryByRole("link", { name: /mandated report/i })).toBeNull();
    expect(first.getByRole("link", { name: /see the data and the law/i })).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/sf_mandate_911_answer_15s"
    );
    expect(first.getByRole("img")).toBeInTheDocument();

    const second = within(rows[1]);
    expect(second.getByText("Meets standard")).toBeInTheDocument();
    expect(second.getByText("Met 12 months running")).toBeInTheDocument();
    expect(second.getByText("Standard: ≤ 1,562 people")).toBeInTheDocument();
  });

  it("puts failures before successes and shows a summary strip", () => {
    const jail = mandate(compliance(twelve("met" as const)), { metric_key: "jail" });
    const missed = mandate(compliance(twelve("missed" as const)), { metric_key: "ems" });
    render(
      <MandateScorecard
        mandates={[jail, missed]}
        slug="sf"
        cityName="San Francisco"
        state="ready"
        now={NOW}
      />
    );
    const rows = screen.getAllByTestId("mandate-row");
    expect(rows[0]).toHaveAttribute("data-kind", "missed");
    expect(rows[1]).toHaveAttribute("data-kind", "met");
    const summary = within(screen.getByTestId("mandate-summary"));
    expect(summary.getByText("missed")).toBeInTheDocument();
    expect(summary.getByText("meeting the standard")).toBeInTheDocument();
    expect(summary.getByText(/has missed its standard for 12 months running/)).toBeInTheDocument();
  });

  it("labels a tracked standard as having no legal target and an off-pace one as behind pace", () => {
    const tracked = mandate(compliance(["tracked"]), { metric_key: "medi" });
    const pace = mandate(compliance(["off_pace"]), {
      metric_key: "rhna",
      standard: { ...standard911, operator: "pace", grain: "year" },
    });
    render(<MandateScorecard mandates={[tracked, pace]} slug="sf" state="ready" now={NOW} />);
    expect(screen.getByText("No legal target")).toHaveAttribute("data-kind", "tracked");
    expect(screen.getByText("Behind pace")).toHaveAttribute("data-kind", "behind_pace");
  });

  it("keeps a stale violation visible and says when it was last reported", () => {
    const stale = mandate(compliance(["missed"], { latest_period: "2025-07-01" }), {
      standard: { ...standard911, grain: "quarter" },
    });
    render(<MandateScorecard mandates={[stale]} slug="sf" state="ready" now={NOW} />);
    expect(screen.getByText("Missed")).toHaveAttribute("data-kind", "missed");
    expect(screen.getByText("Last report Q3 2025")).toBeInTheDocument();
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
    expect(screen.getByText(/no legal standards are tracked/i)).toBeInTheDocument();
  });

  it("shows a not-public notice on 403", () => {
    render(<MandateScorecard mandates={[]} slug="sf" state="forbidden" />);
    expect(screen.getByText(/not public yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("mandate-row")).toBeNull();
  });

  it("shows loading and error states", () => {
    const { rerender } = render(<MandateScorecard mandates={[]} slug="sf" state="loading" />);
    expect(screen.getByText(/loading legal standards/i)).toBeInTheDocument();
    rerender(<MandateScorecard mandates={[]} slug="sf" state="error" errorMessage="boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
