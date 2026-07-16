"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import Loader from "./Loader";
import "./MapLayerPanel.css";

interface ShapeLayer {
  shape_layer_instance_id: number;
  identifier_field: string;
  display_name: string;
  layer_key?: string;
  category?: string;
  icon?: string;
}

/** Backend-provided view metadata (default_view / available_views from map_config). */
interface AvailableView {
  type: "points" | "choropleth";
  point_count?: number;
  shape_layer_instance_id?: number;
  identifier_field?: string;
  display_name?: string;
  row_count?: number;
  is_default?: boolean;
  is_city_district?: boolean;
}

/** Category order matching dashboard (CityMapView): governance first, then neighborhood, planning, then other. */
function getCategoryRank(category?: string | null, displayName?: string, layerKey?: string): number {
  const c = (category || "").toLowerCase();
  const name = (displayName || "").toLowerCase();
  const key = (layerKey || "").toLowerCase();
  if (c === "governance" || name.includes("district") || name.includes("ward") || key.includes("district") || key.includes("ward")) return 0;
  if (c === "neighborhood" || name.includes("neighborhood") || key.includes("neighborhood")) return 1;
  if (c === "planning") return 2;
  return 3;
}

/** Governance-type order within governance category: district first, then ward, precinct. */
function getGovernanceTypeRank(displayName?: string, layerKey?: string): number {
  const name = (displayName || "").toLowerCase();
  const key = (layerKey || "").toLowerCase();
  if (name.includes("district") || key.includes("district")) return 0;
  if (name.includes("ward") || key.includes("ward")) return 1;
  if (name.includes("precinct") || key.includes("precinct")) return 2;
  return 99;
}

/** Sort shape layers the same way as the dashboard (CityMapView): category, then governance type, then name. */
function sortShapeLayersLikeDashboard<T extends { display_name: string; category?: string; layer_key?: string }>(layers: T[]): T[] {
  return [...layers].sort((a, b) => {
    const ar = getCategoryRank(a.category, a.display_name, a.layer_key);
    const br = getCategoryRank(b.category, b.display_name, b.layer_key);
    if (ar !== br) return ar - br;
    if (ar === 0) {
      const at = getGovernanceTypeRank(a.display_name, a.layer_key);
      const bt = getGovernanceTypeRank(b.display_name, b.layer_key);
      if (at !== bt) return at - bt;
    }
    return (a.display_name || "").localeCompare(b.display_name || "");
  });
}

interface MapLayerPanelProps {
  /** Legacy: list of shape layers. Ignored when availableViews is provided. */
  availableShapeLayers: ShapeLayer[];
  /** When provided, shape layers are derived from choropleth entries (plan: available_views). */
  availableViews?: AvailableView[];
  selectedShapeLayer: string | null;
  onShapeLayerSelect: (shapeLayerId: string) => void;
  showDots: boolean;
  onToggleDots: () => void;
  canShowDots?: boolean;
  /** When set, show loading indicator for the selected choropleth view (lazy-loading). */
  loadingViewId?: string | null;
  /** Reverse the header toggle arrows for embedded map layouts. */
  reverseToggleArrowDirection?: boolean;
}

// Prefer instance display metadata over template metadata. Some older instances
// are attached to templates from another city, so their template layer key and
// category do not reliably describe the instance.
export const getLayerIcon = (
  layerKey?: string,
  category?: string,
  displayName?: string,
  configuredIcon?: string
): string => {
  const key = (layerKey || "").toLowerCase();
  const cat = (category || "").toLowerCase();
  const name = (displayName || "").toLowerCase();
  const displayIcon = displayName?.trim().match(/^\p{Extended_Pictographic}\uFE0F?/u)?.[0];

  if (displayIcon) return displayIcon;

  // Use the city-specific display name before potentially stale template fields.
  if (name.includes("neighborhood")) {
    return "🏘️";
  }
  if (name.includes("police")) {
    return "🚔";
  }
  if (name.includes("census")) {
    return "📊";
  }
  if (name.includes("zip")) {
    return "📮";
  }
  if (name.includes("district") || name.includes("ward")) {
    return "🗺️";
  }

  if (configuredIcon?.trim()) return configuredIcon.trim();

  if (key.includes("neighborhood") || cat === "neighborhood") return "🏘️";
  if (key.includes("police")) return "🚔";
  if (key.includes("census")) return "📊";
  if (key.includes("zip")) return "📮";
  if (
    key.includes("district") ||
    key.includes("ward") ||
    cat === "governance"
  ) {
    return "🗺️";
  }

  return "📍";
};

function deriveShapeLayersFromViews(availableViews: AvailableView[]): ShapeLayer[] {
  return availableViews
    .filter(
      (v): v is AvailableView & { shape_layer_instance_id: number; identifier_field: string; display_name: string } =>
        v.type === "choropleth" &&
        v.shape_layer_instance_id != null &&
        v.identifier_field != null
    )
    .map((v) => ({
      shape_layer_instance_id: v.shape_layer_instance_id!,
      identifier_field: v.identifier_field!,
      display_name: v.display_name ?? String(v.shape_layer_instance_id),
    }));
}

export default function MapLayerPanel({
  availableShapeLayers,
  availableViews,
  selectedShapeLayer,
  onShapeLayerSelect,
  showDots,
  onToggleDots,
  canShowDots = true,
  loadingViewId = null,
  reverseToggleArrowDirection = false,
}: MapLayerPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();
  const isLoadingView = loadingViewId != null && selectedShapeLayer === loadingViewId;
  const toggleArrow = reverseToggleArrowDirection
    ? (isOpen ? "→" : "←")
    : (isOpen ? "←" : "→");

  const shapeLayers =
    availableViews && availableViews.length > 0
      ? deriveShapeLayersFromViews(availableViews)
      : availableShapeLayers;
  const sortedShapeLayers = sortShapeLayersLikeDashboard(shapeLayers);
  const hasShapeLayers = sortedShapeLayers.length > 0;
  const hasContent = hasShapeLayers || canShowDots;

  if (!hasContent) {
    return null;
  }

  // Handle mutually exclusive selection: selecting a shape layer hides points, showing points clears shape layer
  const handleShapeLayerSelect = (shapeLayerId: string) => {
    onShapeLayerSelect(shapeLayerId);
    if (showDots) {
      onToggleDots(); // Hide points when selecting a shape layer
    }
  };

  const handleToggleDots = () => {
    if (!showDots && selectedShapeLayer) {
      // When showing points, clear shape layer selection
      onShapeLayerSelect("");
    }
    onToggleDots();
  };

  return (
    <div className={`map-layer-panel ${isOpen ? "open" : "closed"}`}>
      <div className="map-layer-panel-header" onClick={() => setIsOpen(!isOpen)}>
        <button
          className="map-layer-panel-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          {toggleArrow}
        </button>
        {isOpen && (
          <>
            <span className="map-layer-panel-title">Layers</span>
            <button
              className="map-layer-panel-close"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            >
              ×
            </button>
          </>
        )}
      </div>

      {/* Icon-only view when closed */}
      {!isOpen && (
        <div className="map-layer-panel-icons">
          {/* Shape layers */}
          {hasShapeLayers && sortedShapeLayers.map((layer) => {
            const isSelected = String(layer.shape_layer_instance_id) === selectedShapeLayer && !showDots;
            const icon = getLayerIcon(
              layer.layer_key,
              layer.category,
              layer.display_name,
              layer.icon
            );
            const layerId = String(layer.shape_layer_instance_id);
            const isLayerLoading = isLoadingView && layerId === selectedShapeLayer;
            return (
              <button
                key={layer.shape_layer_instance_id}
                className={`map-layer-icon-button ${isSelected ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShapeLayerSelect(layerId);
                }}
                title={layer.display_name}
                aria-label={`Switch to ${layer.display_name} view`}
                disabled={isLayerLoading}
              >
                {isLayerLoading ? <Loader size="sm" color="dark" /> : icon}
              </button>
            );
          })}

          {/* Dot selector */}
          {canShowDots && (
            <button
              className={`map-layer-icon-button ${showDots && !selectedShapeLayer ? "selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleDots();
              }}
              title="Toggle data points"
              aria-label="Toggle data points visibility"
            >
              <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>●</span>
            </button>
          )}
        </div>
      )}

      {/* Full list view when open */}
      {isOpen && (
        <div className="map-layer-panel-content">
          {/* Shape layers */}
          {hasShapeLayers && (
            <div className="map-layer-section">
              <div className="map-layer-section-title">Shape Layers</div>
              {sortedShapeLayers.map((layer) => {
                const isSelected = String(layer.shape_layer_instance_id) === selectedShapeLayer && !showDots;
                const icon = getLayerIcon(
                  layer.layer_key,
                  layer.category,
                  layer.display_name,
                  layer.icon
                );
                const layerId = String(layer.shape_layer_instance_id);
                const isLayerLoading = isLoadingView && layerId === selectedShapeLayer;
                return (
                  <button
                    key={layer.shape_layer_instance_id}
                    className={`map-layer-item ${isSelected ? "selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShapeLayerSelect(layerId);
                    }}
                    disabled={isLayerLoading}
                  >
                    <span className="map-layer-icon">{isLayerLoading ? <Loader size="sm" color="dark" /> : icon}</span>
                    <span className="map-layer-name">{layer.display_name}</span>
                    {isSelected && !isLayerLoading && <span className="map-layer-check">✓</span>}
                    {isLayerLoading && <span className="map-layer-loading">Loading…</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Dot selector */}
          {canShowDots && (
            <div className="map-layer-section">
              <div className="map-layer-section-title">Data Points</div>
              <button
                className={`map-layer-item ${showDots && !selectedShapeLayer ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleDots();
                }}
              >
                <span className="map-layer-icon" style={{ fontSize: "1.2rem" }}>●</span>
                <span className="map-layer-name">Show Data Points</span>
                {showDots && !selectedShapeLayer && <span className="map-layer-check">✓</span>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
