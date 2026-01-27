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
 * Sparkline showing current count vs last check count for each day.
 * If same: solid green bar
 * If different: split bar (current = blue, last check = orange)
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
  
  // Find max count for scaling
  const maxCount = Math.max(
    ...sortedData.map(p => Math.max(
      p.count_current || 0,
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
          // Compare current count vs first seen to match statistics
          // Statistics show first_seen vs last_check (historical growth)
          // Sparkline shows first_seen vs current (current growth state)
          const currentCount = point.count_current ?? point.count_at_last_check ?? 0;
          const firstSeenCount = point.count_at_first_seen ?? 0;
          const countsMatch = currentCount === firstSeenCount && currentCount > 0;
          
          // Calculate bar heights (scaled to max)
          const currentHeight = maxCount > 0 ? (currentCount / maxCount) * chartHeight : 0;
          const firstSeenHeight = maxCount > 0 ? (firstSeenCount / maxCount) * chartHeight : 0;
          
          // Position bars from bottom
          const currentY = chartTop + chartHeight - currentHeight;
          const firstSeenY = chartTop + chartHeight - firstSeenHeight;

          if (countsMatch || (currentCount === 0 && firstSeenCount === 0)) {
            // Same count or both zero: single green bar
            return (
              <rect
                key={`${point.date}-${index}`}
                x={x}
                y={currentY}
                width={barWidth}
                height={Math.max(1, currentHeight)}
                fill="var(--color-success, #10b981)"
                opacity={0.8}
                rx={1}
              >
                <title>{`${point.date}: Count = ${currentCount.toLocaleString()} (no growth from first seen)`}</title>
              </rect>
            );
          } else {
            // Different counts: split bar showing growth from first seen
            // Current count on left (blue), first seen on right (orange)
            const halfWidth = barWidth / 2;
            const changePct = firstSeenCount > 0 
              ? ((currentCount - firstSeenCount) / firstSeenCount * 100).toFixed(1)
              : "0";
            return (
              <g key={`${point.date}-${index}`}>
                {/* Current count (left half, blue) - final count */}
                {currentCount > 0 && (
                  <rect
                    x={x}
                    y={currentY}
                    width={halfWidth}
                    height={Math.max(1, currentHeight)}
                    fill="var(--color-info, #3b82f6)"
                    opacity={0.8}
                    rx={1}
                  >
                    <title>{`${point.date}: Current = ${currentCount.toLocaleString()} (${changePct}% growth)`}</title>
                  </rect>
                )}
                {/* First seen count (right half, orange) - initial count */}
                {firstSeenCount > 0 && (
                  <rect
                    x={x + halfWidth}
                    y={firstSeenY}
                    width={halfWidth}
                    height={Math.max(1, firstSeenHeight)}
                    fill="var(--color-warning, #f59e0b)"
                    opacity={0.8}
                    rx={1}
                  >
                    <title>{`${point.date}: First seen = ${firstSeenCount.toLocaleString()}`}</title>
                  </rect>
                )}
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
          Same (Stable)
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
          First Seen
        </span>
      </div>
    </div>
  );
}
