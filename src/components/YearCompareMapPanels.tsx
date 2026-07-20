"use client";

import { useMemo, useState } from "react";
import type { SavedMap } from "@/lib/apiClient";
import ProgressiveMapView from "./ProgressiveMapView";
import {
  resolveYearComparePanels,
  type YearComparePanel,
} from "@/lib/maps/yearComparePanels";
import type { DualPeriodPanelSpec } from "@/lib/maps/dualPeriodPanels";
import type { ChoroplethBasemapTheme } from "@/lib/mapUtils";
import "./YearCompareMapPanels.css";

type Props = {
  map: SavedMap;
  height?: number;
  mapBasemapTheme?: ChoroplethBasemapTheme;
  onError?: (error: string) => void;
  /** Compact chrome for iframe / thumbnail embeds. */
  compact?: boolean;
};

function panelMapData(map: SavedMap, panel: YearComparePanel): SavedMap {
  const baseConfig =
    map.map_config && typeof map.map_config === "object" ? map.map_config : {};
  return {
    ...map,
    title: `${map.title || "Map"} — ${panel.label}`,
    location_data: panel.points as SavedMap["location_data"],
    map_config: {
      ...baseConfig,
      // Avoid recursive year-panel detection inside ProgressiveMapView consumers.
      year_compare: false,
      layout: undefined,
      default_view: { type: "points", display_name: null, identifier_field: null },
      available_views: [
        { type: "points", is_default: true, point_count: panel.points.length },
      ],
      // Keep series coloring; drop choropleth aggregations so each panel stays points.
      aggregations: {},
    },
  };
}

export default function YearCompareMapPanels({
  map,
  height = 420,
  mapBasemapTheme = "light",
  onError,
  compact = false,
}: Props) {
  const panels = useMemo(
    () =>
      resolveYearComparePanels(
        (map.location_data || []) as Array<Record<string, unknown>>,
        map.map_config as Record<string, unknown>
      ),
    [map.location_data, map.map_config]
  );

  const seriesField = map.map_config?.series_field as string | undefined;
  const seriesColors = map.map_config?.series_colors as
    | Record<string, string>
    | undefined;
  const seriesValues = map.map_config?.series_values as string[] | undefined;
  const seriesLabels =
    seriesField && seriesColors
      ? (Array.isArray(seriesValues) ? seriesValues : Object.keys(seriesColors)).filter(
          (v) => !!seriesColors[v]
        )
      : [];

  const [legendCollapsed, setLegendCollapsed] = useState(false);

  if (!panels || panels.length < 2) return null;

  const itemNoun = (map.map_config?.item_noun as string | undefined)?.trim();
  const panelHeight = Math.max(220, Math.round(height * (compact ? 0.95 : 1)));

  return (
    <div
      className={`year-compare-map-panels${compact ? " year-compare-map-panels--compact" : ""}`}
    >
      <div className="year-compare-map-grid">
        {panels.map((panel) => (
          <section key={panel.year} className="year-compare-map-panel">
            <header className="year-compare-map-panel-header">
              <h3 className="year-compare-map-panel-title">{panel.label}</h3>
              <span className="year-compare-map-panel-count">
                {panel.points.length.toLocaleString()}
                {itemNoun ? ` ${itemNoun}` : ""}
              </span>
            </header>
            <ProgressiveMapView
              key={`year-panel-${map.short_hash || map.id}-${panel.year}`}
              mapData={panelMapData(map, panel)}
              mapHash={map.short_hash || ""}
              height={panelHeight}
              onError={onError}
              mapBasemapTheme={mapBasemapTheme}
              lockedViewKey="points"
            />
          </section>
        ))}
      </div>

      {seriesLabels.length > 0 && (
        legendCollapsed ? (
          <button
            type="button"
            className="year-compare-legend-collapsed"
            aria-expanded={false}
            onClick={() => setLegendCollapsed(false)}
          >
            Legend <span aria-hidden="true">▸</span>
          </button>
        ) : (
          <div
            className="year-compare-legend"
            role="button"
            tabIndex={0}
            aria-expanded={true}
            title="Tap to minimize legend"
            onClick={() => setLegendCollapsed(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setLegendCollapsed(true);
              }
            }}
          >
            <span className="year-compare-legend-title">
              {seriesField || "Type"}
            </span>
            <div className="year-compare-legend-items">
              {seriesLabels.map((label) => (
                <div key={String(label)} className="year-compare-legend-item">
                  <span
                    className="year-compare-legend-swatch"
                    style={{ backgroundColor: seriesColors![label] ?? "#ad35fa" }}
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <span className="year-compare-legend-chevron" aria-hidden="true">
              ▾
            </span>
          </div>
        )
      )}
    </div>
  );
}

type DualPeriodMapPanelsProps = {
  panels: DualPeriodPanelSpec[];
  height?: number;
  mapBasemapTheme?: ChoroplethBasemapTheme;
  onError?: (error: string) => void;
  compact?: boolean;
};

/** Side-by-side maps for two explicit periods (e.g. choropleth shape layers). */
export function DualPeriodMapPanels({
  panels,
  height = 420,
  mapBasemapTheme = "light",
  onError,
  compact = false,
}: DualPeriodMapPanelsProps) {
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  if (panels.length < 2) return null;

  const panelHeight = Math.max(220, Math.round(height * (compact ? 0.95 : 1)));

  return (
    <div
      className={`year-compare-map-panels${compact ? " year-compare-map-panels--compact" : ""}`}
    >
      <div className="year-compare-map-grid">
        {panels.map((panel) => (
          <section key={panel.label} className="year-compare-map-panel">
            <header className="year-compare-map-panel-header">
              <h3 className="year-compare-map-panel-title">{panel.label}</h3>
              {panel.count != null && (
                <span className="year-compare-map-panel-count">
                  {panel.count.toLocaleString()}
                  {panel.countNoun ? ` ${panel.countNoun}` : ""}
                </span>
              )}
            </header>
            <ProgressiveMapView
              key={`dual-period-${panel.lockedViewKey}-${panel.label}`}
              mapData={panel.mapData}
              mapHash=""
              height={panelHeight}
              onError={onError}
              mapBasemapTheme={mapBasemapTheme}
              lockedViewKey={panel.lockedViewKey}
            />
          </section>
        ))}
      </div>

      {legendCollapsed ? (
        <button
          type="button"
          className="year-compare-legend-collapsed"
          aria-expanded={false}
          onClick={() => setLegendCollapsed(false)}
        >
          Legend <span aria-hidden="true">▸</span>
        </button>
      ) : null}
    </div>
  );
}

export function mapSupportsYearComparePanels(map: SavedMap | null | undefined): boolean {
  if (!map || map.map_type === "multi_layer" || map.map_type === "choropleth" || map.map_type === "delta") {
    return false;
  }
  const panels = resolveYearComparePanels(
    (map.location_data || []) as Array<Record<string, unknown>>,
    map.map_config as Record<string, unknown>
  );
  return !!panels && panels.length >= 2;
}
