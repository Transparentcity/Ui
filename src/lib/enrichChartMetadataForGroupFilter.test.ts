import { describe, expect, it } from "vitest";
import { enrichChartMetadataForGroupFilter } from "./enrichChartMetadataForGroupFilter";

describe("enrichChartMetadataForGroupFilter", () => {
  const base = {
    group_field: "service_subtype",
    chart_title:
      "📞 311 Service Requests - District 3 - by service_subtype - Week Trend",
    caption:
      "Calculated week trend for 📞 311 Service Requests (District 3 - by service_subtype)",
  };

  it("replaces by group_field with the filtered subtype in title and caption", () => {
    const out = enrichChartMetadataForGroupFilter(base, "blocked_sidewalk");
    expect(out?.chart_title).toContain("blocked_sidewalk");
    expect(out?.chart_title).not.toMatch(/by service_subtype/i);
    expect(out?.caption).toContain("blocked_sidewalk");
    expect(out?.caption).not.toMatch(/by service_subtype/i);
  });

  it("returns metadata unchanged when group_value is omitted", () => {
    expect(enrichChartMetadataForGroupFilter(base, null)).toEqual(base);
    expect(enrichChartMetadataForGroupFilter(base, undefined)).toEqual(base);
    expect(enrichChartMetadataForGroupFilter(base, "  ")).toEqual(base);
  });

  it("works for sr_type style fields", () => {
    const meta = {
      group_field: "sr_type",
      chart_title: "📞 311 Calls - District 45 - by sr_type - Month Trend",
      caption: "Calculated month trend (District 45 - by sr_type)",
    };
    const out = enrichChartMetadataForGroupFilter(meta, "Tree Emergency");
    expect(out?.chart_title).toContain("Tree Emergency");
    expect(out?.caption).toContain("Tree Emergency");
  });
});
