"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  FindingsStream,
  type FindingsFilter,
  type FindingsPeriod,
} from "@/components/admin/waste/feed/FindingsStream";
import { ProvenancePanel } from "@/components/admin/waste/feed/ProvenancePanel";
import {
  DETECTORS,
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

function FindingsView() {
  const router = useRouter();
  const params = useSearchParams();

  const cityId = params.get("city") ?? "sf";
  const stateMode = asEnum<WasteStateMode>(params.get("state"), VALID_MODES, "rich");
  const filter = asEnum<FindingsFilter>(params.get("filter"), VALID_FILTERS, "all");
  const period = asEnum<FindingsPeriod>(params.get("period"), VALID_PERIODS, "today");

  const isQuiet = stateMode === "quiet";
  const isDegraded = stateMode === "degraded";

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

  const urlFindingId = params.get("finding");
  const fallbackFinding = sourceFindings[0] ?? null;

  const selectedFinding =
    sourceFindings.find(f => f.id === urlFindingId) ?? fallbackFinding;
  const selectedDetector = selectedFinding
    ? getDetectorById(selectedFinding.detectorId) ?? null
    : null;

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
    if (isQuiet) return;
    if (!sourceFindings.length) return;
    const findingValid = urlFindingId && sourceFindings.some(f => f.id === urlFindingId);
    if (!findingValid && fallbackFinding) {
      updateParams({ finding: fallbackFinding.id });
    }
  }, [cityId, stateMode, isQuiet, sourceFindings, urlFindingId, fallbackFinding, updateParams]);

  const handleSelectFinding = (id: string) => {
    const f = sourceFindings.find(x => x.id === id);
    if (!f) return;
    updateParams({ finding: f.id });
  };

  return (
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
        isDegraded={isDegraded}
      />
      <ProvenancePanel detector={selectedDetector} finding={selectedFinding} />
    </div>
  );
}

export default function WasteFindingsPage() {
  return (
    <Suspense fallback={<div className={styles.feed} />}>
      <FindingsView />
    </Suspense>
  );
}
