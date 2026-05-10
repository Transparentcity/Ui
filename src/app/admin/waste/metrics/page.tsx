"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { Mono, SeverityChip, SeverityDot } from "@/components/admin/waste/primitives";
import { useWasteAdminDetectors } from "@/lib/hooks/useWasteAdmin";
import { adaptDetector, categoryFromBackend } from "@/lib/admin/waste/adapters";
import { DETECTOR_CATEGORIES, type Detector, type DetectorCategoryId } from "@/lib/wasteFixtures";
import styles from "./metrics.module.css";

function MetricsView() {
  const params = useSearchParams();
  const citySlug = params.get("city") ?? "san-francisco";
  const { data, isLoading, error, refetch } = useWasteAdminDetectors(citySlug);

  const grouped = useMemo<Record<DetectorCategoryId, Detector[]>>(() => {
    const out: Record<DetectorCategoryId, Detector[]> = {
      vendor: [], payroll: [], benefits: [], permits: [], cards: [], stat: [],
    };
    for (const d of data ?? []) {
      const cat = categoryFromBackend(d);
      out[cat].push(adaptDetector(d));
    }
    return out;
  }, [data]);

  if (error) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Methodology</h2>
        <p className={styles.subtitle} role="alert">
          Couldn&apos;t load detector catalog: {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
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

  const totalDetectors = (data ?? []).length;
  if (totalDetectors === 0) {
    return (
      <div className={styles.page} data-testid="waste-metrics-page">
        <div className={styles.header}>
          <h2 className={styles.title}>Methodology</h2>
          <p className={styles.subtitle}>
            No detectors configured for this city yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="waste-metrics-page">
      <div className={styles.header}>
        <h2 className={styles.title}>Methodology</h2>
        <p className={styles.subtitle}>
          Indexed catalog of every detector this module runs. Each entry shows what it flags,
          the standards it anchors to, calculation method, sources, and historical precision.
        </p>
      </div>

      {DETECTOR_CATEGORIES.map(cat => {
        const items = grouped[cat.id] ?? [];
        if (!items.length) return null;
        return (
          <section key={cat.id} className={styles.categoryBlock} data-category={cat.id}>
            <div className={styles.categoryHeader}>
              <h3 className={styles.categoryLabel}>{cat.label}</h3>
              <Mono>{items.length} active</Mono>
            </div>
            <div className={styles.list}>
              {items.map(d => (
                <div key={d.id} className={styles.row} data-detector-id={d.id}>
                  <div>
                    <div className={styles.idLine}>
                      <SeverityDot level={d.severity} />
                      <Mono color="#9ca3af">{d.id}</Mono>
                      <SeverityChip level={d.severity} />
                    </div>
                    <div className={styles.detectorName}>{d.name}</div>
                    {d.sources.length > 0 ? (
                      <div className={styles.sourcesWrap}>
                        <div className={styles.sourcesLabel}>Standards basis</div>
                        <div className={styles.sourceTags}>
                          {d.sources.map(s => (
                            <span key={s} className={styles.sourceTag}>{s}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className={styles.plainLabel}>What it flags</div>
                    <p className={styles.plainText}>{d.plain}</p>
                    {d.historical && d.historical.summary ? (
                      <div className={styles.exampleCallout}>
                        <div className={styles.exampleHeader}>
                          <span className={styles.seymourBadge}>
                            <span className={styles.seymourBadgeDot} />
                            Anchor
                          </span>
                          <span className={styles.exampleLabel}>{d.historical.case}</span>
                        </div>
                        <p className={styles.exampleText}>{d.historical.lesson}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
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
