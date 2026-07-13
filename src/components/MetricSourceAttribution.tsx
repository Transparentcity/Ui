"use client";

import type { ReactNode } from "react";
import SourceInformationPanel, {
  hasSourceInformation,
  type SourceInformationFields,
} from "./SourceInformationPanel";

export type CompactSourceInfo = SourceInformationFields;

/**
 * Compact "Source" control under charts/maps on metric pages.
 * Expands to the same provenance panel used on full public maps.
 */
export default function MetricSourceAttribution({
  sourceInfo,
  startDate,
  endDate,
  className,
}: {
  sourceInfo: CompactSourceInfo | null | undefined;
  startDate?: string | null;
  endDate?: string | null;
  className?: string;
}): ReactNode {
  if (!hasSourceInformation(sourceInfo)) return null;

  return (
    <SourceInformationPanel
      sourceInfo={sourceInfo!}
      startDate={startDate}
      endDate={endDate}
      toggleLabel="Source"
      variant="inline"
      className={className}
    />
  );
}
