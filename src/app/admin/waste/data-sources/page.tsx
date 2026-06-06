"use client";

import {
  useRefreshWasteAdminDataSource,
  useResetWasteAdminDataSource,
  useRunWasteAdminDataSourceHealthCheck,
  useWasteAdminDataSources,
} from "@/lib/hooks/useDataSources";

export default function DataSourcesPage() {
  const listQ = useWasteAdminDataSources();
  const refreshM = useRefreshWasteAdminDataSource();
  const resetM = useResetWasteAdminDataSource();
  const healthM = useRunWasteAdminDataSourceHealthCheck();

  const items = listQ.data?.items ?? [];

  // Which row (or "__all__" for the global health check) has an in-flight
  // mutation, so we can disable just the relevant buttons.
  const busyKey = refreshM.isPending
    ? refreshM.variables ?? null
    : resetM.isPending
    ? resetM.variables ?? null
    : healthM.isPending
    ? "__all__"
    : null;

  const error =
    listQ.error ?? refreshM.error ?? resetM.error ?? healthM.error;

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
          <button onClick={() => void listQ.refetch()} disabled={listQ.isFetching}>
            {listQ.isFetching ? "Loading..." : "Refresh list"}
          </button>
          <button onClick={() => healthM.mutate()} disabled={busyKey !== null}>
            Run health check
          </button>
        </div>
      </header>

      {error && (
        <div style={{ color: "crimson", marginBottom: "1rem" }}>
          Error: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

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
                  onClick={() => refreshM.mutate(item.adapter_key)}
                  disabled={busyKey === item.adapter_key}
                  style={{ marginRight: 4 }}
                >
                  Refresh
                </button>
                {item.circuit_state !== "closed" && (
                  <button
                    onClick={() => resetM.mutate(item.adapter_key)}
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

      {!listQ.isLoading && items.length === 0 && (
        <p style={{ color: "#666", marginTop: "1rem" }}>No adapters registered.</p>
      )}
    </div>
  );
}
