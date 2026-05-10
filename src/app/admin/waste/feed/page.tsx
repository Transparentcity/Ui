"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DetectorRail } from "@/components/admin/waste/feed/DetectorRail";
import {
  FindingsStream,
  type FindingsFilter,
  type FindingsPeriod,
} from "@/components/admin/waste/feed/FindingsStream";
import { ProvenancePanel } from "@/components/admin/waste/feed/ProvenancePanel";
import {
  SeymourCollapsedTab,
  SeymourRail,
} from "@/components/admin/waste/feed/SeymourRail";
import {
  DETECTORS,
  SEYMOUR,
  getDetectorById,
  getFindingsForCity,
  type Detector,
  type Finding,
  type WasteStateMode,
} from "@/lib/wasteFixtures";
import styles from "@/components/admin/waste/feed/feed.module.css";

const VALID_FILTERS: readonly FindingsFilter[] = ["all", "high", "med"];
const VALID_PERIODS: readonly FindingsPeriod[] = ["today", "week", "month"];
const VALID_MODES: readonly WasteStateMode[] = ["rich", "quiet", "degraded"];

function asEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function applyFilter(findings: readonly Finding[], filter: FindingsFilter): readonly Finding[] {
  if (filter === "all") return findings;
  if (filter === "high") return findings.filter(f => f.severity === "high");
  return findings.filter(f => f.severity !== "low");
}

function FeedView() {
  const router = useRouter();
  const params = useSearchParams();

  const cityId = params.get("city") ?? "sf";
  const stateMode = asEnum<WasteStateMode>(params.get("state"), VALID_MODES, "rich");
  const filter = asEnum<FindingsFilter>(params.get("filter"), VALID_FILTERS, "all");
  const period = asEnum<FindingsPeriod>(params.get("period"), VALID_PERIODS, "today");

  const isQuiet = stateMode === "quiet";
  const isDegraded = stateMode === "degraded";
  const isSparse = cityId === "atx";

  const sourceFindings = useMemo(
    () => (isQuiet ? [] : getFindingsForCity(cityId)),
    [cityId, isQuiet]
  );
  const visibleFindings = useMemo(
    () => applyFilter(sourceFindings, filter),
    [sourceFindings, filter]
  );

  const detectorById = useMemo<Record<string, Detector>>(
    () => Object.fromEntries(DETECTORS.map(d => [d.id, d])),
    []
  );

  const urlDetectorId = params.get("detector");
  const urlFindingId = params.get("finding");

  const fallbackFinding = sourceFindings[0] ?? null;
  const fallbackDetectorId = fallbackFinding?.detectorId ?? DETECTORS[0].id;

  const selectedFinding =
    sourceFindings.find(f => f.id === urlFindingId) ?? fallbackFinding;
  const selectedDetectorId =
    (urlDetectorId && getDetectorById(urlDetectorId)?.id) ??
    selectedFinding?.detectorId ??
    fallbackDetectorId;

  const selectedDetector = getDetectorById(selectedDetectorId) ?? null;
  const findingForPanel =
    selectedFinding && selectedFinding.detectorId === selectedDetectorId
      ? selectedFinding
      : null;

  const [query, setQuery] = useState("");
  const [seymourCollapsed, setSeymourCollapsed] = useState(false);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/admin/waste/feed?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  // Keep the URL pointing at a valid finding/detector after city or state changes.
  useEffect(() => {
    if (isQuiet) return;
    if (!sourceFindings.length) return;
    const findingValid = urlFindingId && sourceFindings.some(f => f.id === urlFindingId);
    if (!findingValid && fallbackFinding) {
      updateParams({
        finding: fallbackFinding.id,
        detector: fallbackFinding.detectorId,
      });
    }
  }, [cityId, stateMode, isQuiet, sourceFindings, urlFindingId, fallbackFinding, updateParams]);

  const handleSelectFinding = (id: string) => {
    const f = sourceFindings.find(x => x.id === id);
    if (!f) return;
    updateParams({ finding: f.id, detector: f.detectorId });
  };

  const handleSelectDetector = (id: string) => {
    updateParams({ detector: id });
  };

  return (
    <div className={styles.feed}>
      <DetectorRail
        detectors={DETECTORS}
        selectedDetectorId={selectedDetectorId}
        onSelect={handleSelectDetector}
        query={query}
        onQueryChange={setQuery}
        isSparse={isSparse}
      />
      <FindingsStream
        findings={visibleFindings}
        detectorById={detectorById}
        selectedFindingId={selectedFinding?.id ?? null}
        onSelect={handleSelectFinding}
        filter={filter}
        onFilterChange={f => updateParams({ filter: f === "all" ? null : f })}
        period={period}
        onPeriodChange={p => updateParams({ period: p === "today" ? null : p })}
        isQuiet={isQuiet}
        isDegraded={isDegraded}
      />
      <ProvenancePanel detector={selectedDetector} finding={findingForPanel} />
      {seymourCollapsed ? (
        <SeymourCollapsedTab count={SEYMOUR.clusters.length} onExpand={() => setSeymourCollapsed(false)} />
      ) : (
        <SeymourRail
          data={SEYMOUR}
          onCollapse={() => setSeymourCollapsed(true)}
          isQuiet={isQuiet || isSparse}
        />
      )}
    </div>
  );
}

export default function WasteFeedPage() {
  return (
    <Suspense fallback={<div className={styles.feed} />}>
      <FeedView />
    </Suspense>
  );
}
