"use client";

import React, { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  acceptPortalMatch,
  CityListItem,
  PortalMatchCandidate,
} from "@/lib/apiClient";
import { portalPlatformLabel } from "@/lib/portalPlatformLabel";

interface Props {
  city: CityListItem;
  onClose: () => void;
  onAccepted: (cityId: number, acceptedUrl: string) => void;
}

function sourceLabel(source: string): string {
  if (source === "existing_url") return "existing URL";
  if (source === "web_search") return "web search";
  return "heuristic";
}

function probeStatusLabel(status: string, apiFormat: string | null): React.ReactNode {
  if (status === "success" && apiFormat) {
    return (
      <span style={{ color: "#16a34a", fontWeight: 600 }}>
        ✓ {portalPlatformLabel(apiFormat)}
      </span>
    );
  }
  if (status === "not_found") return <span style={{ color: "#6b7280" }}>no catalog API</span>;
  if (status === "blocked_403") return <span style={{ color: "#d97706" }}>blocked (403)</span>;
  if (status === "error") return <span style={{ color: "#dc2626" }}>error</span>;
  return <span style={{ color: "#9ca3af" }}>not probed</span>;
}

export default function PortalReviewModal({ city, onClose, onAccepted }: Props) {
  const { getAccessTokenSilently } = useAuth0();
  const [acceptingUrl, setAcceptingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidates: PortalMatchCandidate[] = city.portal_match_candidates ?? [];

  async function handleAccept(candidate: PortalMatchCandidate) {
    setError(null);
    setAcceptingUrl(candidate.url);
    try {
      const token = await getAccessTokenSilently();
      await acceptPortalMatch(city.city_id, candidate.url, candidate.api_format, token);
      onAccepted(city.city_id, candidate.url);
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Unknown error");
      setAcceptingUrl(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Portal review for ${city.city_name}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-primary, #fff)",
          borderRadius: "10px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
          padding: "28px 32px",
          width: "min(600px, 95vw)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
              Portal candidates — {city.city_name}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary, #6b7280)" }}>
              The matcher found these portals but confidence was below the auto-save threshold.
              Review and accept the best match, or close to leave for later.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "20px", lineHeight: 1, color: "var(--text-secondary, #6b7280)",
              padding: "0 0 0 16px",
            }}
          >
            ×
          </button>
        </div>

        {/* Current state */}
        {city.main_portal_url && (
          <div style={{
            background: "var(--bg-secondary, #f9fafb)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: "6px",
            padding: "10px 14px",
            marginBottom: "18px",
            fontSize: "12px",
          }}>
            <span style={{ color: "var(--text-secondary, #6b7280)" }}>Current portal URL: </span>
            <a href={city.main_portal_url} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--brand-primary)", wordBreak: "break-all" }}>
              {city.main_portal_url}
            </a>
          </div>
        )}

        {candidates.length === 0 ? (
          <p style={{ color: "var(--text-secondary, #6b7280)", fontSize: "13px" }}>
            No candidate data recorded. Re-run "Determine Portal Type" to generate candidates.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {candidates.map((c, idx) => (
              <div
                key={c.url}
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  background: c.probe_status === "success"
                    ? "rgba(22, 163, 74, 0.04)"
                    : "var(--bg-primary, #fff)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Rank + URL */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        background: "var(--bg-secondary, #f3f4f6)",
                        borderRadius: "4px",
                        padding: "1px 6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "var(--text-secondary, #6b7280)",
                      }}>
                        #{idx + 1}
                      </span>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--brand-primary)",
                          fontWeight: 600,
                          fontSize: "13px",
                          wordBreak: "break-all",
                          textDecoration: "none",
                        }}
                      >
                        {c.url}
                      </a>
                    </div>

                    {/* Probe status + score row */}
                    <div style={{
                      display: "flex", gap: "16px", flexWrap: "wrap",
                      marginTop: "8px", fontSize: "12px",
                    }}>
                      <span>
                        <span style={{ color: "var(--text-secondary, #6b7280)" }}>API: </span>
                        {probeStatusLabel(c.probe_status, c.api_format)}
                      </span>
                      <span>
                        <span style={{ color: "var(--text-secondary, #6b7280)" }}>Score: </span>
                        <strong>{c.total_score}</strong>
                        <span style={{ color: "var(--text-secondary, #6b7280)" }}>
                          {" "}(host {c.hostname_score})
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "var(--text-secondary, #6b7280)" }}>Source: </span>
                        {sourceLabel(c.source)}
                      </span>
                    </div>

                    {/* Signals */}
                    {c.signals.length > 0 && (
                      <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {c.signals.map((s) => (
                          <span
                            key={s.name}
                            title={s.desc}
                            style={{
                              background: "var(--bg-secondary, #f3f4f6)",
                              border: "1px solid var(--border, #e5e7eb)",
                              borderRadius: "4px",
                              padding: "1px 6px",
                              fontSize: "10px",
                              color: "var(--text-secondary, #6b7280)",
                              cursor: "default",
                            }}
                          >
                            {s.name.replace(/_/g, " ")} +{s.score}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Winning endpoint */}
                    {c.winning_endpoint && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-secondary, #6b7280)" }}>
                        API endpoint: <code style={{ fontSize: "10px" }}>{c.winning_endpoint}</code>
                      </div>
                    )}
                  </div>

                  {/* Accept button */}
                  <button
                    onClick={() => handleAccept(c)}
                    disabled={acceptingUrl !== null}
                    style={{
                      flexShrink: 0,
                      padding: "6px 14px",
                      background: c.probe_status === "success" ? "#16a34a" : "var(--brand-primary, #4f46e5)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: acceptingUrl ? "not-allowed" : "pointer",
                      opacity: acceptingUrl ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {acceptingUrl === c.url ? "Saving…" : "Use this"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p style={{ color: "#dc2626", fontSize: "12px", marginTop: "12px" }}>
            Error: {error}
          </p>
        )}

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: "6px",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
