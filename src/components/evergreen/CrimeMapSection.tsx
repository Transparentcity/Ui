"use client";

import { useState } from "react";
import MetricMapEmbed from "@/components/MetricMapEmbed";
import type { CrimeMapMetricIds } from "@/lib/evergreen/types";

interface CrimeMapSectionProps {
  metricIds: CrimeMapMetricIds;
  lastUpdated: string;
  district?: number | null; // backend district number for filtering
  locationName: string; // "Mission District" or "San Francisco"
}

type MapTab = "violent" | "property";

export default function CrimeMapSection({
  metricIds,
  lastUpdated,
  district,
  locationName,
}: CrimeMapSectionProps) {
  const hasViolent = metricIds.violentCrime != null;
  const hasProperty = metricIds.propertyCrime != null;

  if (!hasViolent && !hasProperty) return null;

  const defaultTab: MapTab = hasViolent ? "violent" : "property";
  const [activeTab, setActiveTab] = useState<MapTab>(defaultTab);

  // Build date ranges: current YTD and prior year comparison
  const endDate = lastUpdated;
  const endYear = new Date(endDate).getFullYear();
  const startDate = `${endYear}-01-01`;
  const priorStart = `${endYear - 1}-01-01`;
  const priorEnd = `${endYear - 1}-${endDate.slice(5)}`; // same month/day, prior year

  const activeMetricId =
    activeTab === "violent" ? metricIds.violentCrime : metricIds.propertyCrime;

  if (activeMetricId == null) return null;

  return (
    <section id="map">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Recent Crime in {locationName}
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Mapped incidents year-to-date. Each dot is one reported incident.
      </p>

      {/* Tabs */}
      {hasViolent && hasProperty && (
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setActiveTab("violent")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "violent"
                ? "bg-purple-100 text-purple-800 font-medium"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Violent Crime
          </button>
          <button
            onClick={() => setActiveTab("property")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "property"
                ? "bg-purple-100 text-purple-800 font-medium"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Property Crime
          </button>
        </div>
      )}

      <MetricMapEmbed
        metricId={activeMetricId}
        selectedPeriod="ytd"
        height={420}
        showLink
        district={district}
        metricName={activeTab === "violent" ? "Violent crime" : "Property crime"}
        itemNoun="incidents"
        dateRange={{ start: startDate, end: endDate }}
        comparisonDateRange={{ start: priorStart, end: priorEnd }}
      />
    </section>
  );
}
