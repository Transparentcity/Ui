"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Mono, SeverityChip, SeverityDot } from "@/components/admin/waste/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useWasteAdminDetectors,
  useWasteAdminFindings,
} from "@/lib/hooks/useWasteAdmin";
import { adaptDetector, adaptFinding, categoryFromBackend } from "@/lib/admin/waste/adapters";
import { getWasteApiSlug } from "@/lib/admin/waste/cities";
import { WasteLoading } from "@/components/admin/waste/WasteLoading";
import {
  DETECTOR_CATEGORIES,
  type Detector,
  type DetectorCategoryId,
} from "@/lib/wasteFixtures";

function MetricsView() {
  const router = useRouter();
  const params = useSearchParams();
  const citySlug = getWasteApiSlug(params.get("city"));

  const detectorsQ = useWasteAdminDetectors(citySlug);
  const findingsQ = useWasteAdminFindings({ citySlug, period: "week", filter: "all" });

  const grouped = useMemo<Record<DetectorCategoryId, Detector[]>>(() => {
    const out: Record<DetectorCategoryId, Detector[]> = {
      vendor: [], payroll: [], benefits: [], permits: [], cards: [], stat: [],
    };
    for (const d of detectorsQ.data ?? []) {
      const cat = categoryFromBackend(d);
      out[cat].push(adaptDetector(d));
    }
    return out;
  }, [detectorsQ.data]);

  const detectorById = useMemo<Record<string, Detector>>(() => {
    const all = (detectorsQ.data ?? []).map(adaptDetector);
    return Object.fromEntries(all.map((d) => [d.id, d]));
  }, [detectorsQ.data]);

  const weeklyCountById = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const raw of findingsQ.data ?? []) {
      const f = adaptFinding(raw);
      counts[f.detectorId] = (counts[f.detectorId] ?? 0) + 1;
    }
    return counts;
  }, [findingsQ.data]);

  const allDetectorsOrdered = useMemo<Detector[]>(() => {
    const out: Detector[] = [];
    for (const cat of DETECTOR_CATEGORIES) {
      out.push(...(grouped[cat.id] ?? []));
    }
    return out;
  }, [grouped]);

  const urlDetectorId = params.get("detector");
  const fallbackDetectorId = allDetectorsOrdered[0]?.id ?? null;
  const selectedDetectorId =
    (urlDetectorId && detectorById[urlDetectorId]?.id) ?? fallbackDetectorId;
  const selectedDetector = selectedDetectorId
    ? detectorById[selectedDetectorId] ?? null
    : null;

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/admin/waste/metrics?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  useEffect(() => {
    if (!allDetectorsOrdered.length) return;
    const valid = urlDetectorId && detectorById[urlDetectorId];
    if (!valid && fallbackDetectorId) {
      updateParams({ detector: fallbackDetectorId });
    }
  }, [allDetectorsOrdered, urlDetectorId, detectorById, fallbackDetectorId, updateParams]);

  const error = detectorsQ.error;
  const isLoading = detectorsQ.isLoading;

  if (error) {
    return (
      <div className="px-8 py-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Methodology</h2>
        <p role="alert" className="mt-1 text-sm text-red-700">
          Couldn&apos;t load detector catalog:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => detectorsQ.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-8 py-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Methodology</h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">Loading detector catalog…</p>
      </div>
    );
  }

  const totalDetectors = allDetectorsOrdered.length;
  if (totalDetectors === 0) {
    return (
      <div className="px-8 py-6" data-testid="waste-metrics-page">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Methodology</h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">No detectors configured for this city yet.</p>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 flex gap-6 items-start" data-testid="waste-metrics-page">
      {/* List pane */}
      <aside
        className="w-72 shrink-0 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] sticky top-0 self-start max-h-[calc(100vh-9rem)] overflow-y-auto"
        aria-label="Detector catalog"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Detectors</h2>
          <Mono>{totalDetectors} active</Mono>
        </div>
        <div className="py-1">
          {DETECTOR_CATEGORIES.map((cat) => {
            const items = grouped[cat.id] ?? [];
            if (!items.length) return null;
            return (
              <div key={cat.id} className="py-1">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                    {cat.label}
                  </span>
                  <Mono>{items.length}</Mono>
                </div>
                {items.map((d) => {
                  const isSel = selectedDetectorId === d.id;
                  const count = weeklyCountById[d.id] ?? 0;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => updateParams({ detector: d.id })}
                      aria-pressed={isSel}
                      data-detector-id={d.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 text-left border-l-2 transition-colors",
                        isSel
                          ? "border-l-purple-600 bg-[var(--brand-secondary)]"
                          : "border-l-transparent hover:bg-[var(--bg-tertiary)]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <SeverityDot level={d.severity} />
                          <Mono>{d.id}</Mono>
                        </div>
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{d.name}</div>
                      </div>
                      <span
                        className="shrink-0 rounded-md bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] tabular-nums"
                        title="Findings this week"
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Detail pane */}
      <section className="flex-1 min-w-0" aria-label="Detector detail">
        {selectedDetector ? (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <SeverityDot level={selectedDetector.severity} />
                <Mono>{selectedDetector.id}</Mono>
                <SeverityChip level={selectedDetector.severity} />
              </div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {selectedDetector.name}
              </h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Findings this week
                </span>
                <Mono>{weeklyCountById[selectedDetector.id] ?? 0}</Mono>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">What it flags</div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedDetector.plain}</p>
            </div>

            {selectedDetector.sources.length > 0 ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1.5">
                  Standards basis
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDetector.sources.map((s) => (
                    <Badge key={s} variant="outline" className="px-2 py-0.5 font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedDetector.historical && selectedDetector.historical.summary ? (
              <div className="rounded-r border-l-2 border-teal-400 bg-teal-50/50 px-3 py-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" aria-hidden="true" />
                    Anchor
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    {selectedDetector.historical.case}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{selectedDetector.historical.lesson}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-[var(--text-tertiary)]">Select a detector on the left to see how it works.</div>
        )}
      </section>
    </div>
  );
}

export default function WasteMetricsPage() {
  return (
    <Suspense fallback={<WasteLoading />}>
      <MetricsView />
    </Suspense>
  );
}
