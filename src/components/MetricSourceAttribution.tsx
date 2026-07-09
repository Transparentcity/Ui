"use client";

import type { ReactNode } from "react";

export type CompactSourceInfo = {
  dataset_name?: string | null;
  dataset_id?: string | null;
  dataset_url?: string | null;
  city_portal_domain?: string | null;
};

/**
 * Compact "Source: Dataset Name" line used under charts/maps on metric pages,
 * mirroring the embedded landing-page attribution pattern.
 */
export default function MetricSourceAttribution({
  sourceInfo,
  className,
}: {
  sourceInfo: CompactSourceInfo | null | undefined;
  className?: string;
}): ReactNode {
  if (!sourceInfo) return null;
  const label =
    sourceInfo.dataset_name?.trim() ||
    sourceInfo.dataset_id?.trim() ||
    null;
  if (!label) return null;

  const url = sourceInfo.dataset_url?.trim() || null;
  const portalHint = sourceInfo.city_portal_domain?.trim() || null;

  return (
    <p className={className ?? "metric-source-attribution"} aria-label="Data source">
      <span className="metric-source-attribution-label">Source:</span>{" "}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="metric-source-attribution-link"
        >
          {label}
        </a>
      ) : (
        <strong>{label}</strong>
      )}
      {portalHint ? (
        <span className="metric-source-attribution-portal"> ({portalHint})</span>
      ) : null}
    </p>
  );
}
