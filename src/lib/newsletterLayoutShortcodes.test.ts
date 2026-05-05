import { describe, it, expect } from "vitest";
import { expand, ShortcodeError } from "./newsletterLayoutShortcodes";

describe("expand()", () => {
  it("expands eyebrow", () => {
    const out = expand('[eyebrow text="LEAD STORY · YOUR DISTRICT"]');
    expect(out).toContain("LEAD STORY · YOUR DISTRICT");
    expect(out).toContain("color:#ad35fa");
    expect(out).toContain("text-transform:uppercase");
  });

  it("expands a Block Brief card with all attributes", () => {
    const out = expand(
      '[card stat="6 days" sublabel="AT ONE ADDRESS" headline="A short sentence" body="Body text" url="/c/sf/stories/x"]'
    );
    expect(out).toContain("6 days");
    expect(out).toContain("AT ONE ADDRESS");
    expect(out).toContain("A short sentence");
    expect(out).toContain("Body text");
    expect(out).toContain('href="/c/sf/stories/x"');
    expect(out).toContain("font-size:32px");
  });

  it("drops big stat font size when over 9 chars", () => {
    const out = expand('[card stat="$1,234,567" headline="X" body="Y" url="#"]');
    expect(out).toContain("font-size:28px");
    expect(out).not.toContain("font-size:32px");
  });

  it("expands scorecard with metrics and badge colors", () => {
    const out = expand(
      `[scorecard city="San Francisco" year_compare="2026 YTD vs. 2025 YTD" dashboard_url="/c/sf" city_slug="sf"]
  [metric name="Noise" key="noise" date_range="YTD" source_url="https://x" prior_label="2025 YTD" prior_value="2,743" current_label="2026 YTD" current_value="3,127" pct="14.0" delta="+384" direction="up" favorable="false"]
  [metric name="Permits" key="permits" date_range="YTD" source_url="https://x" prior_label="2025 YTD" prior_value="256" current_label="2026 YTD" current_value="312" pct="21.9" delta="+56" direction="up" favorable="true"]
[/scorecard]`
    );
    expect(out).toContain("San Francisco");
    expect(out).toContain("2026 YTD vs. 2025 YTD");
    expect(out).toContain("CITYWIDE SCORECARD");
    expect(out).toContain("/c/sf/metrics/noise");
    expect(out).toContain("/c/sf/metrics/permits");
    // Up-on-bad metric → red badge
    expect(out).toMatch(/Noise[\s\S]*?#fee2e2/);
    expect(out).toMatch(/Noise[\s\S]*?#dc2626/);
    // Up-on-good metric → green badge
    expect(out).toMatch(/Permits[\s\S]*?#dcfce7/);
    expect(out).toMatch(/Permits[\s\S]*?#16a34a/);
    // Arrows present (HTML entities)
    expect(out).toContain("&#8593;");
  });

  it("colors a down-on-bad metric green (good news)", () => {
    const out = expand(
      `[scorecard city="X" year_compare="Y" dashboard_url="#" city_slug="sf"]
  [metric name="Crime" key="crime" date_range="YTD" source_url="#" prior_label="2025" prior_value="100" current_label="2026" current_value="80" pct="20.0" delta="−20" direction="down" favorable="true"]
[/scorecard]`
    );
    expect(out).toContain("#dcfce7");
    expect(out).toContain("&#8595;");
  });

  it("expands an event with date block and link", () => {
    const out = expand(
      '[event weekday="Mon" day="06" month="May" title="Land Use Committee" meta="Room 263 · 1:30 PM" link_label="Agenda" link_url="https://sfbos.org/agenda"]'
    );
    expect(out).toContain("Mon");
    expect(out).toContain("06");
    expect(out).toContain("May");
    expect(out).toContain("Land Use Committee");
    expect(out).toContain("Room 263 · 1:30 PM");
    expect(out).toContain('href="https://sfbos.org/agenda"');
    expect(out).toContain("background:#f5f0ff");
  });

  it("leaves unknown shortcodes in place", () => {
    const out = expand("[banner color=\"red\"]");
    expect(out).toContain("[banner");
  });

  it("leaves visualization shortcodes alone", () => {
    const out = expand("<p>[chart:42]</p><p>[map:abc123]</p><p>[anomaly:7]</p>");
    expect(out).toContain("[chart:42]");
    expect(out).toContain("[map:abc123]");
    expect(out).toContain("[anomaly:7]");
  });

  it("throws on unclosed scorecard", () => {
    expect(() =>
      expand(`[scorecard city="x" year_compare="y" dashboard_url="#" city_slug="sf"]
  [metric name="y" key="y" date_range="YTD" source_url="#" prior_label="x" prior_value="1" current_label="x" current_value="1" pct="0" delta="0" direction="flat" favorable="false"]`)
    ).toThrow(ShortcodeError);
  });

  it("passes raw HTML through unchanged", () => {
    const html = '<p style="margin:0;">Hello <strong>world</strong></p>';
    expect(expand(html)).toBe(html);
  });

  it("allows visualization shortcodes inside a card body", () => {
    const out = expand(
      '[card stat="X" headline="H" body="See [chart:42] for the trend." url="#"]'
    );
    expect(out).toContain("[chart:42]");
    expect(out).toContain("See [chart:42] for the trend.");
  });

  it("allows brackets inside attribute values", () => {
    const out = expand(
      '[card stat="6 days" headline="Coverage of [200-300] Valencia" body="Body" url="#"]'
    );
    expect(out).toContain("Coverage of [200-300] Valencia");
    expect(out).not.toContain('Valencia"]');
  });
});
