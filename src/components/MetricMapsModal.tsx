"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { getAdminMetricMaps, type MapListItem, type MapListResponse } from "@/lib/apiClient";
import styles from "./MetricsAdmin.module.css";

interface MetricMapsModalProps {
  metricId: number | null;
  metricName?: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function MetricMapsModal({
  metricId,
  metricName,
  isOpen,
  onClose,
}: MetricMapsModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [mapsData, setMapsData] = useState<MapListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMap, setPreviewMap] = useState<MapListItem | null>(null);

  useEffect(() => {
    if (!isOpen || !metricId) {
      setMapsData(null);
      setError(null);
      return;
    }

    const fetchMaps = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getAccessTokenSilently();
        const data = await getAdminMetricMaps(metricId, token);
        setMapsData(data);
      } catch (err) {
        console.error("Error fetching maps:", err);
        setError(err instanceof Error ? err.message : "Failed to load maps");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaps();
  }, [isOpen, metricId, getAccessTokenSilently]);

  if (!isOpen || !metricId) return null;

  const content = (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            Maps — {metricName || `Metric ${metricId}`} ({mapsData?.total ?? 0})
          </div>
          <button className={styles.iconBtn} onClick={onClose} title="Close" aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className={styles.modalBody}>
          {isLoading ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "8px" }} />
              Loading maps...
            </div>
          ) : error ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center", color: "var(--error-text)" }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }} />
              {error}
            </div>
          ) : !mapsData || mapsData.maps.length === 0 ? (
            <div className={styles.muted} style={{ padding: 16 }}>
              No maps found for this metric.
            </div>
          ) : (
            <table className={styles.miniTable}>
              <thead>
                <tr>
                  <th className={styles.miniTh}>Title</th>
                  <th className={styles.miniTh}>Type</th>
                  <th className={styles.miniTh}>Points</th>
                  <th className={styles.miniTh}>Views</th>
                  <th className={styles.miniTh}>Status</th>
                  <th className={styles.miniTh}>Created</th>
                  <th className={styles.miniTh}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mapsData.maps.map((map) => (
                  <tr key={map.id}>
                    <td className={styles.miniTd}>
                      <div style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {map.title || `Map ${map.id}`}
                      </div>
                      {map.description && (
                        <div className={styles.muted} style={{ fontSize: "11px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {map.description}
                        </div>
                      )}
                    </td>
                    <td className={styles.miniTd}>
                      <span style={{ 
                        padding: "2px 6px", 
                        borderRadius: "4px", 
                        fontSize: "11px",
                        background: "var(--bg-secondary)",
                        textTransform: "capitalize"
                      }}>
                        {map.map_type}
                      </span>
                    </td>
                    <td className={styles.miniTd}>{map.point_count?.toLocaleString() ?? 0}</td>
                    <td className={styles.miniTd}>{map.view_count?.toLocaleString() ?? 0}</td>
                    <td className={styles.miniTd}>
                      <span style={{ 
                        padding: "2px 6px", 
                        borderRadius: "4px", 
                        fontSize: "11px",
                        background: map.is_public ? "var(--success-bg, #d1fae5)" : "var(--warning-bg, #fef3c7)",
                        color: map.is_public ? "var(--success-text, #059669)" : "var(--warning-text, #d97706)"
                      }}>
                        {map.is_public ? "Public" : "Private"}
                      </span>
                    </td>
                    <td className={styles.miniTd}>{formatDateTime(map.created_at)}</td>
                    <td className={styles.miniTd}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => setPreviewMap(map)}
                          title="Preview"
                        >
                          <i className="fas fa-eye" />
                        </button>
                        <Link
                          href={`/m/${map.short_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.iconBtn}
                          title="Open map"
                        >
                          <i className="fas fa-external-link-alt" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewMap && (
        <div 
          className={styles.modalOverlay} 
          style={{ zIndex: 1001 }}
          onMouseDown={() => setPreviewMap(null)}
        >
          <div 
            className={styles.modal} 
            style={{ maxWidth: 500 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Map Preview</div>
              <button className={styles.iconBtn} onClick={() => setPreviewMap(null)} title="Close" aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ display: "grid", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Title</div>
                  <div style={{ fontWeight: 500 }}>{previewMap.title}</div>
                </div>
                {previewMap.description && (
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Description</div>
                    <div>{previewMap.description}</div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Type</div>
                    <div style={{ textTransform: "capitalize" }}>{previewMap.map_type}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Points</div>
                    <div>{previewMap.point_count?.toLocaleString() ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Views</div>
                    <div>{previewMap.view_count?.toLocaleString() ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Status</div>
                    <div>{previewMap.is_public ? "Public" : "Private"}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Created</div>
                  <div>{formatDateTime(previewMap.created_at)}</div>
                </div>
                {previewMap.city_name && (
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>City</div>
                    <div>{previewMap.city_name}</div>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={() => setPreviewMap(null)}>
                Close
              </button>
              <Link
                href={`/m/${previewMap.short_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryBtn}
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <i className="fas fa-external-link-alt" /> Open Map
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
