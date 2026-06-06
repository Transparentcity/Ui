"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

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

  const circuitVariant = (state: string): "success" | "destructive" | "warning" =>
    state === "closed" ? "success" : state === "open" ? "destructive" : "warning";

  return (
    <div className="px-8 py-6">
      <header className="flex items-start justify-between gap-4 mb-4">
        <p className="text-sm text-gray-500">
          External federal data adapters (Phase 3). Continuous state lives in adapter_health.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh list"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void runHealthCheck()} disabled={busyKey !== null}>
            Run health check
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adapter</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Circuit</TableHead>
              <TableHead>Last good</TableHead>
              <TableHead>Last check</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Last error</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.adapter_key}>
                <TableCell>
                  <div className="font-medium text-gray-900">{item.display_name}</div>
                  <div className="font-mono text-xs text-gray-500">{item.adapter_key}</div>
                </TableCell>
                <TableCell className="text-gray-600">{item.adapter_type}</TableCell>
                <TableCell>
                  <Badge variant={circuitVariant(item.circuit_state)}>{item.circuit_state}</Badge>
                </TableCell>
                <TableCell className="text-gray-600">{item.last_good_at ?? "never"}</TableCell>
                <TableCell className="text-gray-600">{item.last_check_at ?? "never"}</TableCell>
                <TableCell className="text-gray-600 tabular-nums">
                  {item.last_latency_ms != null ? `${item.last_latency_ms} ms` : "-"}
                </TableCell>
                <TableCell className="max-w-[320px] truncate text-red-600" title={item.last_error ?? ""}>
                  {item.last_error ?? ""}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="mr-2"
                    onClick={() => void refreshOne(item.adapter_key)}
                    disabled={busyKey === item.adapter_key}
                  >
                    Refresh
                  </Button>
                  {item.circuit_state !== "closed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void resetCircuit(item.adapter_key)}
                      disabled={busyKey === item.adapter_key}
                    >
                      Reset
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!loading && items.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No adapters registered.</p>
      )}
    </div>
  );
}
