/**
 * Tests for the feed text cleanup module.
 *
 * Covers: metadata detection, leading date stripping, headline overlap removal,
 * boilerplate removal, geography stripping, sentence-boundary trimming.
 */

import { describe, it, expect } from "vitest";
import { cleanDescription } from "./textCleanup";

// ── Metadata-only detection ───────────────────────────────────────────────

describe("metadata-only detection", () => {
  it("returns empty for pure metadata breadcrumbs", () => {
    // After city prefix stripping, the remainder is metadata-only
    expect(
      cleanDescription(
        "San Francisco · Week of Feb 23, 2026",
        "Some headline",
        "San Francisco"
      )
    ).toBe("");
  });

  it("returns empty for simple date-only metadata", () => {
    // Pure date metadata with no narrative content
    expect(
      cleanDescription(
        "Week of Mar 16, 2026 · District 5",
        "Any headline",
        "Chicago"
      )
    ).toBe("");
  });

  it("returns empty for just a date string", () => {
    expect(
      cleanDescription("Week of Feb 23, 2026", "Any headline")
    ).toBe("");
  });

  it("preserves actual narrative content", () => {
    const desc = "Motor vehicle thefts dropped 12% this week compared to last month, continuing a three-month downward trend across the district.";
    const result = cleanDescription(desc, "Thefts drop in District 6");
    expect(result.length).toBeGreaterThan(20);
  });
});

// ── Neighborhood breadcrumb metadata detection ───────────────────────────

describe("neighborhood breadcrumb detection", () => {
  it("returns empty for neighborhood + date breadcrumb", () => {
    expect(
      cleanDescription(
        "Bayview Hunters Point · Week of Feb 23, 2026",
        "Traffic Citations in Bayview Hunters Point Up 57%",
        "San Francisco"
      )
    ).toBe("");
  });

  it("returns empty for multi-word neighborhood breadcrumb", () => {
    expect(
      cleanDescription(
        "Mission Dolores · Week of Mar 16, 2026",
        "311 Requests Spike",
        "San Francisco"
      )
    ).toBe("");
  });

  it("returns empty for neighborhood without date", () => {
    // Just a neighborhood name with city separator — no narrative
    expect(
      cleanDescription(
        "Tenderloin · City-wide",
        "Any headline"
      )
    ).toBe("");
  });

  it("returns empty for neighborhood + Data fresh breadcrumb", () => {
    expect(
      cleanDescription(
        "South Loop · Data fresh as of Mar 16, 2026",
        "Crime drops in South Loop",
        "Chicago"
      )
    ).toBe("");
  });

  it("preserves text that happens to contain a neighborhood name", () => {
    const desc = "Bayview Hunters Point saw a significant increase in graffiti reports, with 43 new cases filed this week alone.";
    const result = cleanDescription(desc, "Graffiti surges", "San Francisco");
    expect(result.length).toBeGreaterThan(20);
  });

  it("returns empty for district + parenthetical neighborhood breadcrumb", () => {
    expect(
      cleanDescription(
        "District 2 (Marina/Pacific Heights) · Week of Feb 23, 2026",
        "Offensive Graffiti Cases Surged 437% in District 2",
        "San Francisco"
      )
    ).toBe("");
  });

  it("returns empty for warning metadata with emoji", () => {
    expect(
      cleanDescription(
        "Week of Feb 23, 2026 · ⚠️ Data has 10-day lag",
        "DA Charges Filed Dropped 57%"
      )
    ).toBe("");
  });

  it("returns empty for unknown neighborhood + date (proper noun heuristic)", () => {
    // Even neighborhoods not in any city list should be detected
    expect(
      cleanDescription(
        "Sunset Heights · Week of Feb 23, 2026",
        "Any headline"
      )
    ).toBe("");
  });
});

// ── Leading date phrase stripping ─────────────────────────────────────────

describe("leading date phrase stripping", () => {
  it("strips 'In January 2026, ...' prefix", () => {
    const desc = "In January 2026, motor vehicle thefts reached 291 incidents. This represents a significant spike compared to the prior year.";
    const result = cleanDescription(desc, "Thefts spike in January");
    expect(result).not.toMatch(/^In January/);
    expect(result.length).toBeGreaterThan(20);
  });

  it("strips 'This week, ...' prefix", () => {
    const desc = "This week, police responded to 47 burglary reports across the city. Officers noted a concentration in the Western Addition neighborhood.";
    const result = cleanDescription(desc, "Burglary reports up");
    expect(result).not.toMatch(/^This week/);
  });

  it("strips 'During the week of ...' prefix", () => {
    const desc = "During the week of March 9, a total of 15 fire calls were logged. The most common cause was unattended cooking.";
    const result = cleanDescription(desc, "Fire calls logged");
    expect(result).not.toMatch(/^During the week/);
  });
});

// ── Headline overlap removal ──────────────────────────────────────────────

describe("headline overlap removal", () => {
  it("strips first sentence when it restates the headline", () => {
    const headline = "Motor vehicle thefts drop in San Francisco";
    const desc = "Motor vehicle thefts in San Francisco have dropped significantly. The decrease follows increased patrols in the Tenderloin and Mission districts.";
    const result = cleanDescription(desc, headline, "San Francisco");
    // Should skip the first sentence and start with the second
    expect(result).toContain("decrease");
    expect(result).not.toMatch(/^Motor vehicle thefts/);
  });

  it("keeps first sentence when it adds new information", () => {
    const headline = "Crime spikes in D6";
    const desc = "Shoplifting and vandalism make up 70% of the increase. The Tenderloin has been particularly affected with after-hours incidents.";
    const result = cleanDescription(desc, headline);
    expect(result).toContain("Shoplifting");
  });
});

// ── Boilerplate stripping ─────────────────────────────────────────────────

describe("boilerplate stripping", () => {
  it("strips rolling average sentences", () => {
    const desc = "Crime in the district fell 8% this quarter. The 12-week rolling average stands at 340 incidents per week. Residents report feeling safer.";
    const result = cleanDescription(desc, "Crime falls in D6");
    expect(result).not.toMatch(/rolling average/);
  });
});

// ── Geography stripping ───────────────────────────────────────────────────

describe("geography stripping", () => {
  it("strips 'in San Francisco' from mid-sentence", () => {
    const desc = "Motor vehicle thefts in San Francisco dropped 12% this week. The trend follows three months of decline across the city.";
    const result = cleanDescription(desc, "Thefts drop", "San Francisco");
    expect(result).not.toContain("in San Francisco");
  });

  it("strips 'in District X' patterns", () => {
    const desc = "Noise complaints in District 6 increased by 30% this month. Most complaints involve construction noise during early morning hours.";
    const result = cleanDescription(desc, "Noise up", "San Francisco", "San Francisco · District 6");
    expect(result).not.toContain("in District 6");
  });
});

// ── Sentence boundary trimming ────────────────────────────────────────────

describe("sentence boundary trimming", () => {
  it("trims long text at sentence boundary before 200 chars", () => {
    // Build a description longer than 200 chars
    const desc = "The city saw a 15% increase in 311 requests. " +
      "Most requests were for graffiti removal and illegal dumping. " +
      "The Department of Public Works responded within 48 hours in most cases. " +
      "However, some areas waited up to a week for resolution. " +
      "Residents expressed frustration with the delays on social media.";
    const result = cleanDescription(desc, "311 requests increase");
    // Should end at a period
    expect(result).toMatch(/\.$/);
    expect(result.length).toBeLessThanOrEqual(250);
  });

  it("passes through very short but valid descriptions", () => {
    // Short description that has actual content — should pass through
    const desc = "Up 5% from last week.";
    const result = cleanDescription(desc, "Different headline entirely");
    expect(result).toBe("Up 5% from last week.");
  });

  it("falls back to original for longer text over-cleaned by patterns", () => {
    // Longer description (>80 chars) that gets over-cleaned should fall back to original
    const desc = "In January 2026, motor vehicle thefts reached 291 incidents. This represents a significant and sustained improvement.";
    const result = cleanDescription(desc, "Motor vehicle thefts reached 291 incidents in January 2026");
    expect(result.length).toBeGreaterThan(20);
  });
});

// ── Card description coverage ────────────────────────────────────────────
// Verifies that common real-world descriptions from the API are handled correctly:
// metadata breadcrumbs → empty, narratives → preserved.

describe("real-world API descriptions", () => {
  const metadataDescriptions = [
    "San Francisco · Week of Feb 23, 2026",
    "Bayview Hunters Point · Week of Feb 23, 2026",
    "District 2 (Marina/Pacific Heights) · Week of Feb 23, 2026",
    "Week of Mar 16, 2026 · District 5",
    "Week of Feb 23, 2026 · ⚠️ Data has 10-day lag",
    "South Loop · Data fresh as of Mar 16, 2026",
    "Tenderloin · City-wide",
    "Mission Dolores · Week of Mar 16, 2026",
    "Sunset Heights · Week of Feb 23, 2026",
    "San Francisco · City-wide · Data fresh as of Mar 16",
    "Week of Feb 23, 2026",
  ];

  it.each(metadataDescriptions)(
    "returns empty for metadata-only: %s",
    (desc) => {
      expect(cleanDescription(desc, "Any headline", "San Francisco")).toBe("");
    },
  );

  const narrativeDescriptions = [
    "Motor vehicle thefts dropped 12% this week compared to last month, continuing a three-month downward trend across the district.",
    "The NYC DCWP business license dataset has not been updated since March 9, 2026, leaving a gap in citywide licensing activity.",
    "Shoplifting and vandalism make up 70% of the increase. The Tenderloin has been particularly affected with after-hours incidents.",
    "DPW awarded a $4.2 million contract to CleanScapes Inc. for expanded Tenderloin street cleaning starting in March.",
  ];

  it.each(narrativeDescriptions)(
    "preserves narrative text (>20 chars): %s",
    (desc) => {
      const result = cleanDescription(desc, "Different headline entirely");
      expect(result.length).toBeGreaterThan(20);
    },
  );
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("returns empty for empty input", () => {
    expect(cleanDescription("", "headline")).toBe("");
  });

  it("returns empty for null-ish input", () => {
    expect(cleanDescription(undefined as unknown as string, "headline")).toBe("");
  });

  it("capitalizes first letter after cleanup", () => {
    const desc = "this is a description that starts lowercase but has enough content to not be too short for the cleanup module.";
    const result = cleanDescription(desc, "Different headline");
    expect(result[0]).toMatch(/[A-Z]/);
  });

  it("strips city breadcrumb prefix", () => {
    const desc = "San Francisco · Motor vehicle thefts dropped 12% this week compared to last month, continuing a downward trend across the district.";
    const result = cleanDescription(desc, "Thefts drop", "San Francisco");
    expect(result).not.toMatch(/^San Francisco ·/);
  });
});
