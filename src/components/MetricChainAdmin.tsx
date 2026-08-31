"use client";

/**
 * MetricChainAdmin
 *
 * Admin UI for defining causal metric chains.
 *
 * A "chain" is an ordered sequence of metrics connected by process arrows:
 *   Police Incidents → Arrests → Charges Filed → Convictions
 *
 * Each arrow records what conversion rate connects the two stages (e.g.
 * "arrest rate = arrests / incidents"). When a stage moves against its
 * upstream — e.g. convictions rise while charges fall — the UI surfaces
 * this as a divergence and decomposes what accounts for it mathematically.
 *
 * This is process accounting, not a claim of real-world causation.
 */

import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AdminMetricDetail,
  AdminMetricListItem,
  ChainSummary,
  MetricRelationshipCreate,
  MetricRelationshipEdge,
  createMetricRelationship,
  deleteMetricRelationship,
  getAdminMetric,
  listAdminMetrics,
  listMetricChains,
  listMetricRelationships,
} from "@/lib/apiClient";

const CHAINS_QUERY_KEY = ["metric-chains"];
const EDGES_QUERY_KEY = ["metric-relationships"];
const METRICS_QUERY_KEY = ["admin-metrics-for-chain"];

const RELATIONSHIP_LABELS: Record<string, { label: string; hint: string }> = {
  conversion: {
    label: "Feeds into (conversion)",
    hint: "Downstream ≈ rate × upstream. E.g. arrests = arrest_rate × incidents.",
  },
  stock_flow_in: {
    label: "Adds to stock",
    hint: "Upstream events flow INTO the downstream stock metric. E.g. bookings add to jail population.",
  },
  stock_flow_out: {
    label: "Removes from stock",
    hint: "Upstream events flow OUT OF the downstream stock metric. E.g. releases reduce jail population.",
  },
  component: {
    label: "Is part of total",
    hint: "The upstream metric is an additive component of the downstream total.",
  },
};

// ---------------------------------------------------------------------------
// Metric search combobox
// ---------------------------------------------------------------------------

function MetricPicker({
  label,
  hint,
  value,
  onChange,
  metrics,
}: {
  label: string;
  hint: string;
  value: AdminMetricListItem | null;
  onChange: (m: AdminMetricListItem | null) => void;
  metrics: AdminMetricListItem[];
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return metrics.slice(0, 30);
    const q = search.toLowerCase();
    return metrics
      .filter(
        (m) =>
          m.metric_name.toLowerCase().includes(q) ||
          m.metric_key.toLowerCase().includes(q) ||
          (m.category || "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [search, metrics]);

  const displayName = value
    ? value.metric_name.replace(/^[^\w\s]+\s/, "") // strip leading emoji
    : "";

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          marginBottom: "0.35rem",
          lineHeight: 1.4,
        }}
      >
        {hint}
      </div>
      <input
        type="text"
        placeholder={value ? displayName : "Search metric by name…"}
        value={open ? search : displayName}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          width: "100%",
          padding: "0.4rem 0.6rem",
          border: `1px solid ${value ? "var(--brand-primary)" : "var(--border-primary)"}`,
          borderRadius: "4px",
          fontSize: "0.82rem",
          color: "var(--text-primary)",
          background: "var(--bg-primary)",
          boxSizing: "border-box",
        }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--bg-primary)",
            border: "1px solid var(--border-primary)",
            borderRadius: "4px",
            boxShadow: "var(--shadow-md)",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {filtered.map((m) => (
            <div
              key={m.id}
              onMouseDown={() => {
                onChange(m);
                setSearch("");
                setOpen(false);
              }}
              style={{
                padding: "0.4rem 0.6rem",
                cursor: "pointer",
                borderBottom: "1px solid var(--border-primary)",
                fontSize: "0.8rem",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                  "var(--bg-secondary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                  "transparent";
              }}
            >
              <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                {m.metric_name}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {m.category}
                {m.subcategory ? ` / ${m.subcategory}` : ""} · id {m.id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge row in the table
// ---------------------------------------------------------------------------

function EdgeRow({
  edge,
  metricMap,
  onDelete,
  deleting,
}: {
  edge: MetricRelationshipEdge;
  metricMap: Map<number, { metric_name: string }>;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const src = metricMap.get(edge.source_metric_id);
  const tgt = metricMap.get(edge.target_metric_id);
  // Keep the full name including leading emoji — it anchors the eye
  const srcName = src?.metric_name ?? `Loading… (id ${edge.source_metric_id})`;
  const tgtName = tgt?.metric_name ?? `Loading… (id ${edge.target_metric_id})`;
  const relLabel = RELATIONSHIP_LABELS[edge.relationship_type]?.label ?? edge.relationship_type;

  return (
    <tr>
      <td style={{ verticalAlign: "top" }}>
        <div style={{ color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.4 }}>
          {srcName}
        </div>
        <div style={{
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          lineHeight: 1,
          margin: "0.2rem 0",
          paddingLeft: "0.1rem",
        }}>
          ↓
        </div>
        <div style={{ color: "var(--text-secondary)", fontWeight: 500, lineHeight: 1.4 }}>
          {tgtName}
        </div>
      </td>
      <td style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
        {relLabel}
      </td>
      <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
        {edge.category_field ?? "—"}
      </td>
      <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
        {edge.lag_months != null ? `${edge.lag_months} mo` : "—"}
      </td>
      <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
        {edge.city_id == null ? "All cities" : `City ${edge.city_id}`}
      </td>
      <td>
        <button
          onClick={() => {
            if (
              window.confirm(
                `Remove the connection:\n${srcName}\n↓\n${tgtName}?`
              )
            ) {
              onDelete(edge.id);
            }
          }}
          disabled={deleting}
          style={{
            padding: "0.18rem 0.5rem",
            border: "1px solid var(--error)",
            borderRadius: "3px",
            background: "transparent",
            color: "var(--error)",
            cursor: "pointer",
            fontSize: "0.72rem",
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Add edge form
// ---------------------------------------------------------------------------

interface NewEdgeState {
  upstream: AdminMetricListItem | null;
  downstream: AdminMetricListItem | null;
  relationship_type: string;
  chain_key: string;
  chain_name: string;
  display_order: string;
  category_field: string;
  lag_months: string;
  city_id: string;
}

const EMPTY: NewEdgeState = {
  upstream: null,
  downstream: null,
  relationship_type: "conversion",
  chain_key: "",
  chain_name: "",
  display_order: "0",
  category_field: "",
  lag_months: "",
  city_id: "",
};

function AddEdgeForm({
  metrics,
  onSave,
  onCancel,
  saving,
  error,
}: {
  metrics: AdminMetricListItem[];
  onSave: (body: MetricRelationshipCreate) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [state, setState] = useState<NewEdgeState>(EMPTY);
  const update = (patch: Partial<NewEdgeState>) =>
    setState((s) => ({ ...s, ...patch }));

  const selectedType = RELATIONSHIP_LABELS[state.relationship_type];

  const handleSubmit = () => {
    if (!state.upstream || !state.downstream) return;
    if (!state.chain_key || !state.chain_name) return;
    onSave({
      source_metric_id: state.upstream.id,
      target_metric_id: state.downstream.id,
      relationship_type: state.relationship_type,
      chain_key: state.chain_key,
      chain_name: state.chain_name,
      display_order: parseInt(state.display_order, 10) || 0,
      category_field: state.category_field || null,
      lag_months: state.lag_months ? parseInt(state.lag_months, 10) : null,
      city_id: state.city_id ? parseInt(state.city_id, 10) : null,
    });
  };

  const canSave =
    state.upstream && state.downstream && state.chain_key && state.chain_name;

  return (
    <div
      style={{
        border: "1px solid var(--border-primary)",
        borderRadius: "6px",
        padding: "1rem",
        background: "var(--bg-secondary)",
        marginTop: "0.75rem",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginBottom: "1rem",
          lineHeight: 1.5,
          padding: "0.5rem 0.75rem",
          background: "var(--bg-tertiary)",
          borderRadius: "4px",
        }}
      >
        A <strong style={{ color: "var(--text-primary)" }}>chain</strong> is a
        sequence of metrics connected by process arrows, like{" "}
        <em>Police Incidents → Arrests → Charges Filed → Convictions</em>. Each
        arrow records the conversion rate between stages so the platform can
        explain — arithmetically, not causally — why a downstream metric moved.
      </div>

      {error && (
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--error)",
            background: "rgba(239,68,68,0.08)",
            borderRadius: "4px",
            padding: "0.4rem 0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0.75rem",
          alignItems: "start",
          marginBottom: "1rem",
        }}
      >
        <MetricPicker
          label="Upstream stage"
          hint="The metric that feeds into the next one (e.g. Police Incidents)"
          value={state.upstream}
          onChange={(m) => update({ upstream: m })}
          metrics={metrics}
        />
        <div
          style={{
            paddingTop: "2.9rem",
            fontSize: "1.4rem",
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          →
        </div>
        <MetricPicker
          label="Downstream stage"
          hint="The metric that receives from the upstream one (e.g. Arrests)"
          value={state.downstream}
          onChange={(m) => update({ downstream: m })}
          metrics={metrics}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        {/* Relationship type */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Connection type
          </label>
          <select
            value={state.relationship_type}
            onChange={(e) => update({ relationship_type: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
            }}
          >
            {Object.entries(RELATIONSHIP_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {selectedType && (
            <div
              style={{
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                marginTop: "0.2rem",
                lineHeight: 1.4,
              }}
            >
              {selectedType.hint}
            </div>
          )}
        </div>

        {/* Chain key */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Chain ID *
          </label>
          <input
            type="text"
            placeholder="e.g. justice_funnel"
            value={state.chain_key}
            onChange={(e) => update({ chain_key: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              marginTop: "0.2rem",
            }}
          >
            Machine-readable name, no spaces
          </div>
        </div>

        {/* Chain name */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Chain display name *
          </label>
          <input
            type="text"
            placeholder="e.g. Criminal Justice Funnel"
            value={state.chain_name}
            onChange={(e) => update({ chain_name: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Position in chain */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Position in chain
          </label>
          <input
            type="number"
            min={0}
            placeholder="0 = first stage"
            value={state.display_order}
            onChange={(e) => update({ display_order: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              marginTop: "0.2rem",
            }}
          >
            0 for the most upstream stage, 1 for the next, etc.
          </div>
        </div>

        {/* Shared category field */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Shared category field (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. crime_category"
            value={state.category_field}
            onChange={(e) => update({ category_field: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              marginTop: "0.2rem",
              lineHeight: 1.4,
            }}
          >
            If both datasets share a breakdown field (e.g. crime type), the
            platform can decompose mix vs. rate changes.
          </div>
        </div>

        {/* Reporting lag */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Reporting lag (months, optional)
          </label>
          <input
            type="number"
            min={0}
            placeholder="e.g. 6"
            value={state.lag_months}
            onChange={(e) => update({ lag_months: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              marginTop: "0.2rem",
              lineHeight: 1.4,
            }}
          >
            Expected months for downstream data to reflect upstream events
            (e.g. 18 for charges → convictions).
          </div>
        </div>

        {/* City ID */}
        <div>
          <label
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Scope
          </label>
          <input
            type="number"
            placeholder="leave blank = all cities"
            value={state.city_id}
            onChange={(e) => update({ city_id: e.target.value })}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--border-primary)",
              borderRadius: "4px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              marginTop: "0.2rem",
              lineHeight: 1.4,
            }}
          >
            Leave blank to apply to all cities via template inheritance. Enter
            a city ID to restrict to one city.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          onClick={handleSubmit}
          disabled={!canSave || saving}
          style={{
            padding: "0.45rem 1.1rem",
            border: "none",
            borderRadius: "4px",
            background: canSave ? "var(--brand-primary)" : "var(--bg-tertiary)",
            color: canSave ? "var(--text-on-brand, #fff)" : "var(--text-muted)",
            cursor: canSave ? "pointer" : "default",
            fontSize: "0.82rem",
            fontWeight: 600,
            transition: "background 0.15s",
          }}
        >
          {saving ? "Saving…" : "Add connection"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "0.45rem 0.9rem",
            border: "1px solid var(--border-primary)",
            borderRadius: "4px",
            background: "transparent",
            cursor: "pointer",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
          }}
        >
          Cancel
        </button>
        {!canSave && (
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            Select both stages and fill Chain ID + name to continue.
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MetricChainAdmin({
  defaultCityId,
}: {
  defaultCityId?: number;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load chains summary
  const chainsQuery = useQuery({
    queryKey: [...CHAINS_QUERY_KEY, defaultCityId],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listMetricChains(token, defaultCityId);
    },
    enabled: isExpanded,
    staleTime: 60_000,
  });

  // Load edges for the selected chain
  const edgesQuery = useQuery({
    queryKey: [...EDGES_QUERY_KEY, selectedChain, defaultCityId],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listMetricRelationships(token, {
        chainKey: selectedChain ?? undefined,
        cityId: defaultCityId,
      });
    },
    enabled: isExpanded && selectedChain !== null,
    staleTime: 30_000,
  });

  // All unique metric IDs referenced by the currently-loaded edges.
  // Used to fetch names directly — no limit issues, no city-filter gaps.
  const allEdgeIds = useMemo(() => {
    const ids = new Set<number>();
    (edgesQuery.data ?? []).forEach((e) => {
      ids.add(e.source_metric_id);
      ids.add(e.target_metric_id);
    });
    return [...ids].sort((a, b) => a - b);
  }, [edgesQuery.data]);

  // Fetch each edge endpoint metric by ID directly.
  // This is at most ~15 parallel requests and is always exact — never cut off
  // by a list limit or a city_id filter.
  const edgeMetricsQuery = useQuery({
    queryKey: [...METRICS_QUERY_KEY, "edge-ids", allEdgeIds.join(",")],
    queryFn: async () => {
      if (allEdgeIds.length === 0) return [];
      const token = await getAccessTokenSilently();
      const results = await Promise.all(
        allEdgeIds.map((id) => getAdminMetric(id, token).catch(() => null))
      );
      return results.filter(Boolean) as AdminMetricDetail[];
    },
    enabled: allEdgeIds.length > 0,
    staleTime: 10 * 60_000,
  });

  // Full metric list for the search picker (separate from name resolution).
  const metricsQuery = useQuery({
    queryKey: METRICS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listAdminMetrics(token, { limit: 600, is_active: true });
    },
    enabled: isExpanded,
    staleTime: 5 * 60_000,
  });

  // Build the name map: edge endpoint metrics take priority (always correct),
  // full list fills in the rest for the search picker display.
  const metricMap = useMemo(() => {
    const m = new Map<number, AdminMetricListItem | AdminMetricDetail>();
    (metricsQuery.data ?? []).forEach((metric) => m.set(metric.id, metric));
    // Edge metrics override — these are fetched by exact ID, guaranteed correct
    (edgeMetricsQuery.data ?? []).forEach((metric) => m.set(metric.id, metric));
    return m;
  }, [metricsQuery.data, edgeMetricsQuery.data]);

  const createMutation = useMutation({
    mutationFn: async (body: MetricRelationshipCreate) => {
      const token = await getAccessTokenSilently();
      return createMetricRelationship(body, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAINS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EDGES_QUERY_KEY });
      setShowAddForm(false);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAccessTokenSilently();
      return deleteMetricRelationship(id, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAINS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EDGES_QUERY_KEY });
    },
  });

  const chains: ChainSummary[] = chainsQuery.data ?? [];
  const edges: MetricRelationshipEdge[] = (edgesQuery.data ?? []).sort(
    (a, b) => a.display_order - b.display_order
  );

  return (
    <div
      style={{
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-sm, 6px)",
        overflow: "hidden",
        marginBottom: "1rem",
      }}
    >
      {/* Header toggle */}
      <button
        onClick={() => setIsExpanded((e) => !e)}
        aria-expanded={isExpanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          background: "var(--bg-secondary)",
          border: "none",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--text-primary)",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.65rem" }}>{isExpanded ? "▼" : "▶"}</span>
        Causal Metric Chains
        {chains.length > 0 && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "var(--text-muted)",
            }}
          >
            {chains.length} chain{chains.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {isExpanded && (
        <div
          style={{
            padding: "1rem",
            borderTop: "1px solid var(--border-primary)",
            background: "var(--bg-primary)",
          }}
        >
          {chainsQuery.isLoading && (
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              Loading…
            </p>
          )}

          {/* Chain selector pills */}
          {chains.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
              {chains.map((c) => (
                <button
                  key={c.chain_key}
                  onClick={() =>
                    setSelectedChain(
                      selectedChain === c.chain_key ? null : c.chain_key
                    )
                  }
                  style={{
                    padding: "0.3rem 0.7rem",
                    border: `1px solid ${selectedChain === c.chain_key ? "var(--brand-primary)" : "var(--border-primary)"}`,
                    borderRadius: "20px",
                    background:
                      selectedChain === c.chain_key
                        ? "var(--brand-primary-light)"
                        : "transparent",
                    color:
                      selectedChain === c.chain_key
                        ? "var(--brand-primary)"
                        : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: selectedChain === c.chain_key ? 600 : 400,
                  }}
                >
                  {c.chain_name}
                  <span
                    style={{
                      marginLeft: "0.35rem",
                      fontSize: "0.68rem",
                      opacity: 0.7,
                    }}
                  >
                    {c.edge_count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Edge table */}
          {selectedChain && (
            <div style={{ marginBottom: "1rem", overflowX: "auto" }}>
              {edgesQuery.isLoading ? (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  Loading connections…
                </p>
              ) : edges.length === 0 ? (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  No connections in this chain yet.
                </p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.8rem",
                  }}
                >
                  <thead>
                    <tr>
                      {["Connection", "Type", "Category breakdown", "Reporting lag", "Scope", ""].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              padding: "0.35rem 0.6rem",
                              textAlign: "left",
                              borderBottom: "1px solid var(--border-primary)",
                              background: "var(--bg-secondary)",
                              color: "var(--text-tertiary)",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {edges.map((edge) => (
                      <EdgeRow
                        key={edge.id}
                        edge={edge}
                        metricMap={metricMap}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        deleting={deleteMutation.isPending}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {chains.length === 0 && !chainsQuery.isLoading && (
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                margin: "0 0 1rem",
              }}
            >
              No chains defined yet. Use the form below to connect your first
              pair of metrics.
            </p>
          )}

          {/* Add edge */}
          {showAddForm ? (
            <AddEdgeForm
              metrics={metricsQuery.data ?? []}
              onSave={(body) => createMutation.mutate(body)}
              onCancel={() => {
                setShowAddForm(false);
                setFormError(null);
              }}
              saving={createMutation.isPending}
              error={formError}
            />
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                width: "100%",
                padding: "0.45rem 1rem",
                border: "1px dashed var(--border-primary)",
                borderRadius: "4px",
                background: "transparent",
                cursor: "pointer",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--brand-primary)";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--brand-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border-primary)";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--text-secondary)";
              }}
            >
              + Connect two metrics
            </button>
          )}
        </div>
      )}
    </div>
  );
}
