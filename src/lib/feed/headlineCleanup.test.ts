import { describe, it, expect } from "vitest";
import { normalizeHeadlineCaps, normalizeBusinessName, improveMultiMetricHeadline, stripLeadingEmoji, improveContextHeadline } from "./headlineCleanup";

describe("normalizeHeadlineCaps", () => {
  it("leaves normal mixed-case headlines unchanged", () => {
    expect(normalizeHeadlineCaps("SF Crime Drops in District 5")).toBe(
      "SF Crime Drops in District 5",
    );
  });

  it("title-cases ALL-CAPS business names at start of headline", () => {
    expect(
      normalizeHeadlineCaps("FRIENDS HALAL MEAT SUPERMARKET Opens 3-Stand Produce Op on Starling Ave, Bronx"),
    ).toBe("Friends Halal Meat Supermarket Opens 3-Stand Produce Op on Starling Ave, Bronx");
  });

  it("preserves known acronyms like LLC, INC, NYC", () => {
    expect(
      normalizeHeadlineCaps("PASTA PEOPLE LLC Brings Ice Cream to Flatbush Ave, Brooklyn"),
    ).toBe("Pasta People LLC Brings Ice Cream to Flatbush Ave, Brooklyn");
  });

  it("preserves INC with period", () => {
    expect(
      normalizeHeadlineCaps("HUESOCELL INC Files at Jackson Heights"),
    ).toBe("Huesocell INC Files at Jackson Heights");
  });

  it("handles single ALL-CAPS word in middle of headline", () => {
    expect(
      normalizeHeadlineCaps("Save A Lot OPENS at 832 W 63rd St"),
    ).toBe("Save A Lot Opens at 832 W 63rd St");
  });

  it("leaves short ALL-CAPS words (2 chars) alone", () => {
    expect(normalizeHeadlineCaps("SP Plus Drops 2 New Garages")).toBe(
      "SP Plus Drops 2 New Garages",
    );
  });

  it("handles empty string", () => {
    expect(normalizeHeadlineCaps("")).toBe("");
  });

  it("handles headline with emojis", () => {
    expect(
      normalizeHeadlineCaps("🚲 FALCONE CONSTRUCTION Files at 26 Harbor Rd"),
    ).toBe("🚲 Falcone Construction Files at 26 Harbor Rd");
  });

  it("preserves YTD, MTD acronyms", () => {
    expect(
      normalizeHeadlineCaps("SF Crime Down 43% YTD"),
    ).toBe("SF Crime Down 43% YTD");
  });
});

describe("normalizeBusinessName", () => {
  it("title-cases ALL-CAPS business names", () => {
    expect(normalizeBusinessName("FRIENDS HALAL MEAT SUPERMARKET")).toBe(
      "Friends Halal Meat Supermarket",
    );
  });

  it("preserves already mixed-case names", () => {
    expect(normalizeBusinessName("Jenny Lemons")).toBe("Jenny Lemons");
  });

  it("preserves LLC suffix", () => {
    expect(normalizeBusinessName("PASTA PEOPLE LLC")).toBe("Pasta People LLC");
  });

  it("handles empty string", () => {
    expect(normalizeBusinessName("")).toBe("");
  });
});

describe("improveMultiMetricHeadline", () => {
  it("transforms generic template headline using lead metric", () => {
    const result = improveMultiMetricHeadline(
      "District 3 This Week — 4 Metrics Moving",
      [
        { name: "Crime Incidents", direction: "up", pct: 15.2 },
        { name: "311 Complaints", direction: "down", pct: -8.3 },
        { name: "Building Permits", direction: "up", pct: 42.1 },
        { name: "Evictions", direction: "up", pct: 5 },
      ],
    );
    expect(result).toBe("District 3 — Building Permits Up 42% + 3 More");
  });

  it("leaves non-template headlines unchanged", () => {
    const headline = "SF's DA Is Winning More Cases — By Taking Fewer of Them";
    expect(improveMultiMetricHeadline(headline, [])).toBe(headline);
  });

  it("handles Citywide prefix", () => {
    const result = improveMultiMetricHeadline(
      "Citywide This Week — 6 Metrics Moving",
      [{ name: "Homicides", direction: "up", pct: 200 }],
    );
    expect(result).toBe("Citywide — Homicides Up 200%");
  });

  it("falls back to original if no metrics provided", () => {
    const headline = "District 5 This Week — 4 Metrics Moving";
    expect(improveMultiMetricHeadline(headline, null)).toBe(headline);
    expect(improveMultiMetricHeadline(headline, [])).toBe(headline);
  });

  it("handles City-wide with hyphen", () => {
    const result = improveMultiMetricHeadline(
      "City-wide This Week — 6 Metrics Moving",
      [{ name: "Potholes", direction: "up", pct: 45 }],
    );
    expect(result).toBe("City-wide — Potholes Up 45%");
  });

  it("formats large percentages as multipliers", () => {
    const result = improveMultiMetricHeadline(
      "District 10 This Week — 4 Metrics Moving",
      [{ name: "Solar Permits", direction: "up", pct: 2088 }],
    );
    expect(result).toBe("District 10 — Solar Permits Up 21x");
  });
});

describe("stripLeadingEmoji", () => {
  it("strips a single leading emoji", () => {
    expect(stripLeadingEmoji("🚲 SF Bicycle Collisions Down 43%")).toBe(
      "SF Bicycle Collisions Down 43%",
    );
  });

  it("strips multiple leading emoji", () => {
    expect(stripLeadingEmoji("🏚️ SF's Homeless 311 Count Is Up")).toBe(
      "SF's Homeless 311 Count Is Up",
    );
  });

  it("strips emoji with variation selectors", () => {
    expect(stripLeadingEmoji("📉 SF Total Police Incidents Hit a Low")).toBe(
      "SF Total Police Incidents Hit a Low",
    );
  });

  it("leaves headlines without leading emoji unchanged", () => {
    expect(stripLeadingEmoji("SF Crime Drops in District 5")).toBe(
      "SF Crime Drops in District 5",
    );
  });

  it("preserves mid-headline emoji", () => {
    // No leading emoji — should be unchanged
    expect(stripLeadingEmoji("SF's DA Is Winning 🎉 More Cases")).toBe(
      "SF's DA Is Winning 🎉 More Cases",
    );
  });

  it("handles empty string", () => {
    expect(stripLeadingEmoji("")).toBe("");
  });

  it("strips common feed emoji prefixes", () => {
    expect(stripLeadingEmoji("💰 SF Just Awarded $1.3B in Contracts")).toBe(
      "SF Just Awarded $1.3B in Contracts",
    );
    expect(stripLeadingEmoji("🗺️ Excelsior Crime Surge")).toBe(
      "Excelsior Crime Surge",
    );
  });
});

describe("improveContextHeadline", () => {
  it("improves 'Top 311 complaints' with city name", () => {
    expect(improveContextHeadline("Top 311 complaints", "Chicago")).toBe(
      "Chicago's Top 311 Complaints This Month",
    );
  });

  it("improves 'Crime: up or down?'", () => {
    expect(improveContextHeadline("Crime: up or down?", "Chicago")).toBe(
      "Chicago Crime: The Direction May Surprise You",
    );
  });

  it("improves 'Your city's crime mix'", () => {
    expect(improveContextHeadline("Your city's crime mix", "San Francisco")).toBe(
      "San Francisco's Crime Mix: Where the Numbers Are Moving",
    );
  });

  it("improves 'Building permit pace'", () => {
    expect(improveContextHeadline("Building permit pace", "Chicago")).toBe(
      "Chicago's Building Permit Pace Right Now",
    );
  });

  it("improves 'This year vs. last year'", () => {
    expect(improveContextHeadline("This year vs. last year", "Chicago")).toBe(
      "Chicago This Year vs. Last Year",
    );
  });

  it("leaves non-label headlines unchanged", () => {
    expect(
      improveContextHeadline("The Tenderloin's Drug Crime Surge Is Making the Rest of SF Look Tame", "San Francisco"),
    ).toBe("The Tenderloin's Drug Crime Surge Is Making the Rest of SF Look Tame");
  });

  it("returns original if no city name provided", () => {
    expect(improveContextHeadline("Top 311 complaints")).toBe("Top 311 complaints");
  });

  it("handles case-insensitive matching", () => {
    expect(improveContextHeadline("top 311 complaints", "Chicago")).toBe(
      "Chicago's Top 311 Complaints This Month",
    );
  });
});
