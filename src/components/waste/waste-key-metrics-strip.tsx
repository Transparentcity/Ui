"use client"

import { useState } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import MetricChartsModal from "@/components/MetricChartsModal"
import {
  useWasteKeyMetrics,
  formatMetricValue,
  type WasteKeyMetric,
} from "@/lib/hooks/useWasteKeyMetrics"
import { useWasteCity } from "./WasteCityContext"
import { cn } from "@/lib/utils"

function TrendIcon({ trend }: { trend: WasteKeyMetric["trend"] }) {
  if (!trend) return null
  if (trend.dir === "flat") {
    return <Minus className="w-3 h-3 text-gray-400" aria-label="flat" />
  }
  // Direction only: whether "up" is good depends on the metric, so stay
  // neutral in color and let the reader judge.
  return trend.dir === "up" ? (
    <TrendingUp className="w-3 h-3 text-gray-500" aria-label="up" />
  ) : (
    <TrendingDown className="w-3 h-3 text-gray-500" aria-label="down" />
  )
}

/**
 * Key-metrics chips for one module category, shown above the findings list.
 * Findings say what's anomalous; these say how big the underlying number is
 * and which way it's moving. Click a chip for the full chart.
 */
export function WasteKeyMetricsStrip({ category }: { category: string }) {
  const { selectedCityId, selectedCitySlug } = useWasteCity()
  const { byCategory, isLoading, valuesLoading } =
    useWasteKeyMetrics(selectedCityId)
  const [openMetric, setOpenMetric] = useState<WasteKeyMetric | null>(null)

  const metrics = byCategory[category] ?? []
  if (!isLoading && metrics.length === 0) return null

  const valued = metrics.filter((m) => m.value != null)
  const shown = (valued.length > 0 ? valued : metrics).slice(0, 4)

  return (
    <div className="mb-4" data-testid="waste-key-metrics">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
        Key metrics
      </p>
      {isLoading ? (
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-40 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {shown.map((m) => (
            <button
              key={m.id}
              onClick={() => setOpenMetric(m)}
              title={`${m.name} — click for the full chart`}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white text-left",
                "border-gray-200 hover:border-purple-300 hover:shadow-sm transition-all",
              )}
            >
              <span className="text-xs text-gray-500 max-w-[160px] truncate">
                {m.name}
              </span>
              <span
                className="text-sm font-semibold text-gray-900 tabular-nums"
                style={{ fontFamily: "var(--font-data)" }}
              >
                {m.value != null
                  ? formatMetricValue(m.value)
                  : valuesLoading
                    ? "…"
                    : m.status === "failed"
                      ? "run failed"
                      : "not run yet"}
              </span>
              <TrendIcon trend={m.trend} />
              {m.trend && m.trend.dir !== "flat" && (
                <span
                  className="text-[10px] text-gray-500 tabular-nums"
                  style={{ fontFamily: "var(--font-data)" }}
                >
                  {m.trend.pct > 0 ? "+" : ""}
                  {m.trend.pct.toFixed(1)}%
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <MetricChartsModal
        metricId={openMetric?.id ?? null}
        isOpen={openMetric !== null}
        onClose={() => setOpenMetric(null)}
        metricKey={openMetric?.metricKey ?? null}
        citySlug={selectedCitySlug}
      />
    </div>
  )
}
