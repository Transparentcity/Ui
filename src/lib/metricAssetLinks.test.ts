import { describe, expect, it } from "vitest";
import { absoluteUrl, iframeSnippet } from "./metricAssetLinks";

describe("absoluteUrl", () => {
  it("prefixes site-relative paths with the origin", () => {
    expect(absoluteUrl("/m/AbC-12", "https://transparent.city/")).toBe(
      "https://transparent.city/m/AbC-12",
    );
  });

  it("leaves absolute URLs alone", () => {
    expect(absoluteUrl("https://example.com/x", "https://transparent.city")).toBe(
      "https://example.com/x",
    );
  });
});

describe("iframeSnippet", () => {
  it("builds an escaped iframe at the kind's default height", () => {
    const html = iframeSnippet(
      "/t/12?embedded=true&period=ytd",
      'Incidents "YTD"',
      "chart",
      "https://transparent.city",
    );
    expect(html).toBe(
      '<iframe src="https://transparent.city/t/12?embedded=true&amp;period=ytd" ' +
        'title="Incidents &quot;YTD&quot;" width="100%" height="480" ' +
        'style="border:0;" loading="lazy"></iframe>',
    );
  });
});
