import { Mono, SeverityChip, SeverityDot } from "@/components/admin/waste/primitives";
import { DETECTOR_CATEGORIES, DETECTORS } from "@/lib/wasteFixtures";
import styles from "./metrics.module.css";

export default function WasteMetricsPage() {
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
        const items = DETECTORS.filter(d => d.category === cat.id);
        if (!items.length) return null;
        return (
          <section key={cat.id} className={styles.categoryBlock} data-category={cat.id}>
            <div className={styles.categoryHeader}>
              <h3 className={styles.categoryLabel}>{cat.label}</h3>
              <Mono>{cat.count} detectors · {items.length} documented</Mono>
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
                    <Mono>
                      Last tuned {d.lastTuned} · historical precision {Math.round(d.precision * 100)}%
                    </Mono>
                    <div className={styles.sourcesWrap}>
                      <div className={styles.sourcesLabel}>Data sources joined</div>
                      <div className={styles.sourceTags}>
                        {d.sources.map(s => (
                          <span key={s} className={styles.sourceTag}>{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className={styles.plainLabel}>What it flags · plain language</div>
                    <p className={styles.plainText}>{d.plain}</p>
                    {d.historical ? (
                      <div className={styles.exampleCallout}>
                        <div className={styles.exampleHeader}>
                          <span className={styles.seymourBadge}>
                            <span className={styles.seymourBadgeDot} />
                            Seymour
                          </span>
                          <span className={styles.exampleLabel}>Example finding</span>
                        </div>
                        <p className={styles.exampleText}>
                          Tuned on {d.historical.case}. {d.historical.lesson}
                        </p>
                      </div>
                    ) : null}
                    <div className={styles.exampleLink}>
                      <button type="button" className={styles.exampleLinkBtn}>
                        View example findings →
                      </button>
                    </div>
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
