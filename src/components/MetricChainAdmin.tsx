"use client";

/**
 * MetricChainAdmin
 *
 * Admin UI for managing causal metric chain relationships.
 * Follows the collapsible-panel pattern from ShapeLayerTemplatesAdmin.
 *
 * Allows admins to:
 * - View all chains and their edges
 * - Add new edges
 * - Delete edges
 */

import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChainSummary,
  MetricRelationshipCreate,
  MetricRelationshipEdge,
  createMetricRelationship,
  deleteMetricRelationship,
  listMetricChains,
  listMetricRelationships,
} from "@/lib/apiClient";

const CHAINS_QUERY_KEY = ["metric-chains"];
const EDGES_QUERY_KEY = ["metric-relationships"];

interface NewEdgeForm {
  source_metric_id: string;
  target_metric_id: string;
  relationship_type: string;
  chain_key: string;
  chain_name: string;
  display_order: string;
  category_field: string;
  lag_months: string;
  city_id: string;
}

const EMPTY_FORM: NewEdgeForm = {
  source_metric_id: "",
  target_metric_id: "",
  relationship_type: "conversion",
  chain_key: "",
  chain_name: "",
  display_order: "0",
  category_field: "",
  lag_months: "",
  city_id: "",
};

export default function MetricChainAdmin() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<NewEdgeForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const chainsQuery = useQuery({
    queryKey: CHAINS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listMetricChains(token);
    },
    enabled: isExpanded,
    staleTime: 60_000,
  });

  const edgesQuery = useQuery({
    queryKey: [...EDGES_QUERY_KEY, selectedChain],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listMetricRelationships(token, {
        chainKey: selectedChain ?? undefined,
      });
    },
    enabled: isExpanded && selectedChain !== null,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (body: MetricRelationshipCreate) => {
      const token = await getAccessTokenSilently();
      return createMetricRelationship(body, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAINS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EDGES_QUERY_KEY });
      setShowNewForm(false);
      setForm(EMPTY_FORM);
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

  const handleCreate = () => {
    setFormError(null);
    const src = parseInt(form.source_metric_id, 10);
    const tgt = parseInt(form.target_metric_id, 10);
    if (!src || !tgt) {
      setFormError("Source and target metric IDs are required.");
      return;
    }
    if (!form.chain_key || !form.chain_name) {
      setFormError("Chain key and chain name are required.");
      return;
    }
    createMutation.mutate({
      source_metric_id: src,
      target_metric_id: tgt,
      relationship_type: form.relationship_type,
      chain_key: form.chain_key,
      chain_name: form.chain_name,
      display_order: parseInt(form.display_order, 10) || 0,
      category_field: form.category_field || null,
      lag_months: form.lag_months ? parseInt(form.lag_months, 10) : null,
      city_id: form.city_id ? parseInt(form.city_id, 10) : null,
    });
  };

  const chains: ChainSummary[] = chainsQuery.data ?? [];
  const edges: MetricRelationshipEdge[] = edgesQuery.data ?? [];

  return (
    <div className="chain-admin-panel">
      <button
        className="chain-admin-toggle"
        onClick={() => setIsExpanded((e) => !e)}
        aria-expanded={isExpanded}
      >
        <span className="chain-admin-toggle-icon">{isExpanded ? "▼" : "▶"}</span>
        Causal Metric Chains
        {chains.length > 0 && (
          <span className="chain-admin-count">{chains.length} chain(s)</span>
        )}
      </button>

      {isExpanded && (
        <div className="chain-admin-body">
          {chainsQuery.isLoading && <p className="chain-admin-loading">Loading chains…</p>}
          {chainsQuery.isError && (
            <p className="chain-admin-error">Error loading chains.</p>
          )}

          {chains.length > 0 && (
            <div className="chain-admin-chain-list">
              {chains.map((c) => (
                <button
                  key={c.chain_key}
                  className={[
                    "chain-admin-chain-btn",
                    selectedChain === c.chain_key ? "chain-admin-chain-btn--selected" : "",
                  ].join(" ")}
                  onClick={() =>
                    setSelectedChain(
                      selectedChain === c.chain_key ? null : c.chain_key
                    )
                  }
                >
                  {c.chain_name}
                  <span className="chain-admin-chain-count">
                    {c.edge_count} edge{c.edge_count !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          {chains.length === 0 && !chainsQuery.isLoading && (
            <p className="chain-admin-empty">
              No chains defined yet. Use the form below to create the first edge.
            </p>
          )}

          {/* Edge list for selected chain */}
          {selectedChain && (
            <div className="chain-admin-edges">
              <h4 className="chain-admin-edges-title">
                Edges in &ldquo;{selectedChain}&rdquo;
              </h4>
              {edgesQuery.isLoading && <p className="chain-admin-loading">Loading edges…</p>}
              {edges.length > 0 && (
                <table className="chain-admin-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Source ID</th>
                      <th>Target ID</th>
                      <th>Type</th>
                      <th>Category field</th>
                      <th>Lag (mo)</th>
                      <th>City</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {edges
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((edge) => (
                        <tr key={edge.id}>
                          <td>{edge.display_order}</td>
                          <td>{edge.source_metric_id}</td>
                          <td>{edge.target_metric_id}</td>
                          <td>{edge.relationship_type}</td>
                          <td>{edge.category_field ?? "—"}</td>
                          <td>{edge.lag_months ?? "—"}</td>
                          <td>{edge.city_id ?? "template"}</td>
                          <td>
                            <button
                              className="chain-admin-delete-btn"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete edge ${edge.id} (${edge.source_metric_id} → ${edge.target_metric_id})?`
                                  )
                                ) {
                                  deleteMutation.mutate(edge.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {edges.length === 0 && !edgesQuery.isLoading && (
                <p className="chain-admin-empty">No edges in this chain.</p>
              )}
            </div>
          )}

          {/* New edge form */}
          <div className="chain-admin-new">
            {!showNewForm ? (
              <button
                className="chain-admin-add-btn"
                onClick={() => setShowNewForm(true)}
              >
                + Add edge
              </button>
            ) : (
              <div className="chain-admin-form">
                <h4 className="chain-admin-form-title">New edge</h4>

                {formError && (
                  <p className="chain-admin-form-error">{formError}</p>
                )}

                <div className="chain-admin-form-grid">
                  <label>
                    Source metric ID *
                    <input
                      type="number"
                      value={form.source_metric_id}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          source_metric_id: e.target.value,
                        }))
                      }
                      placeholder="e.g. 42"
                    />
                  </label>
                  <label>
                    Target metric ID *
                    <input
                      type="number"
                      value={form.target_metric_id}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          target_metric_id: e.target.value,
                        }))
                      }
                      placeholder="e.g. 57"
                    />
                  </label>
                  <label>
                    Relationship type *
                    <select
                      value={form.relationship_type}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          relationship_type: e.target.value,
                        }))
                      }
                    >
                      <option value="conversion">conversion</option>
                      <option value="stock_flow_in">stock_flow_in</option>
                      <option value="stock_flow_out">stock_flow_out</option>
                      <option value="component">component</option>
                    </select>
                  </label>
                  <label>
                    Chain key *
                    <input
                      type="text"
                      value={form.chain_key}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, chain_key: e.target.value }))
                      }
                      placeholder="e.g. justice_funnel"
                    />
                  </label>
                  <label>
                    Chain name *
                    <input
                      type="text"
                      value={form.chain_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, chain_name: e.target.value }))
                      }
                      placeholder="e.g. Criminal Justice Funnel"
                    />
                  </label>
                  <label>
                    Display order
                    <input
                      type="number"
                      value={form.display_order}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          display_order: e.target.value,
                        }))
                      }
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Category field (optional)
                    <input
                      type="text"
                      value={form.category_field}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          category_field: e.target.value,
                        }))
                      }
                      placeholder="e.g. crime_category"
                    />
                  </label>
                  <label>
                    Lag months (optional)
                    <input
                      type="number"
                      value={form.lag_months}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lag_months: e.target.value }))
                      }
                      placeholder="e.g. 18"
                    />
                  </label>
                  <label>
                    City ID (blank = template-level)
                    <input
                      type="number"
                      value={form.city_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, city_id: e.target.value }))
                      }
                      placeholder="leave blank for all cities"
                    />
                  </label>
                </div>

                <div className="chain-admin-form-actions">
                  <button
                    className="chain-admin-save-btn"
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Saving…" : "Save edge"}
                  </button>
                  <button
                    className="chain-admin-cancel-btn"
                    onClick={() => {
                      setShowNewForm(false);
                      setForm(EMPTY_FORM);
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .chain-admin-panel {
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .chain-admin-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--bg-secondary, #f9fafb);
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
          text-align: left;
        }
        .chain-admin-toggle:hover {
          background: var(--bg-hover, #f3f4f6);
        }
        .chain-admin-toggle-icon {
          font-size: 0.65rem;
        }
        .chain-admin-count {
          margin-left: auto;
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          font-weight: 400;
        }
        .chain-admin-body {
          padding: 1rem;
          border-top: 1px solid var(--border-primary, #e5e7eb);
        }
        .chain-admin-loading,
        .chain-admin-empty,
        .chain-admin-error {
          font-size: 0.8rem;
          color: var(--text-secondary, #6b7280);
          margin: 0 0 0.75rem;
        }
        .chain-admin-error {
          color: #dc2626;
        }
        .chain-admin-chain-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .chain-admin-chain-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0.75rem;
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 4px;
          background: var(--bg-primary, #fff);
          cursor: pointer;
          font-size: 0.8rem;
          color: var(--text-primary, #111827);
        }
        .chain-admin-chain-btn--selected {
          border-color: var(--accent, #2563eb);
          background: #eff6ff;
          color: #1d4ed8;
        }
        .chain-admin-chain-count {
          font-size: 0.72rem;
          color: var(--text-secondary, #6b7280);
          background: var(--bg-secondary, #f3f4f6);
          border-radius: 3px;
          padding: 0.1rem 0.35rem;
        }
        .chain-admin-edges {
          margin-bottom: 1rem;
        }
        .chain-admin-edges-title {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          margin: 0 0 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .chain-admin-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
        }
        .chain-admin-table th,
        .chain-admin-table td {
          padding: 0.35rem 0.5rem;
          text-align: left;
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
          white-space: nowrap;
        }
        .chain-admin-table thead th {
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          background: var(--bg-secondary, #f9fafb);
          font-size: 0.72rem;
          text-transform: uppercase;
        }
        .chain-admin-delete-btn {
          padding: 0.2rem 0.5rem;
          border: 1px solid #fca5a5;
          border-radius: 3px;
          background: #fff;
          color: #dc2626;
          cursor: pointer;
          font-size: 0.72rem;
        }
        .chain-admin-delete-btn:hover {
          background: #fee2e2;
        }
        .chain-admin-add-btn {
          padding: 0.4rem 1rem;
          border: 1px dashed var(--border-primary, #e5e7eb);
          border-radius: 4px;
          background: var(--bg-primary, #fff);
          cursor: pointer;
          font-size: 0.8rem;
          color: var(--text-secondary, #6b7280);
          width: 100%;
        }
        .chain-admin-add-btn:hover {
          border-color: var(--accent, #2563eb);
          color: #1d4ed8;
        }
        .chain-admin-form {
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 4px;
          padding: 1rem;
        }
        .chain-admin-form-title {
          font-size: 0.875rem;
          font-weight: 600;
          margin: 0 0 0.75rem;
        }
        .chain-admin-form-error {
          font-size: 0.8rem;
          color: #dc2626;
          margin: 0 0 0.5rem;
          padding: 0.4rem 0.75rem;
          background: #fee2e2;
          border-radius: 4px;
        }
        .chain-admin-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .chain-admin-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary, #6b7280);
        }
        .chain-admin-form-grid input,
        .chain-admin-form-grid select {
          padding: 0.35rem 0.5rem;
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 4px;
          font-size: 0.8rem;
          color: var(--text-primary, #111827);
          background: var(--bg-primary, #fff);
        }
        .chain-admin-form-actions {
          display: flex;
          gap: 0.5rem;
        }
        .chain-admin-save-btn {
          padding: 0.4rem 1rem;
          border: none;
          border-radius: 4px;
          background: var(--accent, #2563eb);
          color: #fff;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .chain-admin-save-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .chain-admin-cancel-btn {
          padding: 0.4rem 1rem;
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 4px;
          background: var(--bg-primary, #fff);
          cursor: pointer;
          font-size: 0.8rem;
          color: var(--text-secondary, #6b7280);
        }
      `}</style>
    </div>
  );
}