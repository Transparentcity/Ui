import { describe, it, expect } from "vitest";
import { extractDetailNarrative } from "./fetchReportNarratives";

// Simulated multi-story research report HTML (mimics real Seymour output)
const MULTI_STORY_REPORT_HTML = `
<h2>Offensive Graffiti Cases Surged 437% in District 2</h2>
<p>San Francisco · District 2 (Marina/Pacific Heights) · Week of Feb 23, 2026</p>
<p>District 2 — the Marina and Pacific Heights — saw offensive graffiti 311 cases jump from an average of 3.2/week to 17 cases in the week ending Feb 23. That's a 437% spike. The same week, District 3 (North Beach/Chinatown) saw 22 offensive graffiti cases — 252% above its average. Something was hitting the northern neighborhoods hard that week.</p>
<p>"Offensive graffiti" in SF's 311 system means content that's hateful, threatening, or sexually explicit — not just tagging. A coordinated surge across multiple northern districts in the same week suggests either a targeted campaign or a single prolific actor. The data is fresh (2-day lag), so this is a confirmed recent event.</p>

<h2>SF Awarded $1.3 Billion in Contracts in March — 428% Above Average</h2>
<p>San Francisco · March 2026 · Data fresh as of Mar 6</p>
<p>The City of San Francisco awarded $1.31 billion in supplier contracts in March 2026 — compared to a 6-month average of $248 million. That's a 428% spike, and it's almost entirely driven by one department: the PUC (Public Utilities Commission), which alone accounts for $1.27 billion of that total through a single contract type.</p>
<p>To be clear: this isn't necessarily waste or fraud — the PUC regularly issues large infrastructure contracts for water, power, and sewer systems. But a $1.27 billion single-month award that bypasses the Office of Contract Administration's standard approval process is the kind of thing that deserves public scrutiny.</p>

<h2>DA Charges Filed Dropped 57% — But Discharges Doubled</h2>
<p>San Francisco · City-wide · Week of Feb 23, 2026 · Data has 10-day lag</p>
<p>The SF District Attorney's office filed charges on just 43 arrests in the week ending Feb 23 — down from a 12-week average of 99. That's a 57% drop. At the same time, discharges (arrests where the DA declined to prosecute) hit 142 — more than double the average of 62.</p>
`;

// Report without heading tags (plain text format, some reports look like this)
const PLAIN_TEXT_REPORT_HTML = `
<div>
<p><strong>Offensive Graffiti Cases Surged 437% in District 2</strong></p>
<p>San Francisco · District 2 (Marina/Pacific Heights) · Week of Feb 23, 2026</p>
<p>District 2 saw offensive graffiti 311 cases jump from an average of 3.2/week to 17 cases. That's a 437% spike across the northern neighborhoods.</p>
<p>"Offensive graffiti" means hateful, threatening, or sexually explicit content — not just tagging. This is a confirmed recent event with fresh data.</p>
<p>San Francisco · March 2026 · Data fresh as of Mar 6</p>
<p>SF Awarded $1.3 Billion in Contracts in March — 428% Above Average</p>
<p>The City awarded $1.31 billion in supplier contracts in March 2026 — a 428% spike driven by the PUC.</p>
</div>
`;

describe("extractDetailNarrative", () => {
  it("extracts only the graffiti story from a multi-story report", () => {
    const result = extractDetailNarrative(
      MULTI_STORY_REPORT_HTML,
      "Offensive Graffiti Cases Surged 437% in District 2",
    );

    expect(result).not.toBeNull();
    const allText = [...result!.above, ...result!.below].join(" ");

    // Should contain graffiti content
    expect(allText).toContain("graffiti");
    expect(allText).toContain("437%");

    // Should NOT contain content from the contracts story
    expect(allText).not.toContain("$1.31 billion");
    expect(allText).not.toContain("PUC");
    expect(allText).not.toContain("428%");

    // Should NOT contain content from the DA story
    expect(allText).not.toContain("District Attorney");
    expect(allText).not.toContain("discharges");
  });

  it("extracts only the contracts story from a multi-story report", () => {
    const result = extractDetailNarrative(
      MULTI_STORY_REPORT_HTML,
      "SF Awarded $1.3 Billion in Contracts in March — 428% Above Average",
    );

    expect(result).not.toBeNull();
    const allText = [...result!.above, ...result!.below].join(" ");

    // Should contain contracts content
    expect(allText).toContain("$1.31 billion");
    expect(allText).toContain("PUC");

    // Should NOT contain graffiti content
    expect(allText).not.toContain("graffiti");
    expect(allText).not.toContain("437%");

    // Should NOT contain DA story content
    expect(allText).not.toContain("District Attorney");
  });

  it("extracts only the DA story from a multi-story report", () => {
    const result = extractDetailNarrative(
      MULTI_STORY_REPORT_HTML,
      "DA Charges Filed Dropped 57% — But Discharges Doubled",
    );

    expect(result).not.toBeNull();
    const allText = [...result!.above, ...result!.below].join(" ");

    // Should contain DA content
    expect(allText).toContain("District Attorney");
    expect(allText).toContain("57%");

    // Should NOT contain graffiti or contracts content
    expect(allText).not.toContain("graffiti");
    expect(allText).not.toContain("$1.31 billion");
  });

  it("stops at metadata breadcrumb lines in plain text reports", () => {
    const result = extractDetailNarrative(
      PLAIN_TEXT_REPORT_HTML,
      "Offensive Graffiti Cases Surged 437% in District 2",
    );

    expect(result).not.toBeNull();
    const allText = [...result!.above, ...result!.below].join(" ");

    // Should contain graffiti content
    expect(allText).toContain("graffiti");

    // Should NOT bleed into contracts story
    expect(allText).not.toContain("$1.31 billion");
  });

  it("returns null for a headline not found in the report", () => {
    const result = extractDetailNarrative(
      MULTI_STORY_REPORT_HTML,
      "Headline That Does Not Exist In Report",
    );

    expect(result).toBeNull();
  });

  it("splits narrative into above and below sections", () => {
    const result = extractDetailNarrative(
      MULTI_STORY_REPORT_HTML,
      "Offensive Graffiti Cases Surged 437% in District 2",
    );

    expect(result).not.toBeNull();
    // Should have at least one paragraph above
    expect(result!.above.length).toBeGreaterThan(0);
  });
});
