"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getGovernmentOfficialsCoverage,
  getGovernmentOfficialsCoverageSummary,
  type GovernmentCoverageResponse,
  type GovernmentCoverageSummaryResponse,
  type GovernmentCoverageCityRow,
  type OfficialCoverageRow,
} from "@/lib/apiClient";

/* ─── small helpers ─────────────────────────────────────────────────── */

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
        color: ok ? "#16a34a" : "#dc2626",
        border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.2)"}`,
      }}
    >
      {label}
    </span>
  );
}

/* ─── funnel bar ─────────────────────────────────────────────────────── */

function FunnelStage({
  step,
  label,
  value,
  total,
  arrow,
}: {
  step: number;
  label: string;
  value: number;
  total: number;
  arrow?: boolean;
}) {
  const fraction = total > 0 ? value / total : 0;
  const barColor =
    fraction === 1
      ? "#16a34a"
      : fraction >= 0.5
      ? "var(--brand-primary, #ad35fa)"
      : "#f59e0b";

  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-tertiary, #6b7280)",
          marginBottom: 6,
        }}
      >
        Step {step}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary, #374151)",
          marginTop: 2,
          marginBottom: 8,
        }}
      >
        {label}
        {total > 0 && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              color: "var(--text-tertiary, #6b7280)",
            }}
          >
            ({pct(value, total)})
          </span>
        )}
      </div>
      {/* progress bar */}
      <div
        style={{
          height: 4,
          borderRadius: 4,
          background: "var(--border-primary, rgba(17,24,39,0.1))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(fraction * 100)}%`,
            background: barColor,
            borderRadius: 4,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

function Funnel({ summary }: { summary: GovernmentCoverageSummaryResponse }) {
  const t = summary.total_leaders;
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        alignItems: "flex-start",
        padding: "16px 20px",
        background: "var(--bg-secondary, #f9fafb)",
        borderRadius: 10,
        marginBottom: 20,
        flexWrap: "wrap",
        rowGap: 16,
      }}
    >
      <FunnelStage step={1} label="Officials in DB" value={t} total={t} />
      <Arrow />
      <FunnelStage
        step={2}
        label="Have email"
        value={summary.leaders_with_email}
        total={t}
      />
      <Arrow />
      <FunnelStage
        step={3}
        label="Claimed"
        value={summary.leaders_claimed}
        total={t}
      />
      <div
        style={{
          width: "1px",
          background: "var(--border-primary, rgba(17,24,39,0.1))",
          alignSelf: "stretch",
          margin: "0 12px",
        }}
      />
      <div style={{ minWidth: 80 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-tertiary, #6b7280)",
            marginBottom: 6,
          }}
        >
          Total staff
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
          {summary.total_staff}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #374151)",
            marginTop: 2,
          }}
        >
          provisioned
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div
      style={{
        alignSelf: "center",
        color: "var(--text-tertiary, #9ca3af)",
        fontSize: 18,
        padding: "0 8px",
        marginTop: -12,
      }}
    >
      →
    </div>
  );
}

/* ─── per-city table row with expandable detail ──────────────────────── */

function CityRow({
  row,
  onLoadDetail,
}: {
  row: GovernmentCoverageCityRow;
  onLoadDetail: (cityId: number) => Promise<GovernmentCoverageResponse>;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<GovernmentCoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!open && !detail) {
      setLoading(true);
      try {
        const d = await onLoadDetail(row.city_id);
        setDetail(d);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    setOpen((x) => !x);
  };

  return (
    <>
      <tr
        onClick={toggle}
        style={{
          cursor: "pointer",
          borderBottom: open
            ? "none"
            : "1px solid var(--border-primary, rgba(17,24,39,0.06))",
        }}
      >
        <td style={{ padding: "9px 12px", fontWeight: 500, fontSize: 13 }}>
          {row.city_name}
        </td>
        <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right" }}>
          {row.total_leaders}
        </td>
        <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right" }}>
          {row.leaders_with_email}
          <span
            style={{ fontSize: 11, color: "var(--text-tertiary, #6b7280)", marginLeft: 4 }}
          >
            ({pct(row.leaders_with_email, row.total_leaders)})
          </span>
        </td>
        <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right" }}>
          {row.leaders_claimed === row.total_leaders && row.total_leaders > 0 ? (
            <StatusBadge ok label={`${row.leaders_claimed} / ${row.total_leaders}`} />
          ) : row.leaders_claimed > 0 ? (
            <span>
              {row.leaders_claimed}{" "}
              <span
                style={{ fontSize: 11, color: "var(--text-tertiary, #6b7280)" }}
              >
                / {row.total_leaders}
              </span>
            </span>
          ) : (
            <StatusBadge ok={false} label="0" />
          )}
        </td>
        <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right" }}>
          {row.total_staff || "—"}
        </td>
        <td
          style={{
            padding: "9px 12px",
            fontSize: 11,
            color: "var(--text-tertiary, #6b7280)",
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "…" : open ? "▲ hide" : "▼ detail"}
        </td>
      </tr>

      {open && detail && (
        <tr>
          <td
            colSpan={6}
            style={{
              padding: "0 0 12px 0",
              borderBottom: "1px solid var(--border-primary, rgba(17,24,39,0.06))",
            }}
          >
            <div style={{ overflowX: "auto", paddingLeft: 12 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    {["Dist", "Name", "Email", "Claimed", "Staff"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "5px 8px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "var(--text-tertiary, #6b7280)",
                          borderBottom:
                            "1px solid var(--border-primary, rgba(17,24,39,0.08))",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.officials.map((off: OfficialCoverageRow) => (
                    <tr
                      key={off.leader_id}
                      style={{
                        borderBottom:
                          "1px solid var(--border-primary, rgba(17,24,39,0.04))",
                      }}
                    >
                      <td
                        style={{
                          padding: "5px 8px",
                          color: "var(--text-tertiary, #6b7280)",
                        }}
                      >
                        {off.district != null ? `D${off.district}` : "—"}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ fontWeight: 500 }}>{off.name}</span>
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: "var(--text-tertiary, #6b7280)",
                          }}
                        >
                          {off.title}
                        </span>
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        {off.email_known ? (
                          <span style={{ color: "#16a34a", fontWeight: 500 }}>✓</span>
                        ) : (
                          <span style={{ color: "#dc2626" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        {off.claimed_user_id ? (
                          <StatusBadge ok label="claimed" />
                        ) : (
                          <StatusBadge ok={false} label="pending" />
                        )}
                      </td>
                      <td
                        style={{
                          padding: "5px 8px",
                          color: "var(--text-secondary, #374151)",
                        }}
                      >
                        {off.staff_count > 0 ? off.staff_count : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── main panel ─────────────────────────────────────────────────────── */

export default function GovernmentCoveragePanel() {
  const { getAccessTokenSilently } = useAuth0();
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<GovernmentCoverageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const result = await getGovernmentOfficialsCoverageSummary(token);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage data.");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  // Load summary once expanded
  useEffect(() => {
    if (expanded && !summary && !loading) loadSummary();
  }, [expanded, summary, loading, loadSummary]);

  const loadDetail = useCallback(
    async (cityId: number): Promise<GovernmentCoverageResponse> => {
      const token = await getAccessTokenSilently();
      return getGovernmentOfficialsCoverage(cityId, token);
    },
    [getAccessTokenSilently]
  );

  return (
    <div
      style={{
        border: "1px solid var(--border-primary, rgba(17,24,39,0.1))",
        borderRadius: 12,
        marginBottom: 24,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded((x) => !x)}
        style={{
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          background: "var(--bg-secondary, #f9fafb)",
          borderBottom: expanded
            ? "1px solid var(--border-primary, rgba(17,24,39,0.1))"
            : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Government Officials Coverage
          </span>
          {summary && !loading && (
            <span
              style={{
                fontSize: 12,
                color: "var(--text-tertiary, #6b7280)",
                fontWeight: 400,
              }}
            >
              {summary.leaders_claimed} / {summary.total_leaders} claimed
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, opacity: 0.5 }}>{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "20px" }}>
          {loading && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary, #6b7280)" }}>
              Loading…
            </p>
          )}
          {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

          {summary && !loading && (
            <>
              {/* Funnel */}
              <Funnel summary={summary} />

              {/* Per-city breakdown */}
              {summary.by_city.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom:
                            "2px solid var(--border-primary, rgba(17,24,39,0.1))",
                        }}
                      >
                        {[
                          "City",
                          "In DB",
                          "Have email",
                          "Claimed",
                          "Staff",
                          "",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "7px 12px",
                              textAlign: h === "City" || h === "" ? "left" : "right",
                              fontWeight: 600,
                              fontSize: 11,
                              color: "var(--text-secondary, #374151)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_city.map((row) => (
                        <CityRow key={row.city_id} row={row} onLoadDetail={loadDetail} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 14, textAlign: "right" }}>
                <button
                  onClick={loadSummary}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-primary, rgba(17,24,39,0.15))",
                    background: "var(--bg-primary, #fff)",
                    cursor: "pointer",
                    color: "var(--text-secondary, #374151)",
                  }}
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
