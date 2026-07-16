"use client";

import { useId, useState, type ReactNode } from "react";
import type { MetricSourceInformation } from "@/lib/metricDatasetAttribution";
import "./SourceInformationPanel.css";

export type SourceInformationFields = MetricSourceInformation;

/**
 * Format start/end (either may be null) into a label like "Apr 1 – Apr 30, 2026".
 * Returns null when neither bound is present.
 */
export function formatSourceDateRange(
  startDate?: string | null,
  endDate?: string | null,
): string | null {
  const hasStart = typeof startDate === "string" && startDate.trim().length > 0;
  const hasEnd = typeof endDate === "string" && endDate.trim().length > 0;
  if (!hasStart && !hasEnd) return null;

  const parse = (value: string): Date | null => {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const start = hasStart ? parse(startDate as string) : null;
  const end = hasEnd ? parse(endDate as string) : null;

  const fmt = (d: Date, withYear: boolean): string =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });

  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    return sameYear
      ? `${fmt(start, false)} – ${fmt(end, true)}`
      : `${fmt(start, true)} – ${fmt(end, true)}`;
  }
  if (start) return `From ${fmt(start, true)}`;
  if (end) return `Through ${fmt(end as Date, true)}`;
  if (hasStart && hasEnd) return `${startDate} – ${endDate}`;
  return (startDate as string) || (endDate as string) || null;
}

export function hasSourceInformation(
  sourceInfo: SourceInformationFields | null | undefined,
): boolean {
  if (!sourceInfo) return false;
  return Boolean(
    sourceInfo.dataset_name?.trim() ||
      sourceInfo.dataset_id?.trim() ||
      sourceInfo.dataset_url?.trim() ||
      sourceInfo.query_url?.trim() ||
      sourceInfo.query_text?.trim() ||
      sourceInfo.city_portal_url?.trim() ||
      sourceInfo.city_portal_domain?.trim(),
  );
}

/** One source entry for maps composed of multiple datasets (e.g. multi-layer maps). */
export type SourceInformationEntry = {
  /** Layer/section heading, e.g. the layer title. */
  title?: string | null;
  sourceInfo: SourceInformationFields;
  startDate?: string | null;
  endDate?: string | null;
};

type SourceInformationPanelProps = {
  sourceInfo?: SourceInformationFields | null;
  startDate?: string | null;
  endDate?: string | null;
  /**
   * Per-layer sources for multi-dataset maps. When provided (non-empty),
   * these are rendered as titled sections instead of the single sourceInfo.
   */
  layerSources?: SourceInformationEntry[];
  /** Controlled expanded state; omit for internal state. */
  expanded?: boolean;
  onToggle?: () => void;
  /** Button label. Defaults to "Source". */
  toggleLabel?: string;
  className?: string;
  /**
   * Soften the chrome for use under metric detail charts/maps
   * (text link rather than full-width card header).
   */
  variant?: "card" | "inline";
};

/** Dataset/portal/fetch-URL/date-range/query rows for a single source. */
function SourceDetailsGrid({
  sourceInfo,
  startDate,
  endDate,
}: {
  sourceInfo: SourceInformationFields;
  startDate?: string | null;
  endDate?: string | null;
}): ReactNode {
  const dateRangeLabel = formatSourceDateRange(startDate, endDate);
  const portalLabel =
    sourceInfo.city_portal_domain?.trim() ||
    sourceInfo.city_name?.trim() ||
    null;

  return (
    <>
      <div className="map-source-grid">
        {(sourceInfo.dataset_name || sourceInfo.dataset_id) && (
          <div className="map-source-row">
            <span className="map-source-label">Dataset</span>
            <span className="map-source-value">
              {sourceInfo.dataset_url ? (
                <a
                  href={sourceInfo.dataset_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="map-source-link"
                >
                  {sourceInfo.dataset_name || sourceInfo.dataset_id}
                </a>
              ) : (
                sourceInfo.dataset_name || sourceInfo.dataset_id
              )}
            </span>
          </div>
        )}

        {sourceInfo.dataset_id && sourceInfo.dataset_name && (
          <div className="map-source-row">
            <span className="map-source-label">Dataset ID</span>
            <span className="map-source-value">
              <code>{sourceInfo.dataset_id}</code>
            </span>
          </div>
        )}

        {(sourceInfo.city_portal_url || portalLabel) && (
          <div className="map-source-row">
            <span className="map-source-label">Portal</span>
            <span className="map-source-value">
              {sourceInfo.city_portal_url ? (
                <a
                  href={sourceInfo.city_portal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="map-source-link"
                >
                  {portalLabel || sourceInfo.city_portal_url}
                </a>
              ) : (
                portalLabel
              )}
            </span>
          </div>
        )}

        {sourceInfo.query_url && (
          <div className="map-source-row">
            <span className="map-source-label">Fetch URL</span>
            <span className="map-source-value">
              <a
                href={sourceInfo.query_url}
                target="_blank"
                rel="noopener noreferrer"
                className="map-source-link"
              >
                {sourceInfo.query_url}
              </a>
            </span>
          </div>
        )}

        {dateRangeLabel && (
          <div className="map-source-row">
            <span className="map-source-label">Date range</span>
            <span className="map-source-value">{dateRangeLabel}</span>
          </div>
        )}
      </div>

      {sourceInfo.query_text && (
        <>
          <div className="map-source-query-label">Query</div>
          <pre className="map-source-query">{sourceInfo.query_text}</pre>
        </>
      )}
    </>
  );
}

/**
 * Collapsible source provenance panel shared by public maps and metric detail
 * embeds. Matches the full-map fields: dataset, ID, fetch URL, date range, query.
 */
export default function SourceInformationPanel({
  sourceInfo,
  startDate,
  endDate,
  layerSources,
  expanded: controlledExpanded,
  onToggle,
  toggleLabel = "Source",
  className,
  variant = "card",
}: SourceInformationPanelProps): ReactNode {
  const detailsId = useId();
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded;
  const handleToggle =
    onToggle ??
    (() => {
      setUncontrolledExpanded((current) => !current);
    });

  const hasLayerSources = Boolean(layerSources && layerSources.length > 0);
  if (!hasLayerSources && !sourceInfo) return null;

  return (
    <section
      className={[
        "map-source-section",
        variant === "inline" ? "map-source-section--inline" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Source information"
    >
      <button
        type="button"
        className={
          variant === "inline" ? "map-source-toggle-inline" : "map-source-toggle"
        }
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={handleToggle}
      >
        <span>{toggleLabel}</span>
        {variant === "card" ? (
          <span className="map-source-toggle-icon" aria-hidden="true">
            {expanded ? "−" : "+"}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div id={detailsId} className="map-source-details">
          <div className="map-source-intro">
            <p>
              Transparent.city turns official public records into clear,
              source-linked maps so residents, advocates, and local leaders can
              work from the same facts.
            </p>
            <p>
              {hasLayerSources && (layerSources as SourceInformationEntry[]).length > 1
                ? "This visualization is built from the government datasets linked below — one per map layer."
                : "This visualization is built from the government dataset linked below."}{" "}
              We keep the underlying source visible, document the fetch URL and
              query when available, and link back to the original record so you
              can verify everything yourself.
            </p>
          </div>

          {hasLayerSources ? (
            (layerSources as SourceInformationEntry[]).map((entry, index) => (
              <div key={index} className="map-source-layer">
                {entry.title ? (
                  <div className="map-source-layer-title">{entry.title}</div>
                ) : null}
                <SourceDetailsGrid
                  sourceInfo={entry.sourceInfo}
                  startDate={entry.startDate}
                  endDate={entry.endDate}
                />
              </div>
            ))
          ) : (
            <SourceDetailsGrid
              sourceInfo={sourceInfo as SourceInformationFields}
              startDate={startDate}
              endDate={endDate}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
