"use client";

import TimeSeriesChart, { type PeriodType } from "@/components/TimeSeriesChart";
import AnomalyChart from "@/components/AnomalyChart";
import type { AnomalyPageModel } from "@/lib/anomalyPageData";

export default function AnomalySeriesChart({
  model,
  height,
  embedded = false,
  thumbnail = false,
  forcedTheme,
  parentProvidesTitle = true,
}: {
  model: AnomalyPageModel;
  height: number;
  embedded?: boolean;
  thumbnail?: boolean;
  forcedTheme?: "light" | "dark";
  parentProvidesTitle?: boolean;
}) {
  if (model.liveSeries && model.liveSeries.length > 0) {
    return (
      <TimeSeriesChart
        data={model.liveSeries}
        metadata={{
          chart_title: model.liveMetadata?.chart_title || model.metricName,
          y_axis_label: model.liveMetadata?.y_axis_label || model.itemNoun || undefined,
          object_name: model.metricName,
          period_type: model.periodType,
          district: model.district,
          city_name: model.cityName || undefined,
        }}
        height={height}
        defaultPeriod={model.periodType as PeriodType}
        hidePeriodSelector
        parentProvidesTitle={parentProvidesTitle}
        embeddedMode={embedded || thumbnail}
        forcedTheme={forcedTheme}
        anomalyOverlay={model.overlay}
        fullBleed={embedded || thumbnail}
      />
    );
  }

  if (model.chartPayload) {
    const periods = model.chartPayload.periods.map((period) =>
      period === "recent" ? "recent" : "comparison",
    ) as ("recent" | "comparison")[];
    return (
      <AnomalyChart
        chartData={{
          dates: model.chartPayload.dates,
          values: model.chartPayload.values,
          periods,
        }}
        anomaly={{
          comparison_mean: model.comparisonMean,
          recent_mean: model.recentMean,
          std_dev: model.stdDev,
          percent_change: model.percentChange,
          period_type: model.periodType,
        }}
        metadata={{
          object_name: model.metricName,
          city_name: model.cityName || undefined,
          y_axis_label: model.itemNoun || undefined,
          period_type: model.periodType,
          group_field_name: model.groupField || undefined,
          group_value: model.groupValue || undefined,
          district: model.district,
        }}
        height={height}
      />
    );
  }

  return (
    <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
      Chart data is not available for this anomaly.
    </p>
  );
}
