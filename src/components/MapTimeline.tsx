"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import "./MapTimeline.css";

interface MapTimelineProps {
  features: Array<{
    properties: Record<string, any>;
    geometry: { type: string; coordinates: [number, number] };
  }>;
  onDateSelect?: (selectedDate: string | null) => void;
  onAnimationStateChange?: (isPlaying: boolean) => void;
}

// Common date field names to check
const DATE_FIELDS = [
  "incident_datetime",
  "date",
  "opened",
  "timestamp",
  "datetime",
  "time_period",
  "period_date",
  "created_at",
  "occurred",
  "incident_date",
  "report_datetime",
  "date_issued",
  "date_filed",
  "dba_start_date",
  "dba_end_date",
  "location_start_date",
  "location_end_date",
  "business_start_date",
  "business_end_date",
];

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function getDateFromFeature(feature: any): Date | null {
  const props = feature.properties || {};
  
  // First check if we stored the date directly
  if (props._featureDate) {
    const date = parseDate(props._featureDate);
    if (date) return date;
  }
  
  // Check common date fields
  for (const field of DATE_FIELDS) {
    const value = props[field];
    if (value) {
      const date = parseDate(value);
      if (date) return date;
    }
  }
  
  // Check dates field (for aggregated points)
  if (props.dates) {
    const dateStr = typeof props.dates === "string" ? props.dates.split(",")[0].trim() : null;
    if (dateStr) {
      const date = parseDate(dateStr);
      if (date) return date;
    }
  }
  
  return null;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function makeSparklinePoints(
  values: number[],
  width: number,
  height: number
): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 8;
  const padY = 8;
  const w = Math.max(1, width - padX * 2);
  const h = Math.max(1, height - padY * 2);

  return values
    .map((v, i) => {
      const x = padX + (w * i) / Math.max(1, values.length - 1);
      const y = padY + h - (h * (v - min)) / span;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function MapTimeline({
  features,
  onDateSelect,
  onAnimationStateChange,
}: MapTimelineProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);
  const currentDateIndexRef = useRef<number>(0);

  // Extract dates from features and aggregate counts per day
  const dateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    features.forEach((feature) => {
      const date = getDateFromFeature(feature);
      if (date) {
        const dateKey = formatDateKey(date);
        counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
      }
    });
    
    // Convert to sorted array
    const sortedDates = Array.from(counts.keys()).sort();
    return sortedDates.map((date) => ({
      date,
      count: counts.get(date) || 0,
    }));
  }, [features]);

  // Sparkline values
  const sparklineValues = useMemo(() => {
    return dateCounts.map((d) => d.count);
  }, [dateCounts]);

  // Handle date selection
  const handleDateClick = useCallback(
    (date: string) => {
      const newSelectedDate = selectedDate === date ? null : date;
      setSelectedDate(newSelectedDate);
      onDateSelect?.(newSelectedDate);
    },
    [selectedDate, onDateSelect]
  );

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      // Pause
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setIsPlaying(false);
      onAnimationStateChange?.(false);
    } else {
      // Play
      setIsPlaying(true);
      onAnimationStateChange?.(true);
      
      // Start from beginning if we're at the end
      if (currentDateIndexRef.current >= dateCounts.length) {
        currentDateIndexRef.current = 0;
      }
      
      const animate = () => {
        if (currentDateIndexRef.current < dateCounts.length) {
          const currentDate = dateCounts[currentDateIndexRef.current].date;
          setSelectedDate(currentDate);
          onDateSelect?.(currentDate);
          currentDateIndexRef.current++;
          animationRef.current = requestAnimationFrame(() => {
            setTimeout(animate, 200); // 200ms per day
          });
        } else {
          // Reached the end, stop
          setIsPlaying(false);
          onAnimationStateChange?.(false);
          animationRef.current = null;
        }
      };
      
      animate();
    }
  }, [isPlaying, dateCounts, onDateSelect, onAnimationStateChange]);

  // Handle stop - reset animation and clear selection
  const handleStop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
    onAnimationStateChange?.(false);
    setSelectedDate(null);
    onDateSelect?.(null);
    currentDateIndexRef.current = 0;
  }, [onDateSelect, onAnimationStateChange]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Reset animation when dateCounts change
  useEffect(() => {
    if (isPlaying) {
      setIsPlaying(false);
      onAnimationStateChange?.(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
    currentDateIndexRef.current = 0;
  }, [dateCounts, onAnimationStateChange]);

  // Don't show timeline if no dates found
  if (dateCounts.length === 0) {
    return null;
  }

  const maxCount = Math.max(...sparklineValues, 1);
  const selectedIndex = selectedDate
    ? dateCounts.findIndex((d) => d.date === selectedDate)
    : -1;

  return (
    <>
      {/* Clock icon button - lower left */}
      <button
        className={`map-timeline-toggle ${isOpen ? "open" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        aria-label="Toggle timeline"
        title="Timeline"
        style={{ pointerEvents: "auto" }}
        type="button"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Timeline panel */}
      <div 
        className={`map-timeline-panel ${isOpen ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ pointerEvents: isOpen ? "auto" : "none" }}
      >
        <div className="map-timeline-header">
          <h3>Timeline</h3>
          <button
            className="map-timeline-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close timeline"
          >
            ×
          </button>
        </div>

        <div className="map-timeline-content">
          <div className="map-timeline-shell">
            {/* Sparkline */}
            <div className="map-timeline-sparkline">
              <svg
                viewBox={`0 0 320 60`}
                width="100%"
                height="60"
                preserveAspectRatio="none"
              >
                {sparklineValues.length > 0 && (
                  <>
                    <polyline
                      points={makeSparklinePoints(sparklineValues, 320, 60)}
                      fill="rgba(173, 53, 250, 0.15)"
                      stroke="var(--brand-primary, #ad35fa)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    {selectedIndex >= 0 && (
                      <circle
                        cx={8 + ((320 - 16) * selectedIndex) / Math.max(1, sparklineValues.length - 1)}
                        cy={8 + 44 - ((44 * sparklineValues[selectedIndex]) / maxCount)}
                        r="4"
                        fill="var(--brand-primary, #ad35fa)"
                      />
                    )}
                  </>
                )}
              </svg>
            </div>

            {/* Date list */}
            <div className="map-timeline-dates">
              {dateCounts.map((item) => {
                const isSelected = selectedDate === item.date;
                const dateObj = new Date(item.date);
                const displayDate = dateObj.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });

                return (
                  <button
                    key={item.date}
                    className={`map-timeline-date-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleDateClick(item.date)}
                    style={{
                      opacity: isSelected ? 1 : 0.4,
                    }}
                  >
                    <span className="map-timeline-date-label">{displayDate}</span>
                    <span className="map-timeline-date-count">{item.count}</span>
                  </button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="map-timeline-controls">
              <button
                className="map-timeline-play-button"
                onClick={handlePlayPause}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>
              <button
                className="map-timeline-stop-button"
                onClick={handleStop}
                aria-label="Stop"
                title="Stop and reset"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
              {selectedDate && (
                <button
                  className="map-timeline-clear-button"
                  onClick={() => {
                    setSelectedDate(null);
                    onDateSelect?.(null);
                  }}
                  aria-label="Clear selection"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

