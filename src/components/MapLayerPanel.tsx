"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import "./MapLayerPanel.css";

interface ShapeLayer {
  shape_layer_instance_id: number;
  identifier_field: string;
  display_name: string;
  layer_key?: string;
  category?: string;
}

interface MapLayerPanelProps {
  availableShapeLayers: ShapeLayer[];
  selectedShapeLayer: string | null;
  onShapeLayerSelect: (shapeLayerId: string) => void;
  showDots: boolean;
  onToggleDots: () => void;
  canShowDots?: boolean;
}

// Icon mapping for different shape layer types
const getLayerIcon = (layerKey?: string, category?: string, displayName?: string): string => {
  const key = (layerKey || "").toLowerCase();
  const cat = (category || "").toLowerCase();
  const name = (displayName || "").toLowerCase();

  // District/ward icons
  if (key.includes("district") || key.includes("ward") || name.includes("district") || name.includes("ward")) {
    return "🗺️";
  }
  
  // Neighborhood icons
  if (key.includes("neighborhood") || name.includes("neighborhood")) {
    return "🏘️";
  }
  
  // Police district icons
  if (key.includes("police") || name.includes("police")) {
    return "🚔";
  }
  
  // Census tract
  if (key.includes("census") || name.includes("census")) {
    return "📊";
  }
  
  // Zip code
  if (key.includes("zip") || name.includes("zip")) {
    return "📮";
  }
  
  // Default icon
  return "📍";
};

export default function MapLayerPanel({
  availableShapeLayers,
  selectedShapeLayer,
  onShapeLayerSelect,
  showDots,
  onToggleDots,
  canShowDots = true,
}: MapLayerPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();

  const hasShapeLayers = availableShapeLayers.length > 0;
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
          {isOpen ? "→" : "←"}
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
          {hasShapeLayers && availableShapeLayers.map((layer) => {
            const isSelected = String(layer.shape_layer_instance_id) === selectedShapeLayer && !showDots;
            const icon = getLayerIcon(layer.layer_key, layer.category, layer.display_name);
            return (
              <button
                key={layer.shape_layer_instance_id}
                className={`map-layer-icon-button ${isSelected ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShapeLayerSelect(String(layer.shape_layer_instance_id));
                }}
                title={layer.display_name}
                aria-label={`Switch to ${layer.display_name} view`}
              >
                {icon}
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
              {availableShapeLayers.map((layer) => {
                const isSelected = String(layer.shape_layer_instance_id) === selectedShapeLayer && !showDots;
                const icon = getLayerIcon(layer.layer_key, layer.category, layer.display_name);
                return (
                  <button
                    key={layer.shape_layer_instance_id}
                    className={`map-layer-item ${isSelected ? "selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShapeLayerSelect(String(layer.shape_layer_instance_id));
                    }}
                  >
                    <span className="map-layer-icon">{icon}</span>
                    <span className="map-layer-name">{layer.display_name}</span>
                    {isSelected && <span className="map-layer-check">✓</span>}
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
