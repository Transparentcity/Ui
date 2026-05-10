"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE } from "@/lib/apiBase";

type DataSource = {
  adapter_key: string;
  display_name: string;
  adapter_type: "api" | "pdf";
  default_refresh_interval_hours: number;
  circuit_state: string;
  last_check_at: string | null;
  last_good_at: string | null;
  last_failure_at?: string | null;
  last_latency_ms?: number | null;
  last_error?: string | null;
  consecutive_failures?: number;
  total_checks?: number;
  total_failures?: number;
};

type ListResponse = { items: DataSource[]; total: number };

export default function DataSourcesPage() {
  const [items, setItems] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/waste/data-sources`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ListResponse = await res.json();
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshOne = useCallback(
    async (key: string) => {
      setBusyKey(key);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/admin/waste/data-sources/${key}/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`Refresh ${key}: HTTP ${res.status}`);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyKey(null);
      }
    },
    [load],
  );

  const resetCircuit = useCallback(
    async (key: string) => {
      setBusyKey(key);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/admin/waste/data-sources/${key}/reset`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`Reset ${key}: HTTP ${res.status}`);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyKey(null);
      }
    },
    [load],
  );

  const runHealthCheck = useCallback(async () => {
    setBusyKey("__all__");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/waste/data-sources/health-check`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Health check: HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }, [load]);

  return (
    <div style={{ padding: "1.5rem" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Data sources</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#666" }}>
            External federal data adapters (Phase 3). Continuous state lives in adapter_health.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Refresh list"}
          </button>
          <button onClick={() => void runHealthCheck()} disabled={busyKey !== null}>
            Run health check
          </button>
        </div>
      </header>

      {error && <div style={{ color: "crimson", marginBottom: "1rem" }}>Error: {error}</div>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: "0.5rem" }}>Adapter</th>
            <th style={{ padding: "0.5rem" }}>Type</th>
            <th style={{ padding: "0.5rem" }}>Circuit</th>
            <th style={{ padding: "0.5rem" }}>Last good</th>
            <th style={{ padding: "0.5rem" }}>Last check</th>
            <th style={{ padding: "0.5rem" }}>Latency</th>
            <th style={{ padding: "0.5rem" }}>Last error</th>
            <th style={{ padding: "0.5rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.adapter_key} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>
                <strong>{item.display_name}</strong>
                <div style={{ color: "#666", fontSize: "0.8rem" }}>{item.adapter_key}</div>
              </td>
              <td style={{ padding: "0.5rem" }}>{item.adapter_type}</td>
              <td style={{ padding: "0.5rem" }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background:
                      item.circuit_state === "closed"
                        ? "#d1f7c4"
                        : item.circuit_state === "open"
                        ? "#fcd9d6"
                        : "#fff3bf",
                  }}
                >
                  {item.circuit_state}
                </span>
              </td>
              <td style={{ padding: "0.5rem" }}>{item.last_good_at ?? "never"}</td>
              <td style={{ padding: "0.5rem" }}>{item.last_check_at ?? "never"}</td>
              <td style={{ padding: "0.5rem" }}>
                {item.last_latency_ms != null ? `${item.last_latency_ms} ms` : "-"}
              </td>
              <td style={{ padding: "0.5rem", maxWidth: 320, color: "#a33" }}>
                {item.last_error ?? ""}
              </td>
              <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                <button
                  onClick={() => void refreshOne(item.adapter_key)}
                  disabled={busyKey === item.adapter_key}
                  style={{ marginRight: 4 }}
                >
                  Refresh
                </button>
                {item.circuit_state !== "closed" && (
                  <button
                    onClick={() => void resetCircuit(item.adapter_key)}
                    disabled={busyKey === item.adapter_key}
                  >
                    Reset
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!loading && items.length === 0 && (
        <p style={{ color: "#666", marginTop: "1rem" }}>No adapters registered.</p>
      )}
    </div>
  );
}
