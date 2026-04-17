import { describe, expect, it } from "vitest";
import {
  articleUsesPrimaryVisualizationShortcode,
  buildPrimaryVisualizationShortcodeConfig,
  processVisualizationShortcodes,
  getChartEmbed,
  getMapEmbed,
  getAnomalyEmbed,
  extractVisualizationRefs,
  hasVisualizationShortcodes,
} from "./visualizationShortcodes";

describe("processVisualizationShortcodes", () => {
  it("removes feed-image shortcodes and keeps chart shortcodes", () => {
    const input =
      "<p>x</p>[feed-image:some description]<p>[chart:7]</p>";
    const out = processVisualizationShortcodes(input, { showDebug: false });
    expect(out).not.toMatch(/\[feed-image:/i);
    expect(out).toContain("chart-embed");
    expect(out).toContain('data-chart-id="7"');
  });

  it("replaces chart shortcodes with iframe embeds", () => {
    const out = processVisualizationShortcodes("<p>[chart:42]</p>", {
      showDebug: false,
    });
    expect(out).toContain('src="/t/42?embedded=true"');
    expect(out).toContain('data-chart-id="42"');
  });

  it("replaces map shortcodes with iframe embeds", () => {
    const out = processVisualizationShortcodes("[map:AzOP6s-N]", {
      showDebug: false,
    });
    expect(out).toContain('src="/m/AzOP6s-N?embedded=true"');
    expect(out).toContain('data-map-hash="AzOP6s-N"');
  });

  it("handles map hashes with underscores", () => {
    const out = processVisualizationShortcodes("[map:915Xp_iU]", {
      showDebug: false,
    });
    expect(out).toContain('data-map-hash="915Xp_iU"');
  });

  it("renders a static image when a matching map asset is provided", () => {
    const out = processVisualizationShortcodes("[map:AzOP6s-N]", {
      showDebug: false,
      staticVisualizations: {
        maps: {
          "AzOP6s-N": {
            src: "/api/feed/public/story-image/abc123",
            alt: "Austin service map",
            caption: "Calls are concentrated downtown.",
          },
        },
      },
    });
    expect(out).toContain('src="/api/feed/public/story-image/abc123"');
    expect(out).toContain('alt="Austin service map"');
    expect(out).toContain("visualization-static-caption");
    expect(out).toContain("viz-deferred-interactive");
    expect(out).toContain('data-deferred-src="/m/AzOP6s-N?embedded=true"');
    expect(out).not.toMatch(/<iframe[^>]*\ssrc="\/m\/AzOP6s-N/);
  });

  it("can omit deferred interactive when deferInteractiveForStaticEmbeds is false", () => {
    const out = processVisualizationShortcodes("[map:AzOP6s-N]", {
      showDebug: false,
      deferInteractiveForStaticEmbeds: false,
      staticVisualizations: {
        maps: {
          "AzOP6s-N": {
            src: "/api/feed/public/story-image/abc123",
            alt: "Map",
          },
        },
      },
    });
    expect(out).toContain('src="/api/feed/public/story-image/abc123"');
    expect(out).not.toContain("viz-deferred-interactive");
    expect(out).not.toContain("data-deferred-src=");
  });

  it("replaces anomaly shortcodes with iframe embeds", () => {
    const out = processVisualizationShortcodes("[anomaly:99]", {
      showDebug: false,
    });
    expect(out).toContain('src="/a/99?embedded=true"');
    expect(out).toContain('data-anomaly-id="99"');
  });

  it("handles multiple shortcodes of different types", () => {
    const input = "[chart:1] then [map:abc] then [anomaly:2]";
    const out = processVisualizationShortcodes(input, { showDebug: false });
    expect(out).toContain("chart-embed");
    expect(out).toContain("map-embed");
    expect(out).toContain("anomaly-embed");
  });

  it("returns empty string for empty input", () => {
    expect(processVisualizationShortcodes("")).toBe("");
  });

  it("returns original HTML when no shortcodes present", () => {
    const html = "<p>No shortcodes here</p>";
    expect(processVisualizationShortcodes(html)).toBe(html);
  });

  it("strips all feed-image shortcodes (case-insensitive)", () => {
    const input = "[feed-image:photo][FEED-IMAGE:another]<p>text</p>";
    const out = processVisualizationShortcodes(input);
    expect(out).not.toMatch(/feed-image/i);
    expect(out).toContain("<p>text</p>");
  });
});

describe("getChartEmbed", () => {
  it("uses custom height when provided", () => {
    const out = getChartEmbed(5, { chartHeight: "600px", showDebug: false });
    expect(out).toContain('height="600px"');
  });

  it("shows debug label by default", () => {
    const out = getChartEmbed(5);
    expect(out).toContain("visualization-embed-debug");
    expect(out).toContain("[chart:5]");
  });

  it("hides debug label when showDebug is false", () => {
    const out = getChartEmbed(5, { showDebug: false });
    expect(out).not.toContain("visualization-embed-debug");
  });

  it("escapes HTML in shortcode attribute", () => {
    // The shortcode itself is safe, but test the escaping function
    const out = getChartEmbed(5, { showDebug: false });
    expect(out).toContain('data-shortcode="[chart:5]"');
  });
});

describe("getMapEmbed", () => {
  it("generates correct iframe src", () => {
    const out = getMapEmbed("abc123", { showDebug: false });
    expect(out).toContain('src="/m/abc123?embedded=true"');
  });

  it("uses mapHeight config", () => {
    const out = getMapEmbed("abc", { mapHeight: "700px", showDebug: false });
    expect(out).toContain('height="700px"');
  });
});

describe("getAnomalyEmbed", () => {
  it("generates correct iframe src", () => {
    const out = getAnomalyEmbed(42, { showDebug: false });
    expect(out).toContain('src="/a/42?embedded=true"');
  });

  it("uses anomalyHeight config", () => {
    const out = getAnomalyEmbed(1, {
      anomalyHeight: "350px",
      showDebug: false,
    });
    expect(out).toContain('height="350px"');
  });
});

describe("extractVisualizationRefs", () => {
  it("extracts chart, map, and anomaly refs", () => {
    const html = "[chart:1][chart:2][map:abc][map:def-gh][anomaly:3]";
    const refs = extractVisualizationRefs(html);
    expect(refs.charts).toEqual([1, 2]);
    expect(refs.maps).toEqual(["abc", "def-gh"]);
    expect(refs.anomalies).toEqual([3]);
  });

  it("returns empty arrays for no shortcodes", () => {
    const refs = extractVisualizationRefs("<p>plain html</p>");
    expect(refs.charts).toEqual([]);
    expect(refs.maps).toEqual([]);
    expect(refs.anomalies).toEqual([]);
  });

  it("returns empty arrays for empty/null input", () => {
    const refs = extractVisualizationRefs("");
    expect(refs.charts).toEqual([]);
    expect(refs.maps).toEqual([]);
    expect(refs.anomalies).toEqual([]);
  });

  it("handles maps with underscores", () => {
    const refs = extractVisualizationRefs("[map:a_b_c]");
    expect(refs.maps).toEqual(["a_b_c"]);
  });
});

describe("hasVisualizationShortcodes", () => {
  it("returns true for chart shortcodes", () => {
    expect(hasVisualizationShortcodes("[chart:1]")).toBe(true);
  });

  it("returns true for map shortcodes", () => {
    expect(hasVisualizationShortcodes("[map:abc-123]")).toBe(true);
  });

  it("returns true for anomaly shortcodes", () => {
    expect(hasVisualizationShortcodes("[anomaly:5]")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(hasVisualizationShortcodes("no shortcodes")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasVisualizationShortcodes("")).toBe(false);
  });

  it("returns false for feed-image shortcodes (not visualization)", () => {
    expect(hasVisualizationShortcodes("[feed-image:photo]")).toBe(false);
  });
});

describe("primary visualization helpers", () => {
  it("builds static map config from story image fields", () => {
    const config = buildPrimaryVisualizationShortcodeConfig({
      image_url: "/api/feed/public/story-image/hash123",
      image_alt: "Austin map",
      image_caption: "Caption",
      visualization_type: "map",
      primary_visualization: { short_hash: "AzOP6s-N", type: "map" },
    });

    expect(config.staticVisualizations?.maps?.["AzOP6s-N"]).toEqual({
      src: "/api/feed/public/story-image/hash123",
      alt: "Austin map",
      caption: "Caption",
    });
  });

  it("detects when article_html references the primary visualization shortcode", () => {
    expect(
      articleUsesPrimaryVisualizationShortcode("<p>[map:AzOP6s-N]</p>", {
        visualization_type: "map",
        primary_visualization: { short_hash: "AzOP6s-N", type: "map" },
      }),
    ).toBe(true);
  });
});
