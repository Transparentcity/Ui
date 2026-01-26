"use client";

import { useState } from "react";
import "./ShapeLayerSelector.css";

interface ShapeLayer {
  shape_layer_instance_id: number;
  identifier_field: string;
  display_name: string;
  layer_key?: string;
  category?: string;
}

interface ShapeLayerSelectorProps {
  availableShapeLayers: ShapeLayer[];
  selectedShapeLayer: string | null;
  onSelect: (shapeLayerId: string) => void;
  loading?: boolean;
}

// Icon mapping for different shape layer types
const getLayerIcon = (layerKey?: string, category?: string, displayName?: string): string => {
  const key = (layerKey || "").toLowerCase();
  const cat = (category || "").toLowerCase();
  const name = (displayName || "").toLowerCase();

  // District/ward icons
  if (key.includes("district") || key.includes("ward") || name.includes("district") || name.includes("ward")) {
    return "🗺️"; // Map icon for districts/wards
  }
  
  // Neighborhood icons
  if (key.includes("neighborhood") || name.includes("neighborhood")) {
    return "🏘️"; // Houses icon for neighborhoods
  }
  
  // Police district icons
  if (key.includes("police") || name.includes("police")) {
    return "🚔"; // Police car icon
  }
  
  // Census tract
  if (key.includes("census") || name.includes("census")) {
    return "📊"; // Chart icon
  }
  
  // Zip code
  if (key.includes("zip") || name.includes("zip")) {
    return "📮"; // Mailbox icon
  }
  
  // Default icon
  return "📍"; // Location pin
};

export default function ShapeLayerSelector({
  availableShapeLayers,
  selectedShapeLayer,
  onSelect,
  loading = false,
}: ShapeLayerSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (availableShapeLayers.length <= 1) {
    // Don't show selector if there's only one or no shape layers
    return null;
  }

  const selectedLayer = availableShapeLayers.find(
    (layer) => String(layer.shape_layer_instance_id) === selectedShapeLayer
  );

  return (
    <div className="shape-layer-selector-container">
      <div className="shape-layer-selector-header">
        <button
          className="shape-layer-selector-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={loading}
          aria-label="Select map view"
          aria-expanded={isExpanded}
        >
          <span className="shape-layer-selector-label">
            {selectedLayer ? (
              <>
                <span className="shape-layer-icon">
                  {getLayerIcon(selectedLayer.layer_key, selectedLayer.category, selectedLayer.display_name)}
                </span>
                <span className="shape-layer-name">{selectedLayer.display_name}</span>
              </>
            ) : (
              "Select View"
            )}
          </span>
          <span className="shape-layer-selector-arrow">{isExpanded ? "▲" : "▼"}</span>
        </button>
      </div>
      
      {isExpanded && (
        <div className="shape-layer-selector-menu">
          {availableShapeLayers.map((layer) => {
            const isSelected = String(layer.shape_layer_instance_id) === selectedShapeLayer;
            return (
              <button
                key={layer.shape_layer_instance_id}
                className={`shape-layer-option ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onSelect(String(layer.shape_layer_instance_id));
                  setIsExpanded(false);
                }}
                disabled={loading}
              >
                <span className="shape-layer-icon">
                  {getLayerIcon(layer.layer_key, layer.category, layer.display_name)}
                </span>
                <span className="shape-layer-name">{layer.display_name}</span>
                {isSelected && <span className="shape-layer-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
