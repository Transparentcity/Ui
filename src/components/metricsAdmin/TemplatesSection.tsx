"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMetrics } from "@/lib/hooks/useMetrics";
import { useMetricCities } from "@/lib/hooks/useMetrics";
import TemplateOrderEditor from "@/components/TemplateOrderEditor";
import CrossCityComparisonChart from "@/components/CrossCityComparisonChart";
import styles from "./PlatformMetricsAdmin.module.css";

interface TemplatesSectionProps {
  adminToken: string | null;
}

export default function TemplatesSection({ adminToken }: TemplatesSectionProps) {
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const templatesQuery = useMetrics({
    metric_type: "template",
    limit: 200,
    include_record_counts: false,
  });
  const templates = templatesQuery.data ?? [];

  // Fetch all instantiated metrics (city metrics that have a template_id)
  // so we can count cities per template
  const instantiatedQuery = useMetrics({
    metric_type: "queried",
    limit: 500,
    include_record_counts: false,
  });
  const instantiated = instantiatedQuery.data ?? [];

  const citiesQuery = useMetricCities();
  const allCities = citiesQuery.data ?? [];

  // Build: template_id → Set<city_id>
  const citiesPerTemplate = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const m of instantiated) {
      if (m.template_id != null && m.city_id != null) {
        if (!map.has(m.template_id)) map.set(m.template_id, new Set());
        map.get(m.template_id)!.add(m.city_id);
      }
    }
    return map;
  }, [instantiated]);

  // Build: template_id → city names that have it
  const cityNamesPerTemplate = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const m of instantiated) {
      if (m.template_id != null && m.city_name) {
        if (!map.has(m.template_id)) map.set(m.template_id, []);
        const arr = map.get(m.template_id)!;
        if (!arr.includes(m.city_name)) arr.push(m.city_name);
      }
    }
    return map;
  }, [instantiated]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...templates].sort((a, b) => {
      const catCmp = (a.category ?? "").localeCompare(b.category ?? "", undefined, { sensitivity: "base" });
      if (catCmp !== 0) return catCmp;
      return a.metric_name.localeCompare(b.metric_name, undefined, { sensitivity: "base" });
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.metric_name.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q) ||
        (t.metric_key ?? "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  // City names for selected template's instantiated metrics
  const selectedCityNames = selectedTemplateId != null ? (cityNamesPerTemplate.get(selectedTemplateId) ?? []) : [];

  // Cities that have NOT instantiated this template
  const notInstantiatedCities = useMemo(() => {
    if (selectedTemplateId == null) return [];
    const instantiatedCityIds = citiesPerTemplate.get(selectedTemplateId) ?? new Set();
    return allCities.filter((c) => !instantiatedCityIds.has(c.id));
  }, [selectedTemplateId, citiesPerTemplate, allCities]);

  // Check if selected template has city children (for cross-city chart)
  const hasChildren = selectedTemplateId != null && (citiesPerTemplate.get(selectedTemplateId)?.size ?? 0) > 0;

  if (templatesQuery.isLoading) {
    return <div className={styles.emptyState}><i className="fas fa-spinner fa-spin" /> Loading templates…</div>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className={styles.templateToolbar}>
        <input
          type="search"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.templateSearchInput}
        />
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: "auto" }}>
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Template list */}
      <div style={{ border: "1px solid var(--border-primary)", borderRadius: 8, overflow: "hidden", background: "var(--bg-primary)" }}>
        <table className={styles.templateTable}>
          <thead>
            <tr>
              <th>Template</th>
              <th>Category</th>
              <th>Cities</th>
              <th style={{ width: 100 }}>View</th>
            </tr>
          </thead>
          <tbody>
            {filteredTemplates.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                  {search ? `No templates matching "${search}"` : "No templates found"}
                </td>
              </tr>
            ) : (
              filteredTemplates.map((t) => {
                const cityCount = citiesPerTemplate.get(t.id)?.size ?? 0;
                const isSelected = selectedTemplateId === t.id;
                return (
                  <tr
                    key={t.id}
                    className={`${styles.templateRow} ${isSelected ? styles.templateRowSelected : ""}`}
                    onClick={() => setSelectedTemplateId(isSelected ? null : t.id)}
                    role="button"
                    tabIndex={0}
                    aria-selected={isSelected}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedTemplateId(isSelected ? null : t.id); } }}
                  >
                    <td>
                      <div className={styles.templateName}>{t.metric_name}</div>
                      <div className={styles.templateKey}>{t.metric_key}</div>
                    </td>
                    <td>
                      {t.category && (
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t.category}</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.cityCountBadge} ${cityCount === 0 ? styles.cityCountZero : ""}`}>
                        {cityCount}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: "var(--brand-primary)", cursor: "pointer" }}>
                        {isSelected ? "Close ▲" : "Open ▼"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Template detail drawer (slide-in from right) */}
      {selectedTemplate && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setSelectedTemplateId(null)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>
                <p className={styles.drawerTemplateName}>{selectedTemplate.metric_name}</p>
                <div className={styles.drawerTemplateMeta}>
                  <span style={{ fontFamily: "monospace", fontSize: 11 }}>{selectedTemplate.metric_key}</span>
                  {selectedTemplate.category && (
                    <span className={styles.drawerBadge}>{selectedTemplate.category}</span>
                  )}
                  <span className={styles.drawerBadge}>template #{selectedTemplate.id}</span>
                </div>
              </div>
              <button
                className={styles.drawerCloseBtn}
                onClick={() => setSelectedTemplateId(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className={styles.drawerBody}>
              {/* Cross-city chart */}
              <div className={styles.drawerCrossCity}>
                <p className={styles.drawerSectionLabel}>Cross-city comparison</p>
                {!adminToken ? (
                  <div style={{ padding: "16px 0", color: "var(--text-tertiary)", fontSize: 12 }}>
                    Loading auth token…
                  </div>
                ) : !hasChildren ? (
                  <div style={{ padding: "16px 0", color: "var(--text-tertiary)", fontSize: 12 }}>
                    No city metrics instantiated from this template yet.
                    Use <strong>City Admin → Metrics → Templates</strong> to instantiate.
                  </div>
                ) : (
                  <CrossCityComparisonChart
                    templateId={selectedTemplate.id}
                    token={adminToken}
                    metricName={selectedTemplate.metric_name}
                    fullPageHref={`/admin/metrics/cross-city/${selectedTemplate.id}`}
                    height={340}
                  />
                )}
                {hasChildren && (
                  <div style={{ marginTop: 8 }}>
                    <Link
                      href={`/admin/metrics/cross-city/${selectedTemplate.id}`}
                      className={styles.drawerViewLink}
                      target="_blank"
                    >
                      <i className="fas fa-expand-alt" /> Full-page view
                    </Link>
                  </div>
                )}
              </div>

              {/* City instantiation status */}
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionLabel}>
                  City instantiation — {selectedCityNames.length} of {allCities.length} cities
                </p>
                {allCities.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading cities…</div>
                ) : (
                  <div className={styles.cityGrid}>
                    {/* Instantiated first */}
                    {allCities
                      .filter((c) => citiesPerTemplate.get(selectedTemplate.id)?.has(c.id))
                      .map((c) => (
                        <div key={c.id} className={`${styles.cityChip} ${styles.cityChipInstantiated}`}>
                          <span className={`${styles.cityChipDot} ${styles.cityChipDotInstantiated}`} />
                          {c.display_name ?? c.name}
                        </div>
                      ))}
                    {/* Not instantiated */}
                    {notInstantiatedCities.map((c) => (
                      <div key={c.id} className={styles.cityChip}>
                        <span className={styles.cityChipDot} />
                        {c.display_name ?? c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Template order editor */}
      <div className={styles.templateOrderWrapper}>
        <p className={styles.templateOrderHeading}>Template Ordering</p>
        <p className={styles.templateOrderDesc}>
          Controls the display order and color assignment of templates in the map layers panel across all cities.
          Saved locally in your browser.
        </p>
        <TemplateOrderEditor templates={templates} />
      </div>
    </div>
  );
}
