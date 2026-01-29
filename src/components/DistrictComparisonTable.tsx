"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  getPublicMetricDistrictComparisons,
  type PublicDistrictComparisonsResponse,
  type PublicDistrictComparison,
} from "@/lib/publicApiClient";
import Loader from "./Loader";
import "./DistrictComparisonTable.css";

interface DistrictComparisonTableProps {
  metricId: number;
  comparisonType: "ytd" | "mtd" | "mtd_prior_year";
  itemNoun?: string;
  greenDirection?: "up" | "down" | null;
  /** Optional: used for explanatory caption below the table */
  metricName?: string;
  cityName?: string;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
}

type SortField = "district" | "current" | "previous" | "change";
type SortDirection = "asc" | "desc";

export default function DistrictComparisonTable({
  metricId,
  comparisonType,
  itemNoun = "items",
  greenDirection,
  metricName,
  cityName,
  currentPeriodEnd,
}: DistrictComparisonTableProps) {
  const [data, setData] = useState<PublicDistrictComparisonsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("district");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    getPublicMetricDistrictComparisons(metricId, comparisonType)
      .then((res) => {
        if (mounted) {
          setData(res);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load district data");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [metricId, comparisonType]);

  const sortedDistricts = useMemo(() => {
    if (!data?.districts) return [];

    return [...data.districts].sort((a, b) => {
      let aVal: number | null;
      let bVal: number | null;

      switch (sortField) {
        case "district":
          aVal = a.district;
          bVal = b.district;
          break;
        case "current":
          aVal = a.current_value;
          bVal = b.current_value;
          break;
        case "previous":
          aVal = a.comparison_value;
          bVal = b.comparison_value;
          break;
        case "change":
          aVal = a.change_percent;
          bVal = b.change_percent;
          break;
        default:
          return 0;
      }

      // Handle nulls - push to bottom
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      const diff = aVal - bVal;
      return sortDirection === "asc" ? diff : -diff;
    });
  }, [data?.districts, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Default to desc for values, asc for district
      setSortDirection(field === "district" ? "asc" : "desc");
    }
  };

  const formatValue = (value: number | null): string => {
    if (value === null) return "—";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (absValue >= 1e6) return `${sign}${(absValue / 1e6).toFixed(1)}M`;
    if (absValue >= 1e3) return `${sign}${(absValue / 1e3).toFixed(1)}k`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const formatPercent = (value: number | null): string => {
    if (value === null) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${Math.round(value)}%`;
  };

  const getChangeTone = (
    changePercent: number | null
  ): "good" | "bad" | "neutral" => {
    if (changePercent === null || Math.abs(changePercent) <= 5) return "neutral";
    const isIncrease = changePercent > 0;
    if (greenDirection === "up") {
      return isIncrease ? "good" : "bad";
    } else if (greenDirection === "down") {
      return isIncrease ? "bad" : "good";
    }
    return "neutral";
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="sort-icon inactive">↕</span>;
    }
    return (
      <span className="sort-icon active">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const comparisonLabels: Record<string, { previous: string; current: string }> = {
    ytd: { previous: "Last Year", current: "This Year" },
    mtd: { previous: "Last Month", current: "This Month" },
    mtd_prior_year: { previous: "Same Month Last Year", current: "This Year" },
  };

  const labels = comparisonLabels[comparisonType] || comparisonLabels.ytd;

  // Calculate totals
  const totals = useMemo(() => {
    if (!data?.districts || data.districts.length === 0) return null;
    
    const totalCurrent = data.districts.reduce((sum, d) => sum + (d.current_value || 0), 0);
    const totalPrevious = data.districts.reduce((sum, d) => sum + (d.comparison_value || 0), 0);
    const totalChangePercent = totalPrevious > 0 
      ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 
      : 0;
    
    return {
      current_value: totalCurrent,
      comparison_value: totalPrevious,
      change_percent: totalChangePercent,
    };
  }, [data?.districts]);

  // Top district by current value (for caption)
  const topDistrict = useMemo(() => {
    if (!sortedDistricts.length) return null;
    const byCurrent = [...sortedDistricts].sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0));
    return byCurrent[0];
  }, [sortedDistricts]);

  const currentYear = currentPeriodEnd
    ? new Date(currentPeriodEnd).getFullYear()
    : new Date().getFullYear();
  const currentPeriodEndFormatted = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  if (loading) {
    return (
      <div className="district-comparison-table-container loading">
        <Loader size="sm" color="dark" />
        <span>Loading district data...</span>
      </div>
    );
  }

  if (error) {
    console.error("[DistrictComparisonTable] Error loading data:", error);
    return (
      <div className="district-comparison-table-container error">
        <p>Unable to load district comparison data: {error}</p>
      </div>
    );
  }

  if (!data || data.districts.length === 0) {
    console.log("[DistrictComparisonTable] No district data available for metric", metricId);
    return null; // Don't show anything if no district data
  }

  const showCaption =
    totals &&
    cityName &&
    metricName &&
    itemNoun &&
    currentPeriodEndFormatted &&
    topDistrict &&
    topDistrict.current_value != null;

  return (
    <div className="district-comparison-table-container">
      <table className="district-comparison-table">
        <thead>
          <tr>
            <th
              className="sortable"
              onClick={() => handleSort("district")}
            >
              District <SortIcon field="district" />
            </th>
            <th
              className="sortable numeric"
              onClick={() => handleSort("previous")}
            >
              {labels.previous} <SortIcon field="previous" />
            </th>
            <th
              className="sortable numeric"
              onClick={() => handleSort("current")}
            >
              {labels.current} <SortIcon field="current" />
            </th>
            <th
              className="sortable numeric"
              onClick={() => handleSort("change")}
            >
              Change <SortIcon field="change" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedDistricts.map((district) => {
            const tone = getChangeTone(district.change_percent);
            return (
              <tr key={district.district}>
                <td className="district-cell">District {district.district}</td>
                <td className="numeric">{formatValue(district.comparison_value)}</td>
                <td className="numeric">{formatValue(district.current_value)}</td>
                <td className={`numeric change-cell ${tone}`}>
                  {formatPercent(district.change_percent)}
                </td>
              </tr>
            );
          })}
          {totals && (
            <tr className="total-row">
              <td className="district-cell total-label">Total</td>
              <td className="numeric">{formatValue(totals.comparison_value)}</td>
              <td className="numeric">{formatValue(totals.current_value)}</td>
              <td className={`numeric change-cell ${getChangeTone(totals.change_percent)}`}>
                {formatPercent(totals.change_percent)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {showCaption && (
        <p className="district-comparison-caption">
          So far in {currentYear}, {cityName} had {formatValue(totals.current_value)} {metricName.toLowerCase()} {itemNoun} through {currentPeriodEndFormatted}.
          {topDistrict ? ` District ${topDistrict.district} had the most (${formatValue(topDistrict.current_value)}).` : ""}
        </p>
      )}
    </div>
  );
}
