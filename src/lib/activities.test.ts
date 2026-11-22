import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activitiesEnabled,
  buildMailto,
  formatAge,
  formatDate,
  normalizeArea,
  statusBreakdown,
  targetsCsv,
} from "./activities";

afterEach(() => vi.unstubAllEnvs());

describe("activitiesEnabled", () => {
  it("defaults off", () => {
    vi.stubEnv("NEXT_PUBLIC_ACTIVITIES_ENABLED", "");
    expect(activitiesEnabled()).toBe(false);
  });
  it("turns on with true/1/yes", () => {
    for (const v of ["true", "1", "YES"]) {
      vi.stubEnv("NEXT_PUBLIC_ACTIVITIES_ENABLED", v);
      expect(activitiesEnabled()).toBe(true);
    }
  });
});

describe("normalizeArea", () => {
  it("keeps slugs and districts, drops anything else", () => {
    expect(normalizeArea("Clinton")).toBe("clinton");
    expect(normalizeArea(["d2", "d3"])).toBe("d2");
    expect(normalizeArea(undefined)).toBe("");
    expect(normalizeArea("../etc")).toBe("");
  });
});

describe("buildMailto", () => {
  it("has no recipient and encodes subject and body", () => {
    const m = buildMailto({ subject: "Potholes in Clinton", body: "Line 1\nLine 2 & more" });
    expect(m.startsWith("mailto:?subject=")).toBe(true);
    expect(m).toContain("Potholes%20in%20Clinton");
    expect(m).toContain("Line%201%0ALine%202%20%26%20more");
  });
});

describe("targetsCsv", () => {
  it("writes a header and quotes cells with commas", () => {
    const csv = targetsCsv([
      {
        rank: 1,
        address: "12TH AVE, E 19TH ST",
        lat: 37.79,
        lon: -122.24,
        requests: 2,
        request_ids: ["1", "2"],
        statuses: ["OPEN"],
        first_reported: "2023-07-08",
        days_open: 1232,
      },
    ]);
    const [head, row] = csv.trim().split("\n");
    expect(head).toBe("rank,address,requests,request_ids,statuses,first_reported,days_open,lat,lon");
    expect(row).toBe('1,"12TH AVE, E 19TH ST",2,1 2,OPEN,2023-07-08,1232,37.79,-122.24');
  });
});

describe("formatDate", () => {
  it("formats ISO dates in UTC", () => {
    expect(formatDate("2026-11-15")).toBe("Nov 15, 2026");
    expect(formatDate(null)).toBe("unknown");
  });
});

describe("formatAge", () => {
  it("uses days under a year and years after", () => {
    expect(formatAge(45)).toBe("45 days");
    expect(formatAge(1233)).toBe("3.4 years");
  });
});

describe("statusBreakdown", () => {
  it("follows the city's status order and skips zeros", () => {
    const order = ["OPEN", "PENDING", "WOCREATE", "UNFUNDED"];
    expect(statusBreakdown({ OPEN: 99, UNFUNDED: 28, PENDING: 1, WOCREATE: 0 }, order)).toBe(
      "99 OPEN, 1 PENDING and 28 UNFUNDED"
    );
    expect(statusBreakdown({ OPEN: 3 }, order)).toBe("3 OPEN");
  });
});
