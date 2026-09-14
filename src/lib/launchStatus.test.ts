import { describe, expect, it } from "vitest";
import { resolveLaunchStatus } from "./launchStatus";

describe("resolveLaunchStatus", () => {
  it("prefers launch_status over booleans", () => {
    expect(
      resolveLaunchStatus({
        launch_status: "dark_launched",
        is_launched: true,
      })
    ).toBe("dark_launched");
  });

  it("falls back from legacy flags", () => {
    expect(resolveLaunchStatus({ is_launched: true })).toBe("launched");
    expect(resolveLaunchStatus({ is_dark_launched: true })).toBe("dark_launched");
    expect(resolveLaunchStatus({})).toBe("not_launched");
  });
});
