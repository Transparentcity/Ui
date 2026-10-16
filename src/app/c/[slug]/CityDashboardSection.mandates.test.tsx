import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PublicCityMetricItem } from "@/lib/publicApiClient";
import CityDashboardSection from "./CityDashboardSection";

const metrics: PublicCityMetricItem[] = [
  { id: 1, metric_name: "Homicides", metric_key: "homicides", category: "Public safety", show_on_dash: true },
  {
    id: 2,
    metric_name: "911 calls answered in 15 seconds",
    metric_key: "911_answer_15s",
    category: "Legal mandates",
    show_on_dash: true,
  },
];

function renderDashboard(list: PublicCityMetricItem[] = metrics) {
  return render(
    <CityDashboardSection
      cityDisplayName="San Francisco"
      slug="san-francisco"
      metrics={list}
      comparisonsMap={{}}
      districts={[]}
      maps={[]}
    />
  );
}

function sectionFor(name: string): HTMLElement {
  return screen.getByText(name).closest(".metrics-category-section") as HTMLElement;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CityDashboardSection legal mandates", () => {
  it("renders mandate metrics as an ordinary YTD category when the flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_MANDATES_ENABLED", "");
    renderDashboard();
    expect(screen.queryByText(/compliance scorecard/i)).toBeNull();
    expect(screen.queryByText(/judged period by period/)).toBeNull();
    const section = sectionFor("911 calls answered in 15 seconds");
    expect(within(section).getByText("Change")).toBeInTheDocument();
    expect(within(section).getAllByText(/YTD$/)).toHaveLength(2);
  });

  it("renders a Legal Mandates section with a scorecard link and no YTD columns when on", () => {
    vi.stubEnv("NEXT_PUBLIC_MANDATES_ENABLED", "true");
    renderDashboard();
    const section = sectionFor("Legal Mandates");
    expect(within(section).getByRole("link", { name: /See compliance scorecard/ })).toHaveAttribute(
      "href",
      "/c/san-francisco/mandates"
    );
    expect(within(section).getByText(/year-to-date totals aren.t shown/i)).toBeInTheDocument();
    expect(within(section).queryByText("Change")).toBeNull();
    expect(within(section).queryByText(/YTD$/)).toBeNull();
    expect(
      within(section).getByRole("link", { name: "911 calls answered in 15 seconds" })
    ).toHaveAttribute("href", "/c/san-francisco/metrics/911_answer_15s");
    // Other categories keep their YTD table.
    expect(within(sectionFor("Homicides")).getByText("Change")).toBeInTheDocument();
  });

  it("still renders the section when every dashboard metric is a mandate", () => {
    vi.stubEnv("NEXT_PUBLIC_MANDATES_ENABLED", "1");
    renderDashboard([metrics[1]]);
    expect(screen.queryByText(/No dashboard metrics/)).toBeNull();
    expect(screen.getByText("Legal Mandates")).toBeInTheDocument();
  });
});
