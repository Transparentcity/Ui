"use client";

import { useState } from "react";
import "./CategoryBreakdown.css";

interface CategoryBreakdownProps {
  metricId: number;
  categoryFields: Array<Record<string, any>>;
}

export default function CategoryBreakdown({
  metricId,
  categoryFields,
}: CategoryBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  // TODO: Fetch category breakdown data from API
  // For now, show placeholder
  return (
    <div className="category-breakdown">
      <button
        className="category-breakdown-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="toggle-icon">{expanded ? "▼" : "▶"}</span>
        <span className="toggle-label">Category Breakdown</span>
      </button>
      {expanded && (
        <div className="category-breakdown-content">
          <p className="placeholder-text">
            Grouped time series chart will be displayed here
          </p>
          <p className="placeholder-note">
            Showing trends by: {categoryFields.map((f) => f.fieldName || f.name).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
