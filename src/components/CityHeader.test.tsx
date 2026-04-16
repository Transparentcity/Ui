/**
 * Regression test for the "Oaklan / d" mid-word wrap bug in the mobile city header.
 *
 * At narrow viewports, the CityHeader flex row (hamburger + emoji + city name +
 * "Mayor: ..." subtitle + Following button) can squeeze .city-name tight enough
 * that mid-word break rules cause "Oakland" to render as "Oaklan" / "d".
 *
 * The fix: at <=768px, .city-name uses `white-space: nowrap` + ellipsis, not
 * `word-break: break-word`. jsdom does not perform layout, so we verify this at
 * the CSS-source level.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("CityHeader mobile .city-name CSS", () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, "./CityView.css"),
    "utf8",
  );

  // Isolate all `.city-name { ... }` rule bodies and pick the mobile one —
  // uniquely identified by font-size: 18px (the narrow-viewport override).
  const cityNameBlocks = Array.from(
    css.matchAll(/(?:^|\s|\})\.city-name\s*\{([^}]*)\}/g),
  ).map((m) => m[1]);
  const mobileBody =
    cityNameBlocks.find((b) => /font-size\s*:\s*18px/.test(b)) ?? "";

  it("defines a mobile-specific .city-name rule", () => {
    expect(mobileBody).not.toBe("");
  });

  const body = mobileBody;

  it("does not re-introduce word-break: break-word (the root cause of the bug)", () => {
    expect(body).not.toMatch(/word-break\s*:\s*break-word/);
    expect(body).not.toMatch(/word-break\s*:\s*break-all/);
    expect(body).not.toMatch(/overflow-wrap\s*:\s*anywhere/);
  });

  it("keeps the city name on a single line with an ellipsis fallback", () => {
    expect(body).toMatch(/white-space\s*:\s*nowrap/);
    expect(body).toMatch(/overflow\s*:\s*hidden/);
    expect(body).toMatch(/text-overflow\s*:\s*ellipsis/);
  });

  it("sets min-width: 0 so the flex child can shrink below its content width", () => {
    expect(body).toMatch(/min-width\s*:\s*0/);
  });
});
