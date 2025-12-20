"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatMetricDateRangeLabel,
  getPresetMetricDateRange,
  normalizeMetricDateRange,
  type DateRangePreset,
  type MetricDateRange,
} from "@/lib/dateRange";
import "./MetricDateRangeSelector.css";

interface MetricDateRangeSelectorProps {
  value: MetricDateRange;
  onChange: (next: MetricDateRange) => void;
}

export default function MetricDateRangeSelector({
  value,
  onChange,
}: MetricDateRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MetricDateRange>(value);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const label = useMemo(() => formatMetricDateRangeLabel(value), [value]);

  const setPreset = (preset: DateRangePreset) => {
    if (preset === "custom") {
      setDraft((prev) => ({ ...prev, preset: "custom" }));
      return;
    }
    setDraft(getPresetMetricDateRange(preset));
  };

  const isValid = useMemo(() => {
    const normalized = normalizeMetricDateRange(draft);
    if (normalized.start_date && normalized.end_date) {
      return normalized.start_date <= normalized.end_date;
    }
    return true;
  }, [draft]);

  const apply = () => {
    if (!isValid) return;
    onChange(
      normalizeMetricDateRange({ ...draft, preset: draft.preset || "custom" })
    );
    setOpen(false);
  };

  return (
    <div className="metric-date-range-selector">
      <button
        type="button"
        className="metric-date-range-pill"
        onClick={() => setOpen(true)}
        title="Filter map metric layers by date range"
      >
        <span className="metric-date-range-pill-icon" aria-hidden>
          📅
        </span>
        <span className="metric-date-range-pill-label">{label}</span>
      </button>

      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            className="metric-date-range-modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              className="metric-date-range-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Select date range"
            >
              <div className="metric-date-range-modal-header">
                <div className="metric-date-range-modal-title">Date range</div>
                <button
                  type="button"
                  className="metric-date-range-modal-close"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="metric-date-range-modal-body">
                <div className="metric-date-range-presets">
                  <button
                    type="button"
                    className={`metric-date-range-preset ${
                      draft.preset === "all" ? "active" : ""
                    }`}
                    onClick={() => setPreset("all")}
                  >
                    All time
                  </button>
                  <button
                    type="button"
                    className={`metric-date-range-preset ${
                      draft.preset === "last_week" ? "active" : ""
                    }`}
                    onClick={() => setPreset("last_week")}
                  >
                    Last week
                  </button>
                  <button
                    type="button"
                    className={`metric-date-range-preset ${
                      draft.preset === "last_month" ? "active" : ""
                    }`}
                    onClick={() => setPreset("last_month")}
                  >
                    Last month
                  </button>
                  <button
                    type="button"
                    className={`metric-date-range-preset ${
                      draft.preset === "custom" ? "active" : ""
                    }`}
                    onClick={() => setPreset("custom")}
                  >
                    Custom
                  </button>
                </div>

                <div className="metric-date-range-custom">
                  <label className="metric-date-range-field">
                    <div className="metric-date-range-field-label">Start</div>
                    <input
                      type="date"
                      value={draft.start_date || ""}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          preset: "custom",
                          start_date: e.target.value || null,
                        }))
                      }
                    />
                  </label>

                  <label className="metric-date-range-field">
                    <div className="metric-date-range-field-label">End</div>
                    <input
                      type="date"
                      value={draft.end_date || ""}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          preset: "custom",
                          end_date: e.target.value || null,
                        }))
                      }
                    />
                  </label>
                </div>

                {!isValid && (
                  <div className="metric-date-range-error">
                    Start date must be on or before end date.
                  </div>
                )}
              </div>

              <div className="metric-date-range-modal-footer">
                <button
                  type="button"
                  className="metric-date-range-button secondary"
                  onClick={() => {
                    setDraft(value);
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="metric-date-range-button"
                  onClick={apply}
                  disabled={!isValid}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}


