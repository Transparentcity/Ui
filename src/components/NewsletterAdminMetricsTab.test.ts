import { describe, expect, it } from "vitest";

import {
  aggregateEditions,
  campaignFamilyKey,
  campaignFamilyLabel,
  campaignLabel,
  formatDateRange,
  groupMetricsByCampaignFamily,
  mergeTopLinks,
  sendDateKey,
} from "./NewsletterAdminMetricsTab";
import type { NewsletterMetricsItem } from "@/lib/apiClient";

function item(
  overrides: Partial<NewsletterMetricsItem> & Pick<NewsletterMetricsItem, "campaign">,
): NewsletterMetricsItem {
  return {
    source: "weekly_newsletter",
    first_sent_at: "2026-09-06T18:30:00.000Z",
    last_sent_at: "2026-09-06T18:30:00.000Z",
    sends: 200,
    unique_recipients: 180,
    city_ids: [1],
    edition_hashes: ["abc"],
    clicks: 20,
    unique_clickers: 15,
    opens: 40,
    page_views: 8,
    unsubscribes: 1,
    click_through_rate: 15 / 180,
    ...overrides,
  };
}

describe("campaignLabel", () => {
  it("uses the first send date instead of the generated campaign date", () => {
    expect(
      campaignLabel("weekly_2026-09-04", "2026-09-06T18:30:00.000Z"),
    ).toContain("Sep 6, 2026");
  });

  it("falls back to the campaign date when send history is unavailable", () => {
    expect(campaignLabel("weekly_2026-09-04", null)).toBe("Weekly 2026-09-04");
  });
});

describe("campaignFamilyKey", () => {
  it("collapses dated weekly/monthly/sample campaigns", () => {
    expect(campaignFamilyKey("weekly_2026-09-04")).toBe("weekly");
    expect(campaignFamilyKey("monthly_2026-08-01")).toBe("monthly");
    expect(campaignFamilyKey("sample_2026-09-06")).toBe("sample");
  });

  it("collapses substack migration hashes", () => {
    expect(campaignFamilyKey("substack_migration_abc123")).toBe(
      "substack_migration",
    );
  });

  it("leaves unknown campaign ids intact", () => {
    expect(campaignFamilyKey("place_story_alert")).toBe("place_story_alert");
  });
});

describe("campaignFamilyLabel", () => {
  it("uses a stable display name per family", () => {
    expect(campaignFamilyLabel("weekly")).toBe("Weekly");
    expect(campaignFamilyLabel("substack_migration")).toBe("Substack migration");
  });
});

describe("formatDateRange", () => {
  it("shows a single date when first and last match", () => {
    expect(
      formatDateRange("2026-09-06T18:30:00.000Z", "2026-09-06T20:00:00.000Z"),
    ).toContain("Sep 6, 2026");
    expect(
      formatDateRange("2026-09-06T18:30:00.000Z", "2026-09-06T20:00:00.000Z"),
    ).not.toContain("\u2013");
  });

  it("shows a range across send dates", () => {
    const range = formatDateRange(
      "2026-06-14T18:00:00.000Z",
      "2026-09-06T18:30:00.000Z",
    );
    expect(range).toContain("Jun 14, 2026");
    expect(range).toContain("Sep 6, 2026");
  });
});

describe("aggregateEditions", () => {
  it("sums volume metrics and recomputes CTR from summed uniques", () => {
    const totals = aggregateEditions([
      item({
        campaign: "weekly_2026-08-28",
        sends: 100,
        unique_recipients: 90,
        unique_clickers: 9,
        clicks: 12,
        opens: 20,
        page_views: 3,
        unsubscribes: 1,
      }),
      item({
        campaign: "weekly_2026-09-04",
        sends: 110,
        unique_recipients: 95,
        unique_clickers: 10,
        clicks: 14,
        opens: 22,
        page_views: 4,
        unsubscribes: 2,
      }),
    ]);

    expect(totals.sends).toBe(210);
    expect(totals.unique_recipients).toBe(185);
    expect(totals.unique_clickers).toBe(19);
    expect(totals.clicks).toBe(26);
    expect(totals.opens).toBe(42);
    expect(totals.page_views).toBe(7);
    expect(totals.unsubscribes).toBe(3);
    expect(totals.click_through_rate).toBe(0.1027);
  });

  it("uses the earliest first send and latest last send", () => {
    const totals = aggregateEditions([
      item({
        campaign: "weekly_2026-09-04",
        first_sent_at: "2026-09-06T18:30:00.000Z",
        last_sent_at: "2026-09-07T12:00:00.000Z",
      }),
      item({
        campaign: "weekly_2026-08-28",
        first_sent_at: "2026-08-30T18:00:00.000Z",
        last_sent_at: "2026-08-30T18:00:00.000Z",
      }),
    ]);
    expect(totals.first_sent_at).toBe("2026-08-30T18:00:00.000Z");
    expect(totals.last_sent_at).toBe("2026-09-07T12:00:00.000Z");
  });
});

describe("groupMetricsByCampaignFamily", () => {
  it("aggregates dated weekly campaigns onto one expandable family", () => {
    const groups = groupMetricsByCampaignFamily([
      item({
        campaign: "weekly_2026-08-28",
        first_sent_at: "2026-08-30T18:00:00.000Z",
        last_sent_at: "2026-08-30T18:00:00.000Z",
        sends: 100,
      }),
      item({
        campaign: "weekly_2026-09-04",
        first_sent_at: "2026-09-06T18:30:00.000Z",
        last_sent_at: "2026-09-06T18:30:00.000Z",
        sends: 110,
      }),
      item({
        campaign: "sample_2026-09-01",
        source: "sample_newsletter",
        first_sent_at: "2026-09-01T12:00:00.000Z",
        last_sent_at: "2026-09-01T12:00:00.000Z",
        sends: 2,
        unique_recipients: 2,
      }),
    ]);

    expect(groups.map((g) => g.family)).toEqual(["weekly", "sample"]);
    expect(groups[0].dates).toHaveLength(2);
    expect(groups[0].totals.sends).toBe(210);
    expect(groups[0].dates.map((d) => d.totals.campaign)).toEqual([
      "weekly_2026-09-04",
      "weekly_2026-08-28",
    ]);
    expect(groups[1].dates).toHaveLength(1);
  });

  it("merges Friday/Saturday/Sunday campaign ids that shipped on the same day", () => {
    const groups = groupMetricsByCampaignFamily([
      item({
        campaign: "weekly_2026-09-04",
        first_sent_at: "2026-09-06T18:00:00.000Z",
        sends: 161,
        unique_recipients: 161,
      }),
      item({
        campaign: "weekly_2026-09-05",
        first_sent_at: "2026-09-06T19:00:00.000Z",
        sends: 43,
        unique_recipients: 43,
      }),
      item({
        campaign: "weekly_2026-08-28",
        first_sent_at: "2026-08-30T18:00:00.000Z",
        last_sent_at: "2026-08-30T18:00:00.000Z",
        sends: 192,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dates).toHaveLength(2);
    const latest = groups[0].dates[0];
    expect(sendDateKey(latest.totals.first_sent_at)).toContain("Sep 6, 2026");
    expect(latest.editions.map((e) => e.campaign).sort()).toEqual([
      "weekly_2026-09-04",
      "weekly_2026-09-05",
    ]);
    expect(latest.totals.sends).toBe(204);
    expect(groups[0].totals.sends).toBe(396);
  });
});

describe("mergeTopLinks", () => {
  it("sums clicks for the same destination across campaign ids", () => {
    const merged = mergeTopLinks([
      {
        destination_url: "https://transparent.city/c/sf",
        slot: "story",
        clicks: 4,
        unique_clickers: 3,
      },
      {
        destination_url: "https://transparent.city/c/sf",
        slot: "story",
        clicks: 2,
        unique_clickers: 2,
      },
      {
        destination_url: "https://transparent.city/c/oak",
        slot: "map",
        clicks: 5,
        unique_clickers: 5,
      },
    ]);
    expect(merged[0]).toEqual({
      destination_url: "https://transparent.city/c/sf",
      slot: "story",
      clicks: 6,
      unique_clickers: 5,
    });
    expect(merged[1]).toEqual({
      destination_url: "https://transparent.city/c/oak",
      slot: "map",
      clicks: 5,
      unique_clickers: 5,
    });
  });
});
