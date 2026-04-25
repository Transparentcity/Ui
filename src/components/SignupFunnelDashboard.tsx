"use client";

/**
 * SignupFunnelDashboard — admin-only onboarding funnel view.
 *
 * Shows step-by-step drop-off through the 3-step onboarding flow:
 *   Landing → Signup start → Step 1 → Location confirmed →
 *   Step 2 → Place next → Step 3 → Completed
 *
 * Plus: daily trend chart, city breakdown, newsletter cohort.
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
  Cell,
} from "recharts";
import {
  getOnboardingFunnel,
  getSignupFunnelSummary,
  getProductEventFunnel,
  type OnboardingFunnel,
  type OnboardingFunnelStep,
  type CityFunnelRow,
  type SignupFunnelSummary,
  type ProductEventFunnelLandingSource,
} from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dropPct(current: number, previous: number): string {
  if (!previous) return "—";
  const kept = current / previous;
  const dropped = 1 - kept;
  return dropped > 0 ? `−${(dropped * 100).toFixed(0)}%` : "✓";
}

// ---------------------------------------------------------------------------
// Funnel bar
// ---------------------------------------------------------------------------

function FunnelRow({
  step,
  maxVal,
  prevVal,
  isFirst,
}: {
  step: OnboardingFunnelStep;
  maxVal: number;
  prevVal: number | null;
  isFirst: boolean;
}) {
  const barWidth = maxVal > 0 ? (step.total / maxVal) * 100 : 0;
  const drop = prevVal != null && !isFirst ? dropPct(step.total, prevVal) : null;
  const isDropBad = drop && drop.startsWith("−") && parseFloat(drop.slice(1)) > 20;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--border-primary, #e5e5e5)" }}>
      <div style={{ width: "220px", flexShrink: 0, fontSize: "13px", color: "var(--text-primary, #111)", fontWeight: 500 }}>
        {step.label}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ flex: 1, background: "var(--bg-tertiary, #f0f0f0)", borderRadius: "4px", height: "20px", overflow: "hidden" }}>
          <div
            style={{
              width: `${barWidth}%`,
              height: "100%",
              background: isFirst ? "#888" : "var(--brand-primary, #ad35fa)",
              borderRadius: "4px",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div style={{ width: "64px", textAlign: "right", fontSize: "14px", fontWeight: 700, color: "var(--text-primary, #111)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(step.total)}
        </div>
        <div style={{ width: "54px", textAlign: "right", fontSize: "12px", fontWeight: 600, color: isDropBad ? "#dc2626" : "var(--text-secondary, #666)", fontVariantNumeric: "tabular-nums" }}>
          {drop ?? ""}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-secondary, #f9f9f9)",
      border: highlight ? "1.5px solid var(--brand-primary, #ad35fa)" : "1px solid var(--border-primary, #e5e5e5)",
      borderRadius: "10px",
      padding: "14px 18px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary, #666)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1.1, color: highlight ? "var(--brand-primary, #ad35fa)" : "var(--text-primary, #111)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "11px", color: "var(--text-secondary, #666)" }}>{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable city table
// ---------------------------------------------------------------------------

function CityTable({ rows, onRowClick, activeId }: { rows: CityFunnelRow[]; onRowClick: (r: CityFunnelRow) => void; activeId: number | null }) {
  const [sortKey, setSortKey] = useState<"signup_starts" | "signup_completes">("signup_completes");
  const sorted = [...rows].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
  const cols: { key: keyof CityFunnelRow; label: string; numeric?: boolean }[] = [
    { key: "city_name", label: "City" },
    { key: "signup_starts", label: "Starts", numeric: true },
    { key: "signup_completes", label: "Completes", numeric: true },
  ];
  const hCell: React.CSSProperties = { padding: "7px 12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary, #666)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
  const cell: React.CSSProperties = { padding: "7px 12px", fontSize: "13px", color: "var(--text-primary, #111)", borderTop: "1px solid var(--border-primary, #e5e5e5)" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{ ...hCell, textAlign: c.numeric ? "right" : "left", background: sortKey === c.key ? "var(--bg-tertiary, #f0f0f0)" : "transparent" }}
                onClick={() => c.numeric && setSortKey(c.key as typeof sortKey)}>
                {c.label} {sortKey === c.key ? "↓" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i}
              style={{ background: activeId === row.city_id ? "color-mix(in srgb, var(--brand-primary, #ad35fa) 8%, transparent)" : i % 2 === 0 ? "transparent" : "var(--bg-secondary, #f9f9f9)", cursor: "pointer" }}
              onClick={() => onRowClick(row)}>
              {cols.map(c => (
                <td key={c.key} style={{ ...cell, textAlign: c.numeric ? "right" : "left", fontWeight: c.key === "city_name" ? 500 : 400, fontVariantNumeric: c.numeric ? "tabular-nums" : undefined }}>
                  {row[c.key] == null ? "—" : c.numeric ? fmt(row[c.key] as number) : String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={3} style={{ ...cell, textAlign: "center", color: "var(--text-secondary, #666)" }}>No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const SECTION: React.CSSProperties = { marginBottom: "28px" };
const SECTION_TITLE: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "var(--text-secondary, #666)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" };
const CARD_WRAP: React.CSSProperties = { background: "var(--bg-secondary, #f9f9f9)", border: "1px solid var(--border-primary, #e5e5e5)", borderRadius: "10px", overflow: "hidden" };

export default function SignupFunnelDashboard() {
  const { getAccessTokenSilently } = useAuth0();
  const [days, setDays] = useState(30);
  const [onboarding, setOnboarding] = useState<OnboardingFunnel | null>(null);
  const [summary, setSummary] = useState<SignupFunnelSummary | null>(null);
  const [landingSources, setLandingSources] = useState<ProductEventFunnelLandingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  const load = useCallback(async (overrideDays?: number, overrideCityId?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const d = overrideDays ?? days;
      const cid = overrideCityId !== undefined ? overrideCityId : selectedCityId;
      const opts = { days: d, city_id: cid ?? undefined };

      // All three are best-effort so a missing/new endpoint never blocks the rest
      const [ob, sig, fp] = await Promise.all([
        getOnboardingFunnel(token, opts).catch(() => null),
        getSignupFunnelSummary(token, { days: d, city_id: cid ?? undefined }).catch(() => null),
        getProductEventFunnel(token, opts).catch(() => null),
      ]);

      setOnboarding(ob);
      setSummary(sig);
      setLandingSources(fp?.landing_sources ?? []);

      // If all three fail it's a real problem worth showing
      if (!ob && !sig && !fp) {
        setError("Could not load funnel data. Check your connection or try refreshing.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, days, selectedCityId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDaysChange = (d: number) => { setDays(d); void load(d, selectedCityId); };
  const handleCityClick = (row: CityFunnelRow) => {
    if (selectedCityId === row.city_id) { setSelectedCityId(null); setSelectedCityName(null); void load(days, null); }
    else { setSelectedCityId(row.city_id); setSelectedCityName(row.city_name ?? String(row.city_id)); void load(days, row.city_id); }
  };

  // Key conversion metrics — prefer new per-step funnel data, fall back to legacy API
  const steps = onboarding?.steps ?? [];
  const landing =
    steps.find(s => s.step === "page_view")?.total ?? null;
  // When summary loads, use it for starts/completes (``0 ?? summary`` would keep 0).
  const starts =
    summary != null
      ? summary.total_signup_starts
      : steps.find(s => s.step === "signup_start")?.total ?? null;
  const completes =
    summary != null
      ? summary.total_signup_completes
      : steps.find(s => s.step === "onboarding_complete")?.total ?? null;
  const locationConfirmed =
    steps.find(s => s.step === "onboarding_location_confirmed")?.total ?? null;

  // Daily trend — summary.daily has reliable starts/completes even before new events exist
  const step2Daily = Object.fromEntries(
    (steps.find(s => s.step === "onboarding_step2_viewed")?.daily ?? []).map(r => [r.date, r.count])
  );
  const step3Daily = Object.fromEntries(
    (steps.find(s => s.step === "onboarding_step3_viewed")?.daily ?? []).map(r => [r.date, r.count])
  );
  const completeDaily = Object.fromEntries(
    (steps.find(s => s.step === "onboarding_complete")?.daily ?? []).map(r => [r.date, r.count])
  );
  const chartData = (summary?.daily ?? []).map(d => ({
    day: shortDate(d.date),
    "Starts": d.signup_starts,
    "Completes": d.signup_completes,
    ...(Object.keys(step2Daily).length > 0 ? { "Step 2": step2Daily[d.date] ?? 0 } : {}),
    ...(Object.keys(step3Daily).length > 0 ? { "Step 3": step3Daily[d.date] ?? 0 } : {}),
    ...(Object.keys(completeDaily).length > 0 ? { "Completed (new)": completeDaily[d.date] ?? 0 } : {}),
  }));

  return (
    <div style={{ padding: "0 0 32px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary, #111)", margin: 0 }}>
            Onboarding Funnel{selectedCityName ? ` — ${selectedCityName}` : ""}
          </h2>
          {onboarding && (
            <div style={{ fontSize: "11px", color: "var(--text-secondary, #666)", marginTop: "2px" }}>
              {onboarding.date_from} → {onboarding.date_to}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {selectedCityId != null && (
            <button style={{ padding: "5px 11px", fontSize: "12px", border: "1px solid var(--brand-primary, #ad35fa)", borderRadius: "6px", color: "var(--brand-primary, #ad35fa)", background: "transparent", cursor: "pointer" }}
              onClick={() => { setSelectedCityId(null); setSelectedCityName(null); void load(days, null); }}>
              ← All cities
            </button>
          )}
          {PRESETS.map(p => (
            <button key={p.days}
              style={{ padding: "5px 11px", fontSize: "12px", border: "1px solid var(--border-primary, #e5e5e5)", borderRadius: "6px", background: days === p.days ? "var(--bg-tertiary, #e8e8e8)" : "transparent", fontWeight: days === p.days ? 700 : 400, cursor: "pointer", color: "var(--text-primary, #111)" }}
              onClick={() => handleDaysChange(p.days)}>
              {p.label}
            </button>
          ))}
          <button
            style={{ padding: "5px 11px", fontSize: "12px", border: "1px solid var(--border-primary, #e5e5e5)", borderRadius: "6px", background: "transparent", cursor: loading ? "not-allowed" : "pointer", color: "var(--text-secondary, #666)" }}
            onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#fff0f0", border: "1px solid #ffcccc", borderRadius: "8px", color: "#cc0000", fontSize: "13px", marginBottom: "20px" }}>
          {error}
        </div>
      )}

      {/* Key metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "10px", marginBottom: "24px" }}>
        {landing != null && <StatCard label="Landings" value={fmt(landing)} sub="page views" />}
        <StatCard label="Signup starts" value={fmt(starts)} sub={landing != null && starts != null ? pct(starts / landing) + " of landings" : "first-party"} />
        {locationConfirmed != null && (
          <StatCard label="Location found" value={fmt(locationConfirmed)} sub={starts ? pct(locationConfirmed / starts) + " of starts" : undefined} />
        )}
        <StatCard label="Completed" value={fmt(completes)} sub={starts != null && completes != null ? pct(completes / starts) + " of starts" : "first-party"} highlight />
        <StatCard
          label={landing != null ? "Landing → done" : "Start → done"}
          value={
            landing != null && completes != null && landing > 0 ? pct(completes / landing) :
            starts != null && completes != null && starts > 0 ? pct(completes / starts) : "—"
          }
          sub="overall conversion"
          highlight={completes != null && completes > 0}
        />
      </div>

      {/* Step-by-step funnel bars */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Step-by-step funnel</div>
        <div style={{ ...CARD_WRAP, padding: "4px 20px 8px" }}>
          {/* Column headers */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0 4px", borderBottom: "2px solid var(--border-primary, #e5e5e5)" }}>
            <div style={{ width: "220px", flexShrink: 0, fontSize: "11px", fontWeight: 700, color: "var(--text-secondary, #666)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Step</div>
            <div style={{ flex: 1 }} />
            <div style={{ width: "64px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary, #666)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Count</div>
            <div style={{ width: "54px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary, #666)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Drop</div>
          </div>
          {steps.map((step, i) => (
            <FunnelRow
              key={step.step}
              step={step}
              maxVal={steps[0]?.total ?? 1}
              prevVal={i > 0 ? steps[i - 1].total : null}
              isFirst={i === 0}
            />
          ))}
          {steps.length === 0 && !loading && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary, #666)", fontSize: "13px" }}>
              No onboarding data for this period.
            </div>
          )}
        </div>
      </div>

      {/* Daily trend */}
      {chartData.length > 0 && (
        <div style={SECTION}>
          <div style={SECTION_TITLE}>Daily trend — onboarding steps</div>
          <div style={{ ...CARD_WRAP, padding: "16px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "var(--bg-primary, #fff)", border: "1px solid var(--border-primary, #e5e5e5)", borderRadius: "8px", fontSize: "12px" }} />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Starts" stroke="#888" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="Completes" stroke="#ad35fa" strokeWidth={2} dot={false} />
                {Object.keys(step2Daily).length > 0 && <Line type="monotone" dataKey="Step 2" stroke="#5B8DEF" strokeWidth={1.5} dot={false} />}
                {Object.keys(step3Daily).length > 0 && <Line type="monotone" dataKey="Step 3" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
                {Object.keys(completeDaily).length > 0 && <Line type="monotone" dataKey="Completed (new)" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Landing sources */}
      {landingSources.length > 0 && (
        <div style={SECTION}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={SECTION_TITLE}>Landing sources</div>
            <button
              style={{ fontSize: "11px", color: "var(--brand-primary, #ad35fa)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={() => setShowSources(v => !v)}>
              {showSources ? "hide" : "show"}
            </button>
          </div>
          {showSources && (
            <div style={CARD_WRAP}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Source", "Landings", "Share"].map((h, i) => (
                      <th key={h} style={{ padding: "7px 12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary, #666)", textAlign: i > 0 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {landingSources.map(row => (
                    <tr key={row.source}>
                      <td style={{ padding: "7px 12px", fontSize: "13px", borderTop: "1px solid var(--border-primary, #e5e5e5)", wordBreak: "break-word" }}>{row.source}</td>
                      <td style={{ padding: "7px 12px", fontSize: "13px", borderTop: "1px solid var(--border-primary, #e5e5e5)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(row.count)}</td>
                      <td style={{ padding: "7px 12px", fontSize: "13px", borderTop: "1px solid var(--border-primary, #e5e5e5)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.share != null ? pct(row.share) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* City breakdown */}
      {summary && summary.by_city.length > 0 && (
        <div style={SECTION}>
          <div style={SECTION_TITLE}>
            By city{selectedCityId == null && <span style={{ fontWeight: 400, marginLeft: "6px", fontSize: "10px" }}>— click to drill in</span>}
          </div>
          <div style={CARD_WRAP}>
            <CityTable rows={summary.by_city} onRowClick={handleCityClick} activeId={selectedCityId} />
          </div>
        </div>
      )}

      {/* Newsletter cohort summary */}
      {summary && summary.newsletter_funnel_cohort_available === true && (
        <div style={SECTION}>
          <div style={SECTION_TITLE}>Weekly update — signup cohort</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
            <StatCard label="Cohort completers" value={fmt(summary.newsletter_funnel_cohort_completers)} sub="distinct signups in range" highlight />
            <StatCard label="Weekly subscribers" value={fmt(summary.newsletter_funnel_weekly_subscribers)} sub={`${pct((summary.newsletter_funnel_weekly_subscribers ?? 0) / (summary.newsletter_funnel_cohort_completers ?? 1))} of cohort`} />
            <StatCard label="With saved place" value={fmt(summary.newsletter_funnel_weekly_with_saved_place)} sub="of weekly subscribers" />
            <StatCard label="With custom focus" value={fmt(summary.newsletter_funnel_weekly_saved_place_and_instructions)} sub="of saved place subs" />
          </div>
        </div>
      )}

      {loading && !onboarding && (
        <div style={{ textAlign: "center", padding: "48px", color: "var(--text-secondary, #666)", fontSize: "14px" }}>
          Loading funnel data…
        </div>
      )}
    </div>
  );
}
