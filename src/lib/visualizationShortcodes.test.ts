import { describe, expect, it } from "vitest";
import { processVisualizationShortcodes } from "./visualizationShortcodes";

describe("processVisualizationShortcodes", () => {
  it("removes feed-image shortcodes and keeps chart shortcodes", () => {
    const input =
      "<p>x</p>[feed-image:some description]<p>[chart:7]</p>";
    const out = processVisualizationShortcodes(input, { showDebug: false });
    expect(out).not.toMatch(/\[feed-image:/i);
    expect(out).toContain("chart-embed");
    expect(out).toContain("data-chart-id=\"7\"");
  });
});
