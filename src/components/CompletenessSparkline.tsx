"use client";

import React, { useEffect, useRef, useState } from "react";
import type { DailyCompletenessDataPoint } from "@/lib/publicApiClient";

interface CompletenessSparklineProps {
  data: DailyCompletenessDataPoint[];
  width?: number;
  height?: number;
  fullWidth?: boolean;
}

/**
 * Sparkline showing completeness using stacked bars.
 * Each bar shows: last seen (base) + difference to current (stacked on top)
 * If same: solid green bar (stable)
 * If different: stacked bar (last seen = orange base, current growth = blue on top)
 */
export default function CompletenessSparkline({
  data,
  width = 300,
  height = 60,
  fullWidth = false,
}: CompletenessSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(width);
  const chartWidth = fullWidth ? measuredWidth : width;

  useEffect(() => {
    if (!fullWidth) return;
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (!containerRef.current) return;
      setMeasuredWidth(containerRef.current.clientWidth || width);
    };

    updateWidth();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fullWidth, width]);

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          width: fullWidth ? "100%" : width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
          fontSize: 12,
        }}
      >
        No data available
      </div>
    );
  }

  // Sort by date (oldest to newest for left to right display)
  const sortedData = [...data].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateA - dateB;
  });
  
  // Find max count for scaling (use current as it's the total bar height)
  const maxCount = Math.max(
    ...sortedData.map(p => Math.max(
      p.count_current || 0,
      p.count_at_first_seen || 0,
      p.count_at_last_check || 0
    ))
  );
  
  const padding = 1;
  const barWidth = Math.max(2, (chartWidth - padding * (sortedData.length - 1)) / sortedData.length);
  const chartHeight = height - 20; // Leave space for labels
  const chartTop = 10;

  return (
    <div
      ref={containerRef}
      style={{ width: fullWidth ? "100%" : chartWidth, height: height + 24, position: "relative" }}
    >
      <svg width={chartWidth} height={height} style={{ overflow: "visible" }}>
        {sortedData.map((point, index) => {
          const x = index * (barWidth + padding);
          // Use count_current (live from time_series_data) or fall back to count_at_last_check
          const currentCount = point.count_current ?? point.count_at_last_check ?? 0;
          // "Last Seen" = count when we FIRST observed this period (shows growth over time)
          const lastSeenCount = point.count_at_first_seen ?? 0;
          const countsMatch = currentCount === lastSeenCount && currentCount > 0;
          
          // Calculate the difference (growth from first seen to current)
          const difference = currentCount - lastSeenCount;
          
          // Calculate bar heights (scaled to max)
          const lastSeenHeight = maxCount > 0 ? (lastSeenCount / maxCount) * chartHeight : 0;
          const differenceHeight = maxCount > 0 ? (Math.abs(difference) / maxCount) * chartHeight : 0;
          
          // Position: last seen at bottom, difference stacked on top
          const lastSeenY = chartTop + chartHeight - lastSeenHeight;
          const differenceY = lastSeenY - differenceHeight; // Stack on top of last seen

          if (countsMatch || (currentCount === 0 && lastSeenCount === 0)) {
            // Same count or both zero: single green bar (stable - no growth since first seen)
            const totalHeight = maxCount > 0 ? (currentCount / maxCount) * chartHeight : 0;
            const totalY = chartTop + chartHeight - totalHeight;
            return (
              <rect
                key={`${point.date}-${index}`}
                x={x}
                y={totalY}
                width={barWidth}
                height={Math.max(1, totalHeight)}
                fill="var(--color-success, #10b981)"
                opacity={0.8}
                rx={1}
              >
                <title>{`${point.date}: ${currentCount.toLocaleString()} (stable - no growth since first seen)`}</title>
              </rect>
            );
          } else {
            // Different counts: stacked bar showing growth from first seen to current
            // Last seen/first seen (orange) as base, then growth to current (blue) stacked on top
            const changePct = lastSeenCount > 0 
              ? ((difference / lastSeenCount) * 100).toFixed(1)
              : "∞";
            const changeSign = difference > 0 ? "+" : "";
            
            return (
              <g key={`${point.date}-${index}`}>
                {/* Last seen/first seen count (base, orange) */}
                {lastSeenCount > 0 && (
                  <rect
                    x={x}
                    y={lastSeenY}
                    width={barWidth}
                    height={Math.max(1, lastSeenHeight)}
                    fill="var(--color-warning, #f59e0b)"
                    opacity={0.8}
                    rx={1}
                  />
                )}
                {/* Growth to current (stacked on top, blue) */}
                {difference > 0 && (
                  <rect
                    x={x}
                    y={differenceY}
                    width={barWidth}
                    height={Math.max(1, differenceHeight)}
                    fill="var(--color-info, #3b82f6)"
                    opacity={0.8}
                    rx={1}
                  />
                )}
                {/* Tooltip covers entire bar */}
                <rect
                  x={x}
                  y={difference > 0 ? differenceY : lastSeenY}
                  width={barWidth}
                  height={Math.max(1, lastSeenHeight + (difference > 0 ? differenceHeight : 0))}
                  fill="transparent"
                >
                  <title>{`${point.date}: Last Seen = ${lastSeenCount.toLocaleString()}, Current = ${currentCount.toLocaleString()} (${changeSign}${changePct}%)`}</title>
                </rect>
              </g>
            );
          }
        })}
      </svg>
      {sortedData.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: -6,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "var(--text-secondary)",
          }}
        >
          <span>
            {sortedData[0]?.date
              ? new Date(sortedData[0].date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                })
              : ""}
          </span>
          <span>
            {sortedData[sortedData.length - 1]?.date
              ? new Date(sortedData[sortedData.length - 1].date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                })
              : ""}
          </span>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: -8,
          right: 0,
          display: "flex",
          gap: 12,
          fontSize: 10,
          color: "var(--text-secondary)",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              backgroundColor: "var(--color-success, #10b981)",
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          Stable
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              backgroundColor: "var(--color-warning, #f59e0b)",
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          Last Seen
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              backgroundColor: "var(--color-info, #3b82f6)",
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          Current
        </span>
      </div>
    </div>
  );
}
