"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
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

  const error = listQ.error ?? refreshM.error ?? resetM.error ?? healthM.error;

  const circuitVariant = (state: string): "success" | "destructive" | "warning" =>
    state === "closed" ? "success" : state === "open" ? "destructive" : "warning";

  return (
    <div className="px-8 py-6">
      <header className="flex items-start justify-between gap-4 mb-4">
        <p className="text-sm text-gray-500">
          External federal data adapters (Phase 3). Continuous state lives in adapter_health.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void listQ.refetch()}
            disabled={listQ.isFetching}
          >
            {listQ.isFetching ? "Loading…" : "Refresh list"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => healthM.mutate()}
            disabled={busyKey !== null}
          >
            Run health check
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof Error ? error.message : String(error)}
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
                    onClick={() => refreshM.mutate(item.adapter_key)}
                    disabled={busyKey === item.adapter_key}
                  >
                    Refresh
                  </Button>
                  {item.circuit_state !== "closed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetM.mutate(item.adapter_key)}
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

      {!listQ.isLoading && items.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No adapters registered.</p>
      )}
    </div>
  );
}
