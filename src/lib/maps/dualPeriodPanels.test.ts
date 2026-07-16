import { describe, expect, it } from "vitest";
import type { SavedMap } from "@/lib/apiClient";
import { buildChoroplethDualPanels } from "./dualPeriodPanels";

function savedMap(aggregations: Record<string, { rows: unknown[] }>): SavedMap {
  return {
    id: 1,
    short_hash: "",
    title: "Test",
    description: null,
    map_type: "choropleth",
    location_data: [],
    map_config: { aggregations },
    bounds: null,
    center: null,
    city_id: 1,
    metric_id: 1,
    query_source: null,
    is_public: false,
    view_count: 0,
    user_id: null,
    created_at: "",
    updated_at: "",
  };
}

describe("buildChoroplethDualPanels", () => {
  it("returns prior and current panels when both periods have aggregation data", () => {
    const current = savedMap({ "10": { rows: [{ id: "a", count: 5 }] } });
    const prior = savedMap({ "10": { rows: [{ id: "a", count: 2 }] } });
    const panels = buildChoroplethDualPanels(
      current,
      prior,
      { kind: "choropleth", shapeLayerId: "10", label: "Districts" },
      { prior: "2024", current: "2025" }
    );

    expect(panels).not.toBeNull();
    expect(panels).toHaveLength(2);
    expect(panels![0].label).toBe("2024");
    expect(panels![1].label).toBe("2025");
    expect(panels![0].lockedViewKey).toBe("choro:10");
    expect(panels![1].lockedViewKey).toBe("choro:10");
  });

  it("returns null when comparison map is missing", () => {
    const current = savedMap({ "10": { rows: [{ id: "a" }] } });
    const panels = buildChoroplethDualPanels(
      current,
      null,
      { kind: "choropleth", shapeLayerId: "10", label: "Districts" },
      { prior: "2024", current: "2025" }
    );
    expect(panels).toBeNull();
  });

  it("returns null when shape layer has no comparison aggregation", () => {
    const current = savedMap({ "10": { rows: [{ id: "a" }] } });
    const prior = savedMap({ "20": { rows: [{ id: "b" }] } });
    const panels = buildChoroplethDualPanels(
      current,
      prior,
      { kind: "choropleth", shapeLayerId: "10", label: "Districts" },
      { prior: "2024", current: "2025" }
    );
    expect(panels).toBeNull();
  });
});
