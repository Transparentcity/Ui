"use client";

/**
 * SignupFunnelDashboard — admin-only view embedded in the system-stats slot.
 *
 * Displays:
 *  - Headline cards: total landings, bounce rate, signup starts, signup completes,
 *    start-to-complete conversion rate
 *  - Daily trend line/bar chart
 *  - City breakdown table (click to drill into a single city)
 *  - District breakdown table (when a city is selected)
 *
 * Data sources:
 *  - First-party signup_funnel_events (signup starts / completes / location counts)
 *  - GA4 Data API overlay for landings + bounce rate (if configured server-side)
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getSignupFunnelSummary,
  type CityFunnelRow,
  type DistrictFunnelRow,
  type SignupFunnelSummary,
} from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

/** Dynamic column access for sortable tables (plain API row types are not `Record<string, unknown>`). */
function sortKeyValue(
  row: object,
  key: string
): string | number | null | undefined {
  const v = (row as Record<string, unknown>)[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  return undefined;
}

function shortDate(iso: string): string {
  // "2025-01-15" → "Jan 15"
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-secondary, #f9f9f9)",
        border: highlight
          ? "1.5px solid var(--brand-primary, #ad35fa)"
          : "1px solid var(--border-primary, #e5e5e5)",
        borderRadius: "10px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-secondary, #666)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: highlight
            ? "var(--brand-primary, #ad35fa)"
            : "var(--text-primary, #111)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "12px", color: "var(--text-secondary, #666)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SortableTable<T>({
  columns,
  rows,
  onRowClick,
  activeKey,
}: {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: T[];
  onRowClick?: (row: T) => void;
  activeKey?: unknown;
}) {
  const [sortKey, setSortKey] = useState(columns[columns.length - 1].key);
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const av = sortKeyValue(a as object, sortKey) as number | string | null;
    const bv = sortKeyValue(b as object, sortKey) as number | string | null;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return asc ? cmp : -cmp;
  });

  const headerCell: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-secondary, #666)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };
  const cell: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: "var(--text-primary, #111)",
    borderTop: "1px solid var(--border-primary, #e5e5e5)",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  ...headerCell,
                  textAlign: col.numeric ? "right" : "left",
                  background:
                    sortKey === col.key
                      ? "var(--bg-tertiary, #f0f0f0)"
                      : "transparent",
                }}
                onClick={() => {
                  if (sortKey === col.key) setAsc((v) => !v);
                  else {
                    setSortKey(col.key);
                    setAsc(false);
                  }
                }}
              >
                {col.label}{" "}
                {sortKey === col.key ? (asc ? "↑" : "↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isActive =
              activeKey != null &&
              (sortKeyValue(row as object, "city_id") === activeKey ||
                sortKeyValue(row as object, "district") === activeKey);
            return (
              <tr
                key={i}
                style={{
                  background: isActive
                    ? "color-mix(in srgb, var(--brand-primary, #ad35fa) 8%, transparent)"
                    : i % 2 === 0
                    ? "transparent"
                    : "var(--bg-secondary, #f9f9f9)",
                  cursor: onRowClick ? "pointer" : undefined,
                }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const cellVal = sortKeyValue(row as object, col.key);
                  return (
                    <td
                      key={col.key}
                      style={{
                        ...cell,
                        textAlign: col.numeric ? "right" : "left",
                        fontWeight: col.key.includes("name") ? 500 : 400,
                      }}
                    >
                      {cellVal == null
                        ? "—"
                        : col.numeric
                        ? fmt(cellVal as number)
                        : String(cellVal)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  ...cell,
                  textAlign: "center",
                  color: "var(--text-secondary, #666)",
                }}
              >
                No data for this period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

const PRESET_OPTIONS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function SignupFunnelDashboard() {
  const { getAccessTokenSilently } = useAuth0();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SignupFunnelSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

  const load = useCallback(
    async (overrideDays?: number, overrideCityId?: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessTokenSilently();
        const result = await getSignupFunnelSummary(token, {
          days: overrideDays ?? days,
          city_id:
            overrideCityId !== undefined
              ? overrideCityId ?? undefined
              : selectedCityId ?? undefined,
        });
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    },
    [getAccessTokenSilently, days, selectedCityId]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDaysChange = (d: number) => {
    setDays(d);
    void load(d, selectedCityId);
  };

  const handleCityClick = (row: CityFunnelRow) => {
    if (selectedCityId === row.city_id) {
      // Deselect
      setSelectedCityId(null);
      setSelectedCityName(null);
      void load(days, null);
    } else {
      setSelectedCityId(row.city_id);
      setSelectedCityName(row.city_name ?? row.city_slug ?? String(row.city_id));
      void load(days, row.city_id);
    }
  };

  const section: React.CSSProperties = {
    marginBottom: "28px",
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 700,
    color: "var(--text-secondary, #666)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "12px",
  };

  const districtRows: DistrictFunnelRow[] =
    selectedCityId != null
      ? data?.by_district.filter((d) => d.city_id === selectedCityId) ?? []
      : data?.by_district ?? [];

  // Daily chart data
  const chartData =
    data?.daily.map((d) => ({
      day: shortDate(d.date),
      "Signup starts": d.signup_starts,
      "Signup completes": d.signup_completes,
      ...(d.landings != null ? { Landings: d.landings } : {}),
    })) ?? [];

  return (
    <div style={{ padding: "0 0 32px" }}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--text-primary, #111)",
              margin: 0,
            }}
          >
            Signup Funnel
            {selectedCityName ? ` — ${selectedCityName}` : ""}
          </h2>
          {data && (
            <div
              style={{ fontSize: "12px", color: "var(--text-secondary, #666)", marginTop: "2px" }}
            >
              {data.date_from} → {data.date_to}
              {!data.ga4_available && (
                <span
                  style={{
                    marginLeft: "8px",
                    padding: "1px 6px",
                    background: "var(--bg-tertiary, #f0f0f0)",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}
                >
                  GA4 not connected — landings &amp; bounce rate unavailable
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {selectedCityId != null && (
            <button
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                border: "1px solid var(--brand-primary, #ad35fa)",
                borderRadius: "6px",
                color: "var(--brand-primary, #ad35fa)",
                background: "transparent",
                cursor: "pointer",
              }}
              onClick={() => {
                setSelectedCityId(null);
                setSelectedCityName(null);
                void load(days, null);
              }}
            >
              ← All cities
            </button>
          )}
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                border: "1px solid var(--border-primary, #e5e5e5)",
                borderRadius: "6px",
                background: days === opt.days ? "var(--bg-tertiary, #e8e8e8)" : "transparent",
                fontWeight: days === opt.days ? 700 : 400,
                cursor: "pointer",
                color: "var(--text-primary, #111)",
              }}
              onClick={() => handleDaysChange(opt.days)}
            >
              {opt.label}
            </button>
          ))}
          <button
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: "6px",
              background: "transparent",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--text-secondary, #666)",
            }}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fff0f0",
            border: "1px solid #ffcccc",
            borderRadius: "8px",
            color: "#cc0000",
            fontSize: "13px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <StatCard
          label="Total landings"
          value={fmt(data?.total_landings)}
          sub={data?.ga4_available ? "from GA4" : undefined}
        />
        <StatCard
          label="Avg bounce rate"
          value={pct(data?.avg_bounce_rate)}
          sub={data?.ga4_available ? "from GA4" : undefined}
        />
        <StatCard
          label="Signup starts"
          value={fmt(data?.total_signup_starts)}
          sub="first-party"
        />
        <StatCard
          label="Signup completes"
          value={fmt(data?.total_signup_completes)}
          sub="first-party"
          highlight
        />
        <StatCard
          label="Conversion"
          value={pct(data?.conversion_rate)}
          sub="starts → completes"
          highlight={!!data?.conversion_rate}
        />
      </div>

      {/* Daily trend */}
      {data && chartData.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>Daily trend</div>
          <div
            style={{
              background: "var(--bg-secondary, #f9f9f9)",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: "10px",
              padding: "16px",
            }}
          >
            <ResponsiveContainer width="100%" height={220}>
              {data.ga4_available ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-primary, #fff)",
                      border: "1px solid var(--border-primary, #e5e5e5)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="Landings"
                    stroke="#888"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Signup starts"
                    stroke="#5B8DEF"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Signup completes"
                    stroke="#ad35fa"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-primary, #fff)",
                      border: "1px solid var(--border-primary, #e5e5e5)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="Signup starts"
                    fill="#5B8DEF"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="Signup completes"
                    fill="#ad35fa"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* City breakdown */}
      {data && (
        <div style={section}>
          <div style={sectionTitle}>
            {selectedCityId
              ? `City breakdown (showing selected city)`
              : "By city"}
            {selectedCityId == null && (
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "11px",
                  fontWeight: 400,
                  color: "var(--text-secondary, #666)",
                }}
              >
                — click a row to drill in
              </span>
            )}
          </div>
          <div
            style={{
              background: "var(--bg-secondary, #f9f9f9)",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            <SortableTable<CityFunnelRow>
              columns={[
                { key: "city_name", label: "City" },
                { key: "city_slug", label: "Slug" },
                { key: "signup_starts", label: "Starts", numeric: true },
                { key: "signup_completes", label: "Completes", numeric: true },
              ]}
              rows={data.by_city}
              onRowClick={handleCityClick}
              activeKey={selectedCityId}
            />
          </div>
        </div>
      )}

      {/* District breakdown */}
      {data && districtRows.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>
            By district
            {selectedCityName ? ` — ${selectedCityName}` : ""}
          </div>
          <div
            style={{
              background: "var(--bg-secondary, #f9f9f9)",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            <SortableTable<DistrictFunnelRow>
              columns={[
                { key: "city_name", label: "City" },
                { key: "district", label: "District", numeric: true },
                { key: "signup_starts", label: "Starts", numeric: true },
                { key: "signup_completes", label: "Completes", numeric: true },
              ]}
              rows={districtRows}
            />
          </div>
        </div>
      )}

      {loading && !data && (
        <div
          style={{
            textAlign: "center",
            padding: "48px",
            color: "var(--text-secondary, #666)",
            fontSize: "14px",
          }}
        >
          Loading signup funnel data…
        </div>
      )}
    </div>
  );
}
