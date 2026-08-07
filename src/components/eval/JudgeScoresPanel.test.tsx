import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatFactualError } from "./JudgeScoresPanel";

describe("formatFactualError", () => {
  it("bolds the quoted incorrect claim", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        formatFactualError(
          '"273 this year versus 176 last year" — Tool 40 capped at 200 rows'
        )
      )
    );
    expect(html).toContain("<strong");
    expect(html).toContain("273 this year versus 176 last year");
    expect(html).toContain("Tool 40 capped at 200 rows");
  });

  it("bolds claim text before an em dash without quotes", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        formatFactualError("up 55% — prior-year base unverified")
      )
    );
    expect(html).toContain("<strong");
    expect(html).toContain("up 55%");
    expect(html).toContain("prior-year base unverified");
  });

  it("returns plain text when there is no claim/reason split", () => {
    expect(formatFactualError("unsupported figure")).toBe("unsupported figure");
  });
});
