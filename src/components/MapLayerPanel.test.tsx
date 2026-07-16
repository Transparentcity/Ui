import { describe, expect, it } from "vitest";

import { getLayerIcon } from "./MapLayerPanel";

describe("getLayerIcon", () => {
  it("uses an emoji embedded in the instance display name", () => {
    expect(
      getLayerIcon(
        "sf_supervisor_districts",
        "governance",
        "🗳️ Supervisor Districts",
        "🏛️"
      )
    ).toBe("🗳️");
  });

  it("prefers neighborhood display semantics over a stale district template", () => {
    expect(
      getLayerIcon(
        "seattle_council_districts",
        "governance",
        "SF Analysis Neighborhoods"
      )
    ).toBe("🏘️");
  });

  it("prefers police display semantics over the generic district match", () => {
    expect(
      getLayerIcon(
        "detroit_council_districts",
        "governance",
        "San Francisco Police Districts"
      )
    ).toBe("🚔");
  });
});
