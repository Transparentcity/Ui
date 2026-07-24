"use client";

/**
 * Shared paginated data table for admin list views.
 *
 * Features:
 *  - Debounced server-side `q` search
 *  - Filter chip slots (caller provides filter controls)
 *  - Server pagination with total/page counts
 *  - Row actions (per-row buttons)
 *  - "Select all matching filter" checkbox that triggers server-scoped batch actions
 *  - Loading / empty states
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
}

export interface RowAction<T> {
  label: string;
  onClick: (row: T) => void;
  variant?: "default" | "danger";
  disabled?: (row: T) => boolean;
}

export interface BatchAction {
  label: string;
  /** Called with the total matching count (server-scoped) */
  onConfirm: (totalCount: number) => Promise<void>;
  variant?: "default" | "danger";
}

export interface AdminDataTableProps<T> {
  /** Async function that fetches a page given (q, page, pageSize) + extra filters */
  fetchPage: (params: {
    q: string;
    page: number;
    pageSize: number;
  }) => Promise<{ items: T[]; total: number; pages: number }>;
  columns: Column<T>[];
  rowActions?: RowAction<T>[];
  batchActions?: BatchAction[];
  /** Extra filter controls rendered in the toolbar */
  filterControls?: ReactNode;
  /** Key to use for row identity */
  rowKey: (row: T) => string | number;
  placeholder?: string;
  pageSize?: number;
  /** Re-fetch when this changes (e.g. external filter state) */
  fetchDeps?: unknown[];
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDataTable<T>({
  fetchPage,
  columns,
  rowActions = [],
  batchActions = [],
  filterControls,
  rowKey,
  placeholder = "Search…",
  pageSize = 25,
  fetchDeps = [],
  emptyMessage = "No results found.",
}: AdminDataTableProps<T>) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchInProgress, setBatchInProgress] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce q
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPage({ q: debouncedQ, page, pageSize });
      setData(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, page, pageSize, ...fetchDeps]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBatch = async (action: BatchAction) => {
    if (batchInProgress) return;
    const confirmed = window.confirm(
      `${action.label} — this will affect all ${total} matching rows. Continue?`
    );
    if (!confirmed) return;
    setBatchInProgress(action.label);
    try {
      await action.onConfirm(total);
      await load();
    } catch (e) {
      alert(`Batch action failed: ${e}`);
    } finally {
      setBatchInProgress(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: "1 1 200px",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            background: "#fff",
          }}
        />
        {filterControls}
        {batchActions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleBatch(action)}
            disabled={!!batchInProgress || total === 0}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: action.variant === "danger" ? "#dc2626" : "#d1d5db",
              background: action.variant === "danger" ? "#fee2e2" : "#f9fafb",
              color: action.variant === "danger" ? "#dc2626" : "#374151",
              fontWeight: 600,
              fontSize: 13,
              cursor: batchInProgress || total === 0 ? "not-allowed" : "pointer",
              opacity: batchInProgress || total === 0 ? 0.5 : 1,
            }}
          >
            {batchInProgress === action.label ? "Working…" : action.label}
            {total > 0 && ` (${total})`}
          </button>
        ))}
      </div>

      {/* Results summary */}
      <div
        style={{
          fontSize: 12,
          color: "#6b7280",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          {loading
            ? "Loading…"
            : error
              ? `Error: ${error}`
              : `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
        </span>
        <span>
          Page {page} of {pages}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "2px solid #e5e7eb",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    width: col.width,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.header}
                </th>
              ))}
              {rowActions.length > 0 && (
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px 12px",
                    borderBottom: "2px solid #e5e7eb",
                  }}
                />
              )}
            </tr>
          </thead>
          <tbody>
            {!loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (rowActions.length > 0 ? 1 : 0)}
                  style={{
                    textAlign: "center",
                    padding: "32px 12px",
                    color: "#9ca3af",
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                style={{
                  borderBottom: "1px solid #f3f4f6",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f9fafb")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "")
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ padding: "10px 12px", verticalAlign: "middle" }}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {rowActions.length > 0 && (
                  <td
                    style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {rowActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => action.onClick(row)}
                        disabled={action.disabled?.(row)}
                        style={{
                          marginLeft: 6,
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid",
                          borderColor:
                            action.variant === "danger" ? "#dc2626" : "#d1d5db",
                          background:
                            action.variant === "danger" ? "#fee2e2" : "#f9fafb",
                          color:
                            action.variant === "danger" ? "#dc2626" : "#374151",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: action.disabled?.(row)
                            ? "not-allowed"
                            : "pointer",
                          opacity: action.disabled?.(row) ? 0.5 : 1,
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          style={_pageBtn(page <= 1)}
        >
          ← Prev
        </button>
        {Array.from({ length: Math.min(7, pages) }, (_, i) => {
          // Show first, last, and pages around current
          const p = i + 1;
          return (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={_pageBtn(false, p === page)}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          disabled={page >= pages}
          style={_pageBtn(page >= pages)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function _pageBtn(disabled: boolean, active = false) {
  return {
    padding: "6px 12px",
    borderRadius: 7,
    border: "1px solid",
    borderColor: active ? "#ad35fa" : "#e5e7eb",
    background: active ? "#ad35fa" : disabled ? "#f9fafb" : "#fff",
    color: active ? "#fff" : disabled ? "#9ca3af" : "#374151",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
