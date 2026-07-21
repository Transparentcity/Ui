"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";

import {
  type TemplateShapeLayer,
  type UpdateShapeLayerTemplateRequest,
  listShapeLayerTemplates,
  updateShapeLayerTemplate,
} from "@/lib/api/cities";

const TEMPLATES_QUERY_KEY = ["shape-layer-templates"];

interface EditState {
  id: number;
  layer_key: string;
  default_display_name: string;
  category: string;
  default_identifier_field: string;
  is_required: boolean;
  is_active: boolean;
  structuring_prompt: string;
}

/**
 * Shape Layer Templates Admin
 *
 * Lists all shape layer templates (active + inactive) with inline editing.
 * Templates are city-agnostic; per-city data lives on city_shapefiles instances.
 */
export default function ShapeLayerTemplatesAdmin() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedPromptId, setExpandedPromptId] = useState<number | null>(null);

  const { data: templates, isLoading, error } = useQuery({
    queryKey: [...TEMPLATES_QUERY_KEY, showInactive],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listShapeLayerTemplates(token, showInactive);
    },
    staleTime: 60 * 1000,
    enabled: isExpanded,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: UpdateShapeLayerTemplateRequest }) => {
      const token = await getAccessTokenSilently();
      return updateShapeLayerTemplate(id, updates, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
    },
  });

  const startEdit = (t: TemplateShapeLayer) => {
    setEditing({
      id: t.id,
      layer_key: t.layer_key,
      default_display_name: t.default_display_name,
      category: t.category,
      default_identifier_field: t.default_identifier_field || "",
      is_required: t.is_required ?? false,
      is_active: t.is_active ?? true,
      structuring_prompt: t.structuring_prompt || "",
    });
    setExpandedPromptId(t.id);
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        updates: {
          layer_key: editing.layer_key,
          default_display_name: editing.default_display_name,
          category: editing.category,
          default_identifier_field: editing.default_identifier_field || null,
          is_required: editing.is_required,
          is_active: editing.is_active,
          structuring_prompt: editing.structuring_prompt || null,
        },
      });
      setEditing(null);
      setExpandedPromptId(null);
    } catch (err: any) {
      alert("Failed to save template: " + (err?.message || String(err)));
    }
  };

  const toggleActive = async (t: TemplateShapeLayer) => {
    try {
      await updateMutation.mutateAsync({
        id: t.id,
        updates: { is_active: !(t.is_active ?? true) },
      });
    } catch (err: any) {
      alert("Failed to update template: " + (err?.message || String(err)));
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 6px",
    border: "1px solid var(--border-primary)",
    borderRadius: "4px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "12px",
  };

  const cellStyle: React.CSSProperties = {
    padding: "8px",
    borderBottom: "1px solid var(--border-primary)",
    fontSize: "12px",
    verticalAlign: "top",
  };

  const headStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    fontSize: "11px",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  };

  if (error) {
    return (
      <div style={{ padding: "12px", color: "#dc2626", fontSize: "12px" }}>
        Failed to load shape layer templates: {(error as Error).message}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--border-primary)",
        borderRadius: "8px",
        padding: "16px",
        background: "var(--bg-primary)",
        marginBottom: "24px",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 style={{ margin: 0, fontSize: "15px" }}>
          {isExpanded ? "▾" : "▸"} Shape Layer Templates
          {templates ? ` (${templates.length})` : ""}
        </h3>
        {isExpanded && (
          <label
            style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        )}
      </div>

      {!isExpanded ? null : (
        <>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "8px 0 12px 0" }}>
        City-agnostic templates for geographic boundary layers. Each city gets an instance per template during
        structuring. <strong>Required</strong> templates are always retried when missing; the{" "}
        <strong>structuring prompt</strong> guides the AI&apos;s search for each layer type.
      </div>

      {isLoading ? (
        <div style={{ padding: "12px", textAlign: "center", fontSize: "12px" }}>Loading templates...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>Key</th>
                <th style={headStyle}>Display Name</th>
                <th style={headStyle}>Category</th>
                <th style={headStyle}>Geometry</th>
                <th style={headStyle}>Identifier</th>
                <th style={headStyle}>Required</th>
                <th style={headStyle}>Active</th>
                <th style={headStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(templates || []).map((t) => {
                const isEditing = editing?.id === t.id;
                const isExpanded = expandedPromptId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr style={{ opacity: (t.is_active ?? true) ? 1 : 0.55 }}>
                      <td style={cellStyle}>
                        {isEditing ? (
                          <input
                            style={{ ...inputStyle, fontFamily: "monospace" }}
                            value={editing.layer_key}
                            onChange={(e) => setEditing({ ...editing, layer_key: e.target.value })}
                          />
                        ) : (
                          <code style={{ fontSize: "11px" }}>{t.layer_key}</code>
                        )}
                      </td>
                      <td style={cellStyle}>
                        {isEditing ? (
                          <input
                            style={inputStyle}
                            value={editing.default_display_name}
                            onChange={(e) => setEditing({ ...editing, default_display_name: e.target.value })}
                          />
                        ) : (
                          <span>{t.icon ? `${t.icon} ` : ""}{t.default_display_name}</span>
                        )}
                      </td>
                      <td style={cellStyle}>
                        {isEditing ? (
                          <input
                            style={inputStyle}
                            value={editing.category}
                            onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                          />
                        ) : (
                          t.category
                        )}
                      </td>
                      <td style={cellStyle}>{t.geometry_kind}</td>
                      <td style={cellStyle}>
                        {isEditing ? (
                          <input
                            style={{ ...inputStyle, fontFamily: "monospace" }}
                            value={editing.default_identifier_field}
                            onChange={(e) => setEditing({ ...editing, default_identifier_field: e.target.value })}
                            placeholder="(none)"
                          />
                        ) : (
                          <code style={{ fontSize: "11px" }}>{t.default_identifier_field || "—"}</code>
                        )}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {isEditing ? (
                          <input
                            type="checkbox"
                            checked={editing.is_required}
                            onChange={(e) => setEditing({ ...editing, is_required: e.target.checked })}
                          />
                        ) : (
                          (t.is_required ? "✓" : "—")
                        )}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {isEditing ? (
                          <input
                            type="checkbox"
                            checked={editing.is_active}
                            onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                          />
                        ) : (
                          <button
                            onClick={() => toggleActive(t)}
                            disabled={updateMutation.isPending}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "10px",
                              border: "none",
                              fontSize: "10px",
                              fontWeight: 600,
                              cursor: "pointer",
                              background: (t.is_active ?? true) ? "#10b981" : "#6b7280",
                              color: "white",
                            }}
                            title="Click to toggle"
                          >
                            {(t.is_active ?? true) ? "Active" : "Inactive"}
                          </button>
                        )}
                      </td>
                      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={handleSave}
                              disabled={updateMutation.isPending}
                              style={{
                                padding: "4px 10px",
                                background: "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "11px",
                                marginRight: "6px",
                              }}
                            >
                              {updateMutation.isPending ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => {
                                setEditing(null);
                                setExpandedPromptId(null);
                              }}
                              style={{
                                padding: "4px 10px",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border-primary)",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(t)}
                              style={{
                                padding: "4px 10px",
                                background: "var(--brand-primary)",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "11px",
                                marginRight: "6px",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setExpandedPromptId(isExpanded ? null : t.id)}
                              style={{
                                padding: "4px 10px",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border-primary)",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              {isExpanded ? "Hide Prompt" : "Prompt"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ ...cellStyle, background: "var(--bg-secondary)" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px", color: "var(--text-secondary)" }}>
                            Structuring Prompt (AI search guidance for this layer type):
                          </div>
                          {isEditing ? (
                            <textarea
                              value={editing.structuring_prompt}
                              onChange={(e) => setEditing({ ...editing, structuring_prompt: e.target.value })}
                              rows={5}
                              style={{
                                width: "100%",
                                padding: "8px",
                                border: "1px solid var(--border-primary)",
                                borderRadius: "4px",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                                fontSize: "12px",
                                fontFamily: "inherit",
                              }}
                              placeholder="Search guidance for the AI: query terms, expected identifier patterns, dataset hints..."
                            />
                          ) : (
                            <div style={{ fontSize: "12px", whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
                              {t.structuring_prompt || <em style={{ color: "var(--text-secondary)" }}>No structuring prompt set.</em>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}
