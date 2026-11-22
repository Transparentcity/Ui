import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { DistrictCrimeOutlook, DistrictCrimeOutlookType } from "@/lib/publicApiClient";
import DistrictOutlookSection from "./DistrictOutlookSection";

const months = Array.from({ length: 18 }, (_, i) => {
  const m = ((4 + i) % 12) + 1;
  const y = 2025 + Math.floor((4 + i) / 12);
  return `${y}-${String(m).padStart(2, "0")}`;
});

function t(key: string, label: string, call: DistrictCrimeOutlookType["call"], shown: boolean, record: number): DistrictCrimeOutlookType {
  return {
    key, label, call, shown, record, rule: key === "car_breakins" ? "city_trend" : "momentum",
    last3_monthly: 44, avg12_monthly: 45, prior12_monthly: 46, last3_direction: "hold", months, counts: months.map((_, i) => 40 + (i % 5)),
  };
}

const outlook: DistrictCrimeOutlook = {
  as_of: "2026-10", window_start: "2026-11", window_end: "2027-01",
  record_start: "2022-07", record_end: "2026-07", min_record: 0.5,
  source: { name: "DataSF, SFPD incident reports", dataset: "wg3w-h783", url: "https://data.sf.gov/d/wg3w-h783", district_field: "supervisor_district" },
  district: "5",
  crime_types: [
    t("car_breakins", "Car break-ins", "fall", true, 0.662),
    t("car_theft", "Car theft", "fall", true, 0.629),
    t("property", "All property crime", "hold", true, 0.61),
    t("robbery", "Robbery", "fall", false, 0.488),
  ],
};

describe("DistrictOutlookSection", () => {
  it("leads with the headline and shows a chart card per forecast", () => {
    render(<DistrictOutlookSection outlook={outlook} placeName="District 5" />);
    const h = screen.getByRole("heading", { level: 2 });
    expect(h).toHaveAccessibleName(
      "Car break-ins and car theft likely to fall in District 5 through January; overall property crime likely to hold steady"
    );
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText(/District 5 crime outlook/)).toHaveTextContent("Nov 2026 to Jan 2027");
  });

  it("keeps crime types without a forecast out of the top and in the details", () => {
    const { container } = render(<DistrictOutlookSection outlook={outlook} placeName="District 5" />);
    expect(container.querySelectorAll(".district-outlook-card")).toHaveLength(3);
    expect(screen.getByText("Robbery")).toBeInTheDocument();
    expect(screen.getByText("Not shown: track record under 50%")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/predict/i);
    expect(container.textContent).not.toContain("—");
  });

  it("renders nothing when no crime type clears the bar", () => {
    const none = { ...outlook, crime_types: outlook.crime_types.map((c) => ({ ...c, shown: false })) };
    const { container } = render(<DistrictOutlookSection outlook={none} placeName="District 5" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DistrictOutlookSection edge cases", () => {
  it("renders details for a type with almost no history", () => {
    const short = { ...outlook.crime_types[3], key: "shoplifting", label: "Shoplifting", shown: true, months: [], counts: [] };
    const o = { ...outlook, crime_types: [...outlook.crime_types.slice(0, 3), short] };
    render(<DistrictOutlookSection outlook={o} placeName="District 5" />);
    expect(screen.getByText("Not shown: not enough history")).toBeInTheDocument();
  });
});

describe("DistrictOutlookSection change column", () => {
  it("compares the last quarter with the 12 months before it, like the call", () => {
    const o = {
      ...outlook,
      crime_types: [{ ...outlook.crime_types[2], last3_monthly: 280, avg12_monthly: 264, prior12_monthly: 252, last3_direction: "rise" as const }],
    };
    render(<DistrictOutlookSection outlook={o} placeName="District 9" />);
    expect(screen.getByText("+11%")).toBeInTheDocument();
    expect(screen.getByText(/vs 252 a month\s+in the 12 months before/)).toBeInTheDocument();
  });

  it("falls back to the 12-month average for older payloads without NaN", () => {
    const old = { ...outlook.crime_types[2] } as Partial<typeof outlook.crime_types[2]>;
    delete old.prior12_monthly;
    delete old.last3_direction;
    const o = { ...outlook, crime_types: [old as typeof outlook.crime_types[2]] };
    const { container } = render(<DistrictOutlookSection outlook={o} placeName="District 9" />);
    expect(container.textContent).not.toContain("NaN");
    expect(container.textContent).toContain("over the last 12 months");
  });
});
