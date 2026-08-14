import { describe, it, expect } from "vitest";
import {
  NEWSLETTER_PERSONA_PRESETS,
  MAX_PERSONA_SELECTIONS,
  LEGACY_PERSONA_ID_MAP,
  normalizePersonaSelections,
} from "./newsletterPersonaPresets";

describe("NEWSLETTER_PERSONA_PRESETS", () => {
  it("has exactly 10 presets", () => {
    expect(NEWSLETTER_PERSONA_PRESETS).toHaveLength(10);
  });

  it("each preset has a non-empty id, label, and detailPlaceholder", () => {
    for (const preset of NEWSLETTER_PERSONA_PRESETS) {
      expect(preset.id, `id missing on ${preset.label}`).toBeTruthy();
      expect(preset.label, `label missing on ${preset.id}`).toBeTruthy();
      expect(
        preset.detailPlaceholder,
        `placeholder missing on ${preset.id}`
      ).toBeTruthy();
    }
  });

  it("all ids are unique", () => {
    const ids = NEWSLETTER_PERSONA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("MAX_PERSONA_SELECTIONS", () => {
  it("is 3", () => {
    expect(MAX_PERSONA_SELECTIONS).toBe(3);
  });
});

describe("LEGACY_PERSONA_ID_MAP", () => {
  it("maps every legacy id to a current preset id", () => {
    const validIds = new Set(NEWSLETTER_PERSONA_PRESETS.map((p) => p.id));
    for (const [legacy, current] of Object.entries(LEGACY_PERSONA_ID_MAP)) {
      expect(validIds.has(current), `${legacy} → ${current} not a preset`).toBe(
        true
      );
    }
  });
});

describe("normalizePersonaSelections", () => {
  it("passes current ids through unchanged", () => {
    const input = [
      { id: "commuter", detail: "train" },
      { id: "renter", detail: "" },
    ];
    expect(normalizePersonaSelections(input)).toEqual(input);
  });

  it("migrates legacy ids to current ids", () => {
    const result = normalizePersonaSelections([
      { id: "real-estate-owner", detail: "duplex" },
      { id: "crime-watcher", detail: "" },
    ]);
    expect(result).toEqual([
      { id: "homeowner", detail: "duplex" },
      { id: "safety-neighbor", detail: "" },
    ]);
  });

  it("keeps the government personas as first-class ids", () => {
    const input = [
      { id: "elected-official", detail: "District 6 Supervisor" },
      { id: "city-staff", detail: "" },
    ];
    expect(normalizePersonaSelections(input)).toEqual(input);
  });

  it("de-duplicates diner + shopper into a single local-explorer, keeping first non-empty detail", () => {
    const result = normalizePersonaSelections([
      { id: "frequent-diner", detail: "" },
      { id: "frequent-shopper", detail: "Valencia" },
    ]);
    expect(result).toEqual([{ id: "local-explorer", detail: "Valencia" }]);
  });

  it("drops unknown ids", () => {
    const result = normalizePersonaSelections([
      { id: "unknown-xyz", detail: "test" },
      { id: "commuter", detail: "" },
    ]);
    expect(result).toEqual([{ id: "commuter", detail: "" }]);
  });

  it("caps at MAX_PERSONA_SELECTIONS", () => {
    const result = normalizePersonaSelections([
      { id: "commuter", detail: "" },
      { id: "renter", detail: "" },
      { id: "homeowner", detail: "" },
      { id: "civic-watchdog", detail: "" },
    ]);
    expect(result).toHaveLength(MAX_PERSONA_SELECTIONS);
  });
});
