import { afterEach, describe, expect, it, vi } from "vitest";

import type { DistrictCrimeOutlook, DistrictCrimeOutlookType } from "@/lib/publicApiClient";
import {
  buildHeadline,
  buildSubhead,
  changeSummary,
  districtOutlookEnabled,
  formatMonthly,
  headlineText,
  joinWords,
  loadDistrictCrimeOutlook,
  monthLabel,
} from "@/lib/districtOutlook";

function type(
  key: string,
  label: string,
  call: DistrictCrimeOutlookType["call"],
  shown = true,
  record = 0.6
): DistrictCrimeOutlookType {
  return {
    key, label, call, shown, record, rule: "momentum",
    last3_monthly: 40, avg12_monthly: 45,
    months: ["2026-08", "2026-09", "2026-10"], counts: [40, 41, 39],
  };
}

function outlook(types: DistrictCrimeOutlookType[]): DistrictCrimeOutlook {
  return {
    as_of: "2026-10", window_start: "2026-11", window_end: "2027-01",
    record_start: "2022-07", record_end: "2026-07", min_record: 0.5,
    source: { name: "DataSF, SFPD incident reports", dataset: "wg3w-h783", url: "https://data.sf.gov/d/wg3w-h783", district_field: "supervisor_district" },
    district: "5", crime_types: types,
  };
}

describe("districtOutlookEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default and on for truthy values", () => {
    vi.stubEnv("NEXT_PUBLIC_NEIGHBORHOOD_OUTLOOK", "");
    expect(districtOutlookEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_NEIGHBORHOOD_OUTLOOK", "true");
    expect(districtOutlookEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_NEIGHBORHOOD_OUTLOOK", "no");
    expect(districtOutlookEnabled()).toBe(false);
  });

  it("makes no request when off", async () => {
    vi.stubEnv("NEXT_PUBLIC_NEIGHBORHOOD_OUTLOOK", "");
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await loadDistrictCrimeOutlook(57260, 5)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns null instead of throwing when the request fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_NEIGHBORHOOD_OUTLOOK", "1");
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    expect(await loadDistrictCrimeOutlook(57260, 5)).toBeNull();
    spy.mockRestore();
  });
});

describe("buildHeadline", () => {
  it("names what is likely to fall, with place and end month", () => {
    const h = buildHeadline(outlook([type("car_breakins", "Car break-ins", "fall"), type("car_theft", "Car theft", "fall")]), "District 5");
    expect(headlineText(h!)).toBe("Car break-ins and car theft likely to fall in District 5 through January");
    expect(h!.find((p) => p.call)?.call).toBe("fall");
  });

  it("leads with rises, then falls, then holds", () => {
    const h = buildHeadline(
      outlook([
        type("property", "All property crime", "hold"),
        type("car_breakins", "Car break-ins", "fall"),
        type("shoplifting", "Shoplifting", "rise"),
      ]),
      "District 6"
    );
    expect(headlineText(h!)).toBe(
      "Shoplifting likely to rise in District 6 through January; car break-ins likely to fall; overall property crime likely to hold steady"
    );
  });

  it("leaves out crime types that are not shown", () => {
    const h = buildHeadline(outlook([type("car_breakins", "Car break-ins", "fall"), type("robbery", "Robbery", "rise", false)]), "District 5");
    expect(headlineText(h!)).not.toContain("robbery");
  });

  it("returns null when nothing clears the bar", () => {
    expect(buildHeadline(outlook([type("robbery", "Robbery", "fall", false)]), "District 5")).toBeNull();
    expect(buildHeadline(outlook([type("robbery", "Robbery", null, true)]), "District 5")).toBeNull();
  });

  it("never uses the word predict", () => {
    const o = outlook([type("car_breakins", "Car break-ins", "fall")]);
    expect(headlineText(buildHeadline(o, "District 5")!) + buildSubhead(o)).not.toMatch(/predict/i);
  });
});

describe("buildSubhead", () => {
  it("states the record range and dates from the payload", () => {
    const s = buildSubhead(outlook([type("a", "A", "fall", true, 0.662), type("b", "B", "hold", true, 0.61)]));
    expect(s).toContain("right 61% to 66% of the time across all 11 districts, Jul 2022 to Jul 2026");
  });
});

describe("formatting", () => {
  it("formats months, lists and monthly values", () => {
    expect(monthLabel("2027-01")).toBe("Jan 2027");
    expect(monthLabel("2027-01", { long: true, year: false })).toBe("January");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
    expect(formatMonthly(3.25)).toBe("3.3");
    expect(formatMonthly(313.7)).toBe("314");
  });

  it("summarizes change against the 12-month average", () => {
    expect(changeSummary(33.3, 36.7)).toEqual({ text: "-9%", direction: "down" });
    expect(changeSummary(313.7, 313.2)).toEqual({ text: "0%", direction: "flat" });
    expect(changeSummary(3.3, 2.3)).toEqual({ text: "+1.0 a month", direction: "up" });
  });
});

describe("review fixes", () => {
  it("does not lose a point to float error", async () => {
    const { recordPct } = await import("@/lib/districtOutlook");
    expect(recordPct(0.57)).toBe(57);
    expect(recordPct(0.29)).toBe(29);
    expect(recordPct(0.629)).toBe(62);
  });

  it("handles missing months and short series without throwing", () => {
    expect(monthLabel(undefined)).toBe("");
    const short = { ...type("car_theft", "Car theft", "fall"), months: ["2026-10"], counts: [3] };
    expect(buildHeadline(outlook([short]), "District 5")).toBeNull();
  });
});
