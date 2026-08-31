import { describe, it, expect } from "vitest";

import { LAYER_COLOR_PALETTE, getStableColorForKey, mixHex } from "./layerColors";

describe("getStableColorForKey", () => {
  it("gives a key the same palette color every time", () => {
    expect(getStableColorForKey("assaults")).toBe(getStableColorForKey("assaults"));
    expect(LAYER_COLOR_PALETTE).toContain(getStableColorForKey("assaults"));
  });
});

describe("mixHex", () => {
  it("returns each end of the blend untouched", () => {
    expect(mixHex("#ff6b5a", "#ffffff", 1)).toBe("#ff6b5a");
    expect(mixHex("#ff6b5a", "#ffffff", 0)).toBe("#ffffff");
  });

  it("blends channel by channel", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });

  it("keeps a tint recognizably close to its base but much lighter", () => {
    const tint = mixHex("var(--success)", "#ffffff", 0.22);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    // Still green — the middle channel leads, as in the source color.
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    // ...but pale enough for dark text or an emoji to sit on top of it.
    expect(Math.min(r, g, b)).toBeGreaterThan(190);
  });

  it("accepts shorthand hex and clamps out-of-range weights", () => {
    expect(mixHex("#fff", "#000", 0.5)).toBe("#808080");
    expect(mixHex("#ff6b5a", "#ffffff", 4)).toBe("#ff6b5a");
    expect(mixHex("#ff6b5a", "#ffffff", -2)).toBe("#ffffff");
  });

  it("mixes toward a dark face for dark mode", () => {
    const tint = mixHex("var(--success)", "#0f172a", 0.22);
    const channels = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    expect(Math.max(...channels)).toBeLessThan(90);
  });
});
