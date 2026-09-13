import { describe, expect, it } from "vitest";

import { assessLag } from "./lag.mjs";

const known = (normalLagRange) => ({ normalLagRange });

describe("assessLag", () => {
  describe("metric not on record", () => {
    it("ignores a lag of 7 days or less", () => {
      expect(assessLag(7, undefined)).toEqual({ kind: "none" });
    });

    it("ignores a metric ahead of its city", () => {
      expect(assessLag(-9, undefined)).toEqual({ kind: "none" });
    });

    it("records a lag over 7 days with a range 4 days either side", () => {
      expect(assessLag(49, undefined)).toEqual({ kind: "new", normalLagRange: [45, 53] });
    });

    it("keeps the lower bound of a new range at zero or above", () => {
      expect(assessLag(8, undefined)).toEqual({ kind: "new", normalLagRange: [4, 12] });
    });
  });

  describe("metric on record", () => {
    // Before this rule was reachable, Appendix B grew every week and never shrank.
    it("resolves once the metric is within 3 days of its city", () => {
      expect(assessLag(3, known([16, 24]))).toEqual({ kind: "resolved" });
    });

    it("resolves when the metric is level with its city", () => {
      expect(assessLag(0, known([16, 24]))).toEqual({ kind: "resolved" });
    });

    it("resolves when the metric is ahead of its city", () => {
      // SF Illegal Dumping (834) on 2026-09-12: 9 days ahead, still carrying 16–24.
      expect(assessLag(-9, known([16, 24]))).toEqual({ kind: "resolved" });
    });

    it("stays on record without resolving at 4 days behind", () => {
      expect(assessLag(4, known([16, 24]))).toEqual({ kind: "none" });
    });

    it("stays quiet up to 7 days past the top of the range", () => {
      expect(assessLag(53, known([45, 53]))).toEqual({ kind: "none" });
      expect(assessLag(60, known([45, 53]))).toEqual({ kind: "none" });
    });

    it("flags a stall more than 7 days past the top of the range", () => {
      expect(assessLag(61, known([45, 53]))).toEqual({ kind: "stalled", maxLag: 53 });
    });

    it("leaves the range alone when a feed runs below it", () => {
      // One low reading between releases of a periodic feed is not a new normal.
      expect(assessLag(17, known([45, 53]))).toEqual({ kind: "none" });
    });

    it("treats an entry with no range as 0–30", () => {
      expect(assessLag(37, {})).toEqual({ kind: "none" });
      expect(assessLag(38, {})).toEqual({ kind: "stalled", maxLag: 30 });
    });
  });

  it("does nothing with a lag it cannot compute", () => {
    expect(assessLag(NaN, known([16, 24]))).toEqual({ kind: "none" });
    expect(assessLag(null, known([16, 24]))).toEqual({ kind: "none" });
  });
});
