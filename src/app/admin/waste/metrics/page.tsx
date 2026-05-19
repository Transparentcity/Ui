"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Mono, SeverityChip, SeverityDot } from "@/components/admin/waste/primitives";
import {
  useWasteAdminDetectors,
  useWasteAdminFindings,
} from "@/lib/hooks/useWasteAdmin";
import { adaptDetector, adaptFinding, categoryFromBackend } from "@/lib/admin/waste/adapters";
import { getWasteApiSlug } from "@/lib/admin/waste/cities";
import {
  DETECTOR_CATEGORIES,
  type Detector,
  type DetectorCategoryId,
} from "@/lib/wasteFixtures";
import styles from "./metrics.module.css";

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
    return Object.fromEntries(all.map(d => [d.id, d]));
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
      <div className={styles.page}>
        <h2 className={styles.title}>Methodology</h2>
        <p className={styles.subtitle} role="alert">
          Couldn&apos;t load detector catalog:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          type="button"
          onClick={() => detectorsQ.refetch()}
          style={{ padding: "6px 12px", marginTop: 8 }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Methodology</h2>
        <p className={styles.subtitle}>Loading detector catalog…</p>
      </div>
    );
  }

  const totalDetectors = allDetectorsOrdered.length;
  if (totalDetectors === 0) {
    return (
      <div className={styles.page} data-testid="waste-metrics-page">
        <div className={styles.header}>
          <h2 className={styles.title}>Methodology</h2>
          <p className={styles.subtitle}>No detectors configured for this city yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.split} data-testid="waste-metrics-page">
      <aside className={styles.listPane} aria-label="Detector catalog">
        <div className={styles.listHeader}>
          <h2 className={styles.listTitle}>Detectors</h2>
          <Mono>{totalDetectors} active</Mono>
        </div>
        <div className={styles.listScroll}>
          {DETECTOR_CATEGORIES.map(cat => {
            const items = grouped[cat.id] ?? [];
            if (!items.length) return null;
            return (
              <div key={cat.id} className={styles.catBlock}>
                <div className={styles.catHeader}>
                  <span className={styles.catLabel}>{cat.label}</span>
                  <Mono>{items.length}</Mono>
                </div>
                {items.map(d => {
                  const isSel = selectedDetectorId === d.id;
                  const count = weeklyCountById[d.id] ?? 0;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => updateParams({ detector: d.id })}
                      className={`${styles.listRow} ${isSel ? styles.listRowSel : ""}`}
                      aria-pressed={isSel}
                      data-detector-id={d.id}
                    >
                      <div className={styles.listRowMain}>
                        <div className={styles.listRowTop}>
                          <SeverityDot level={d.severity} />
                          <Mono color="#9ca3af">{d.id}</Mono>
                        </div>
                        <div className={styles.listRowName}>{d.name}</div>
                      </div>
                      <div className={styles.countChip} title="Findings this week">
                        {count}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={styles.listFooter}>
          <Mono color="#9ca3af">Counts: findings this week</Mono>
        </div>
      </aside>

      <section className={styles.detailPane} aria-label="Detector detail">
        {selectedDetector ? (
          <div className={styles.detailScroll}>
            <div className={styles.detailHeader}>
              <div className={styles.idLine}>
                <SeverityDot level={selectedDetector.severity} />
                <Mono color="#9ca3af">{selectedDetector.id}</Mono>
                <SeverityChip level={selectedDetector.severity} />
              </div>
              <h2 className={styles.detailName}>{selectedDetector.name}</h2>
              <div className={styles.weeklyCountRow}>
                <span className={styles.plainLabel}>Findings this week</span>
                <Mono>{weeklyCountById[selectedDetector.id] ?? 0}</Mono>
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.plainLabel}>What it flags</div>
              <p className={styles.plainText}>{selectedDetector.plain}</p>
            </div>

            {selectedDetector.sources.length > 0 ? (
              <div className={styles.detailSection}>
                <div className={styles.plainLabel}>Standards basis</div>
                <div className={styles.sourceTags}>
                  {selectedDetector.sources.map(s => (
                    <span key={s} className={styles.sourceTag}>{s}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedDetector.historical && selectedDetector.historical.summary ? (
              <div className={styles.exampleCallout}>
                <div className={styles.exampleHeader}>
                  <span className={styles.seymourBadge}>
                    <span className={styles.seymourBadgeDot} />
                    Anchor
                  </span>
                  <span className={styles.exampleLabel}>
                    {selectedDetector.historical.case}
                  </span>
                </div>
                <p className={styles.exampleText}>
                  {selectedDetector.historical.lesson}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.detailEmpty}>
            Select a detector on the left to see how it works.
          </div>
        )}
      </section>
    </div>
  );
}

export default function WasteMetricsPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <MetricsView />
    </Suspense>
  );
}
