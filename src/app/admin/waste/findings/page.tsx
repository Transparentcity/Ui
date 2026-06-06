"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
import { getWasteApiSlug } from "@/lib/admin/waste/cities";
import { useWasteState } from "@/lib/admin/waste/useWasteState";
import type { Detector } from "@/lib/wasteFixtures";
import styles from "@/components/admin/waste/feed/feed.module.css";

const VALID_FILTERS: readonly FindingsFilter[] = ["all", "high", "med"];
const VALID_PERIODS: readonly FindingsPeriod[] = ["today", "week", "month"];
const VALID_VIEWS = ["full", "brief"] as const;
type ViewMode = (typeof VALID_VIEWS)[number];

function asEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function FindingsPageView() {
  const router = useRouter();
  const params = useSearchParams();

  const citySlug = getWasteApiSlug(params.get("city"));
  const filter = asEnum<FindingsFilter>(params.get("filter"), VALID_FILTERS, "all");
  const period = asEnum<FindingsPeriod>(params.get("period"), VALID_PERIODS, "today");
  const view = asEnum<ViewMode>(params.get("view"), VALID_VIEWS, "full");

  const findingsQ = useWasteAdminFindings({ citySlug, period, filter });
  const detectorsQ = useWasteAdminDetectors(citySlug);
  const seymourQ = useWasteAdminSeymourFeed(citySlug);
  const ui = useWasteState();

  const visibleFindings = useMemo(
    () => (findingsQ.data ?? []).map(adaptFinding),
    [findingsQ.data]
  );

  const detectorById = useMemo<Record<string, Detector>>(() => {
    const rows = detectorsQ.data ?? [];
    return Object.fromEntries(rows.map(d => [d.id, adaptDetector(d)]));
  }, [detectorsQ.data]);

  const seymour = useMemo(
    () =>
      seymourQ.data
        ? adaptSeymour(seymourQ.data)
        : { todaysRead: "", generatedAt: "", clusters: [], suggested: [] },
    [seymourQ.data]
  );

  const urlFindingId = params.get("finding");
  const fallbackFinding = visibleFindings[0] ?? null;
  const selectedFinding =
    visibleFindings.find(f => f.id === urlFindingId) ?? fallbackFinding;
  const selectedDetector =
    selectedFinding ? detectorById[selectedFinding.detectorId] ?? null : null;

  const [seymourCollapsed, setSeymourCollapsed] = useState(false);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/admin/waste/findings?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  useEffect(() => {
    if (!visibleFindings.length) return;
    const valid = urlFindingId && visibleFindings.some(f => f.id === urlFindingId);
    if (!valid && fallbackFinding) updateParams({ finding: fallbackFinding.id });
  }, [visibleFindings, urlFindingId, fallbackFinding, updateParams]);

  const handleSelectFinding = (id: string) => {
    const f = visibleFindings.find(x => x.id === id);
    if (!f) return;
    updateParams({ finding: f.id });
  };

  const setView = (v: ViewMode) => updateParams({ view: v === "full" ? null : v });

  const isLoading = findingsQ.isLoading || detectorsQ.isLoading;
  const error = findingsQ.error ?? detectorsQ.error;
  const isQuiet = !isLoading && visibleFindings.length === 0;

  const toggleBar = (
    <div className={styles.viewToggleBar}>
      <span className={styles.viewToggleLabel}>View</span>
      <div className={styles.viewToggle} role="tablist" aria-label="Findings view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "full"}
          className={`${styles.viewToggleBtn} ${view === "full" ? styles.viewToggleBtnActive : ""}`}
          onClick={() => setView("full")}
        >
          Full
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "brief"}
          className={`${styles.viewToggleBtn} ${view === "brief" ? styles.viewToggleBtnActive : ""}`}
          onClick={() => setView("brief")}
        >
          Brief
        </button>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className={styles.findingsPage}>
        {toggleBar}
        <div className={styles.feed}>
          <FeedErrorState
            error={error}
            onRetry={() => {
              findingsQ.refetch();
              detectorsQ.refetch();
              seymourQ.refetch();
            }}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.findingsPage}>
        {toggleBar}
        <div className={styles.feed}>
          <FeedLoadingSkeleton label="Loading findings" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.findingsPage}>
      {toggleBar}
      <div className={styles.feed}>
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
          isDegraded={ui.failingCount > 0}
          detectorCount={Object.keys(detectorById).length}
          degradedCount={ui.failingCount}
          degradedDetectorId={ui.failingDetectorId}
        />
        <ProvenancePanel detector={selectedDetector} finding={selectedFinding} />
        {view === "full" ? (
          seymourCollapsed ? (
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
          )
        ) : null}
      </div>
    </div>
  );
}

export default function WasteFindingsPage() {
  return (
    <Suspense fallback={<div className={styles.findingsPage} />}>
      <FindingsPageView />
    </Suspense>
  );
}
