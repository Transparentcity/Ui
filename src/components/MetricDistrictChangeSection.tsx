"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateRangeFromStrings } from "@/lib/formatters";
import {
  getPublicMetricDistrictComparisons,
  getPublicMetricShapefile,
  type PublicDistrictComparisonsResponse,
  type PublicMetricComparison,
  type PublicShapefileResponse,
} from "@/lib/publicApiClient";
import DeltaMapView from "./DeltaMapView";
import DistrictComparisonTable from "./DistrictComparisonTable";
import MetricSourceAttribution, {
  type CompactSourceInfo,
} from "./MetricSourceAttribution";

type ComparisonSlice = Pick<
  PublicMetricComparison,
  | "current_period_start"
  | "current_period_end"
  | "comparison_period_start"
  | "comparison_period_end"
  | "current_period_value"
  | "comparison_period_value"
>;

interface MetricDistrictChangeSectionProps {
  metricId: number;
  metricName: string;
  cityName: string;
  itemNoun: string;
  greenDirection: "up" | "down" | null;
  selectedPeriod: "ytd" | "mtd" | "mtd_prior_year";
  isStale: boolean;
  comparison: ComparisonSlice | null | undefined;
  /** Smaller map height on narrow layouts */
  deltaMapHeight: number;
  sourceInfo?: CompactSourceInfo | null;
  sourceStartDate?: string | null;
  sourceEndDate?: string | null;
}

function hasUsableShapefile(shape: PublicShapefileResponse | null): boolean {
  const fc = shape?.geometry;
  if (!fc || fc.type !== "FeatureCollection") return false;
  return Array.isArray(fc.features) && fc.features.length > 0;
}

/**
 * District-by-district change map + table. Renders nothing when district/shape
 * data is missing so we do not show empty placeholders.
 */
export default function MetricDistrictChangeSection({
  metricId,
  metricName,
  cityName,
  itemNoun,
  greenDirection,
  selectedPeriod,
  isStale,
  comparison,
  deltaMapHeight,
  sourceInfo = null,
  sourceStartDate = null,
  sourceEndDate = null,
}: MetricDistrictChangeSectionProps) {
  const [bundle, setBundle] = useState<{
    districts: PublicDistrictComparisonsResponse;
    shape: PublicShapefileResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const currentPeriodEnd = comparison?.current_period_end ?? undefined;

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setLoading(true);
      setBundle(null);

      Promise.all([
        getPublicMetricDistrictComparisons(metricId, selectedPeriod, currentPeriodEnd),
        getPublicMetricShapefile(metricId),
      ])
        .then(([districts, shape]) => {
          if (!mounted) return;
          if (
            districts.districts &&
            districts.districts.length > 0 &&
            hasUsableShapefile(shape)
          ) {
            setBundle({ districts, shape });
          } else {
            setBundle(null);
          }
        })
        .catch(() => {
          if (mounted) setBundle(null);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    });

    return () => {
      mounted = false;
    };
  }, [metricId, selectedPeriod, currentPeriodEnd]);

  const prefetched = useMemo(
    () =>
      bundle
        ? {
            districtComparisons: bundle.districts,
            shapefile: bundle.shape,
          }
        : undefined,
    [bundle]
  );

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined) =>
    formatDateRangeFromStrings(start, end, { loading: false });

  const comparisonPeriodLabel = {
    ytd: "last year",
    mtd: "last month",
    mtd_prior_year: "same month last year",
  }[selectedPeriod] || "the previous period";

  const comparisonSubtitleLabel = {
    ytd: "same period last year",
    mtd: "last month",
    mtd_prior_year: "same month last year",
  }[selectedPeriod] || "the previous period";

  if (loading || !prefetched) {
    return null;
  }

  return (
    <section className="metric-section">
      <h2 className="metric-section-title">
        How has {metricName.toLowerCase()} changed from {comparisonPeriodLabel}?
      </h2>
      {isStale ? (
        <p className="metric-section-subtitle">Prior year to date comparison (no current-year data)</p>
      ) : comparison?.current_period_start && comparison?.current_period_end ? (
        <p className="metric-section-subtitle">
          Comparing {formatDateRange(comparison.current_period_start, comparison.current_period_end)} to{" "}
          {comparisonSubtitleLabel}
        </p>
      ) : null}
      <DeltaMapView
        metricId={metricId}
        comparisonType={selectedPeriod}
        greenDirection={greenDirection}
        height={deltaMapHeight}
        showLink={true}
        currentPeriodEnd={currentPeriodEnd}
        dateRange={{
          start: comparison?.current_period_start || null,
          end: comparison?.current_period_end || null,
        }}
        comparisonDateRange={{
          start: comparison?.comparison_period_start || null,
          end: comparison?.comparison_period_end || null,
        }}
        prefetched={prefetched}
      />
      <MetricSourceAttribution
        sourceInfo={sourceInfo}
        startDate={sourceStartDate}
        endDate={sourceEndDate}
      />
      <DistrictComparisonTable
        metricId={metricId}
        comparisonType={selectedPeriod}
        greenDirection={greenDirection}
        itemNoun={itemNoun}
        metricName={metricName}
        cityName={cityName}
        currentPeriodEnd={currentPeriodEnd}
        currentPeriodStart={comparison?.current_period_start ?? undefined}
        citywideCurrent={comparison?.current_period_value ?? null}
        citywideComparison={comparison?.comparison_period_value ?? null}
        prefetchedDistricts={prefetched.districtComparisons}
      />
    </section>
  );
}
