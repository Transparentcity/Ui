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
  FeedErrorState,
  FeedLoadingSkeleton,
} from "@/components/admin/waste/feed/AsyncStates";
import {
  useWasteAdminDetectors,
  useWasteAdminFindings,
  useWasteAdminSeymourFeed,
} from "@/lib/hooks/useWasteAdmin";
import {
  adaptDetector,
  adaptFinding,
  adaptSeymour,
} from "@/lib/admin/waste/adapters";
import type { Detector, Finding } from "@/lib/wasteFixtures";
import styles from "@/components/admin/waste/feed/feed.module.css";

const VALID_FILTERS: readonly FindingsFilter[] = ["all", "high", "med"];
const VALID_PERIODS: readonly FindingsPeriod[] = ["today", "week", "month"];

function asEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function FeedView() {
  const router = useRouter();
  const params = useSearchParams();

  const citySlug = params.get("city") ?? "san-francisco";
  const filter = asEnum<FindingsFilter>(params.get("filter"), VALID_FILTERS, "all");
  const period = asEnum<FindingsPeriod>(params.get("period"), VALID_PERIODS, "today");

  const detectorsQ = useWasteAdminDetectors(citySlug);
  const findingsQ = useWasteAdminFindings({ citySlug, period, filter });
  const seymourQ = useWasteAdminSeymourFeed(citySlug);

  const detectors = useMemo<Detector[]>(
    () => (detectorsQ.data ?? []).map(adaptDetector),
    [detectorsQ.data]
  );
  const detectorById = useMemo<Record<string, Detector>>(
    () => Object.fromEntries(detectors.map(d => [d.id, d])),
    [detectors]
  );
  const findings = useMemo<Finding[]>(
    () => (findingsQ.data ?? []).map(adaptFinding),
    [findingsQ.data]
  );
  const seymour = useMemo(
    () =>
      seymourQ.data
        ? adaptSeymour(seymourQ.data)
        : {
            todaysRead: "",
            generatedAt: "",
            clusters: [],
            suggested: [],
          },
    [seymourQ.data]
  );

  const urlDetectorId = params.get("detector");
  const urlFindingId = params.get("finding");

  const fallbackFinding = findings[0] ?? null;
  const fallbackDetectorId =
    fallbackFinding?.detectorId ?? detectors[0]?.id ?? null;

  const selectedFinding = findings.find(f => f.id === urlFindingId) ?? fallbackFinding;
  const selectedDetectorId =
    (urlDetectorId && detectorById[urlDetectorId]?.id) ??
    selectedFinding?.detectorId ??
    fallbackDetectorId;

  const selectedDetector = selectedDetectorId
    ? detectorById[selectedDetectorId] ?? null
    : null;
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

  useEffect(() => {
    if (!findings.length) return;
    const valid = urlFindingId && findings.some(f => f.id === urlFindingId);
    if (!valid && fallbackFinding) {
      updateParams({ finding: fallbackFinding.id, detector: fallbackFinding.detectorId });
    }
  }, [findings, urlFindingId, fallbackFinding, updateParams]);

  const handleSelectFinding = (id: string) => {
    const f = findings.find(x => x.id === id);
    if (!f) return;
    updateParams({ finding: f.id, detector: f.detectorId });
  };

  const handleSelectDetector = (id: string) => updateParams({ detector: id });

  const isLoading = detectorsQ.isLoading || findingsQ.isLoading;
  const error = detectorsQ.error ?? findingsQ.error;
  const isQuiet = !isLoading && findings.length === 0;

  if (error) {
    return (
      <div className={styles.feed}>
        <FeedErrorState
          error={error}
          onRetry={() => {
            detectorsQ.refetch();
            findingsQ.refetch();
            seymourQ.refetch();
          }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.feed}>
        <FeedLoadingSkeleton label="Loading detectors and findings" />
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      <DetectorRail
        detectors={detectors}
        selectedDetectorId={selectedDetectorId}
        onSelect={handleSelectDetector}
        query={query}
        onQueryChange={setQuery}
        isSparse={detectors.length > 0 && detectors.length < 10}
      />
      <FindingsStream
        findings={findings}
        detectorById={detectorById}
        selectedFindingId={selectedFinding?.id ?? null}
        onSelect={handleSelectFinding}
        filter={filter}
        onFilterChange={f => updateParams({ filter: f === "all" ? null : f })}
        period={period}
        onPeriodChange={p => updateParams({ period: p === "today" ? null : p })}
        isQuiet={isQuiet}
        isDegraded={false}
      />
      <ProvenancePanel detector={selectedDetector} finding={findingForPanel} />
      {seymourCollapsed ? (
        <SeymourCollapsedTab
          count={seymour.clusters.length}
          onExpand={() => setSeymourCollapsed(false)}
        />
      ) : (
        <SeymourRail
          data={seymour}
          onCollapse={() => setSeymourCollapsed(true)}
          isQuiet={isQuiet}
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
