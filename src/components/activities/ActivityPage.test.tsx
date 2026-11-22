import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ActivityPayload } from "@/lib/activities";

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ isAuthenticated: false, isLoading: false, loginWithRedirect: vi.fn() }),
}));

import ActivityPage from "./ActivityPage";
import fixture from "./__fixtures__/oakland-clinton.json";

const clinton = fixture as unknown as ActivityPayload;

function headings() {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
}

describe("ActivityPage, Oakland potholes, Clinton", () => {
  it("shows the re-derived Clinton figures with source and cutoff", () => {
    const { container } = render(<ActivityPage payload={clinton} />);
    const text = container.textContent ?? "";
    expect(screen.getByText("128")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText("71 of 99")).toBeTruthy();
    expect(text).toContain("Of the 128, 99 OPEN, 1 PENDING and 28 UNFUNDED.");
    expect(text).toContain("the median wait is 179 days");
    expect(text).toMatch(/requests filed Aug 1, 2013 to\s*Nov 15, 2026/);
  });

  it("shows each number once: no repeated notice or path title", () => {
    render(<ActivityPage payload={clinton} />);
    expect(screen.getAllByText(/could not find a City of Oakland page/)).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Report and push the city" })).toHaveLength(1);
    expect(screen.queryByText(/We will ask for/)).toBeNull();
  });

  it("lists the first ten locations with request numbers and folds the rest", () => {
    const base = clinton.figures.targets[0];
    const targets = Array.from({ length: 12 }, (_, i) => ({ ...base, rank: i + 1 }));
    const { container } = render(
      <ActivityPage payload={{ ...clinton, figures: { ...clinton.figures, targets } }} />
    );
    const firstTable = container.querySelector("table");
    expect(firstTable?.querySelectorAll("tbody tr")).toHaveLength(10);
    expect(firstTable?.textContent).toContain("Requests 1312894, 1379558");
    expect(container.querySelector("details")?.textContent).toContain("Show the other 2 locations");
  });

  it("offers Path A only and says the rules could not be verified", () => {
    render(<ActivityPage payload={clinton} />);
    expect(screen.getAllByRole("heading", { name: "Report and push the city" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("A neighbor repair day")).toBeNull();
    expect(screen.getAllByText(/could not find a City of Oakland page/).length).toBeGreaterThan(0);
  });

  it("keeps the template order with rules after cost when only Path A is offered", () => {
    render(<ActivityPage payload={clinton} />);
    expect(headings()).toEqual([
      "What happened",
      "Why it matters",
      "What you can do",
      "How, step by step",
      "Cost and time",
      "Rules and safety",
      "Report back",
      "Sources",
    ]);
  });

  it("cites each rule to a City of Oakland page", () => {
    render(<ActivityPage payload={clinton} />);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(links).toContain("https://www.oaklandca.gov/My-Household/Report-an-Issue-OAK-311");
    expect(links).toContain(
      "https://www.oaklandca.gov/Public-Safety-Streets/Transportation-Permits-Engineering/Obstruction-Permit"
    );
  });

  it("offers the email draft with no recipient and the CSV download", () => {
    render(<ActivityPage payload={clinton} />);
    const mail = screen.getByRole("link", { name: "Open the email draft" }).getAttribute("href") ?? "";
    expect(mail.startsWith("mailto:?subject=")).toBe(true);
    const csv = screen.getByRole("link", { name: /Download the list/ });
    expect(csv.getAttribute("download")).toBe("oakland-potholes-clinton-2026-11-21.csv");
  });

  it("moves rules above the steps when the city allows a repair day", () => {
    const withB: ActivityPayload = {
      ...clinton,
      paths: [
        ...clinton.paths,
        {
          key: "repair_day",
          title: "A neighbor repair day",
          who: "A group",
          legal_note: "",
          steps: [],
          cost_time: [],
          legal_source: null,
        },
      ],
      rules: { ...clinton.rules, resident_repair_verified: true, unverified_note: null },
    };
    render(<ActivityPage payload={withB} />);
    const h = headings();
    expect(h.indexOf("Rules and safety")).toBeLessThan(h.indexOf("How, step by step"));
    expect(screen.queryByText(/could not find a City of Oakland page/)).toBeNull();
  });

  it("cites who fixes potholes to the OAK 311 page and shows no uncited safety text", () => {
    const { container } = render(<ActivityPage payload={clinton} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Report potholes to OAK 311.");
    expect(screen.queryByRole("heading", { name: "Safety" })).toBeNull();
  });

  it("offers report-back sign-in to a signed-out reader", () => {
    render(<ActivityPage payload={clinton} />);
    expect(screen.getByRole("button", { name: "Sign in to log what you did" })).toBeTruthy();
    expect(screen.getByText(/Only you can see your reports/)).toBeTruthy();
  });

  it("uses no em dashes in rendered copy", () => {
    const { container } = render(<ActivityPage payload={clinton} />);
    expect(container.textContent ?? "").not.toContain("—");
  });
});
