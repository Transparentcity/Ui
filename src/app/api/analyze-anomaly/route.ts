import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Format the chart_payload time series into a readable table for the LLM.
 * chart_payload contains: { dates: string[], values: number[], periods: ("recent"|"comparison")[] }
 */
function formatTimeSeries(chartPayload: any): string {
  if (!chartPayload?.dates || !chartPayload?.values) return ""
  
  const dates: string[] = chartPayload.dates
  const values: (number | null)[] = chartPayload.values
  const periods: string[] = chartPayload.periods ?? []

  if (dates.length === 0) return ""

  const rows = dates.map((d: string, i: number) => {
    const val = values[i] != null ? values[i]!.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "N/A"
    const label = periods[i] === "recent" ? "  ← RECENT" : periods[i] === "comparison" ? "  (comparison)" : ""
    return `  ${d}  ${val}${label}`
  })

  return rows.join("\n")
}

/**
 * Compute basic statistics from the time series to help the LLM.
 */
function computeStats(chartPayload: any): string {
  if (!chartPayload?.values) return ""

  const values = (chartPayload.values as (number | null)[]).filter(
    (v): v is number => v != null
  )
  if (values.length === 0) return ""

  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

  // Trend: compare first third vs last third
  const third = Math.max(1, Math.floor(values.length / 3))
  const firstThirdAvg = values.slice(0, third).reduce((s, v) => s + v, 0) / third
  const lastThirdAvg = values.slice(-third).reduce((s, v) => s + v, 0) / third
  const trendPct = firstThirdAvg !== 0 ? ((lastThirdAvg - firstThirdAvg) / firstThirdAvg) * 100 : 0
  const trendDir = trendPct > 5 ? "upward" : trendPct < -5 ? "downward" : "flat"

  // Volatility (coefficient of variation)
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  const cv = mean !== 0 ? (stddev / Math.abs(mean)) * 100 : 0

  return [
    `Data points: ${values.length}`,
    `Range: ${min.toLocaleString()} – ${max.toLocaleString()}`,
    `Mean: ${mean.toFixed(1)}, Median: ${median.toFixed(1)}`,
    `Std deviation: ${stddev.toFixed(1)} (CV: ${cv.toFixed(0)}%)`,
    `Overall trend: ${trendDir} (first-third avg ${firstThirdAvg.toFixed(1)} → last-third avg ${lastThirdAvg.toFixed(1)}, ${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%)`,
  ].join("\n")
}

export async function POST(req: Request) {
  try {
    const { anomaly } = await req.json()

    if (!anomaly) {
      return Response.json({ error: "Anomaly data is required" }, { status: 400 })
    }

    // Build anomaly summary
    const summary = [
      anomaly.title ? `Metric: ${anomaly.title}` : null,
      anomaly.metric_name && anomaly.metric_name !== anomaly.title ? `Metric name: ${anomaly.metric_name}` : null,
      anomaly.pct_change != null ? `Percentage change: ${anomaly.pct_change > 0 ? "+" : ""}${anomaly.pct_change.toFixed(1)}%` : null,
      anomaly.recent_mean != null ? `Recent period value: ${anomaly.recent_mean}` : null,
      anomaly.comparison_mean != null ? `Comparison average: ${anomaly.comparison_mean}` : null,
      anomaly.period_type ? `Period type: ${anomaly.period_type}` : null,
      anomaly.district_label ? `Location: ${anomaly.district_label}` : null,
      anomaly.data_source ? `City / Data source: ${anomaly.data_source}` : null,
    ].filter(Boolean).join("\n")

    // Build time series section
    const chartPayload = anomaly.chart_payload
    const timeSeriesTable = formatTimeSeries(chartPayload)
    const timeSeriesStats = computeStats(chartPayload)

    const windowInfo = chartPayload?.comparison_window
      ? `Comparison window: ${chartPayload.comparison_window.size ?? "?"} periods (${chartPayload.comparison_window.label ?? "unlabeled"})`
      : ""

    const recentWindow = chartPayload?.recent_window
      ? `Recent window: ${chartPayload.recent_window.size ?? "?"} periods`
      : ""

    const prompt = `You are a senior civic data analyst reviewing anomalies detected in San Francisco city data. You have access to the full historical time series for this metric — use it to give a thorough, data-grounded analysis.

## Anomaly Summary
${summary}
${windowInfo}
${recentWindow}

## Historical Time Series Data
${timeSeriesTable || "(No time series data available)"}

## Computed Statistics
${timeSeriesStats || "(No stats available)"}

---

Using the actual data above, provide exactly three paragraphs:

1. **Fact Check & Data Quality**: Look at the full time series. Is the flagged change real or could it be a data artifact? Check for:
   - Suspicious zeros, nulls, or sudden drops that suggest reporting gaps
   - Whether this value is truly an outlier vs. within normal historical variance
   - Seasonal patterns (compare same period in prior years if visible)
   - Whether the comparison window is long enough to be meaningful
   - If the absolute numbers are very small (e.g., under 10), note that small counts produce misleadingly large percentage changes

2. **Trend Analysis**: Based on the full time series, describe the broader trend. Is this metric generally increasing, decreasing, or volatile? Is the flagged anomaly a continuation of a trend, a reversal, or a one-off spike? What might be driving it — policy changes, seasonal patterns, external events, or demographic shifts?

3. **Context & Recommendations**: Given the data, how confident should we be in this finding? What additional data or context would help confirm it? What specific questions should a city official ask before acting on this? If the data quality is questionable, say so clearly.

Be concise, factual, and skeptical. Reference specific numbers from the time series to support your points. Do not speculate beyond what the data supports.`

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      prompt,
      maxOutputTokens: 1500,
    })

    return Response.json({ analysis: text })
  } catch (error) {
    console.error("[analyze-anomaly] Error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: `Analysis failed: ${message}` }, { status: 500 })
  }
}
