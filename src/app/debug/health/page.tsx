import { getHealth } from "@/lib/apiClient";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  let data;
  let error: string | null = null;

  try {
    data = await getHealth();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-lg shadow-black/40">
        <h1 className="text-xl font-semibold tracking-tight mb-4">
          TransparentCity API Health
        </h1>
        {error ? (
          <div className="rounded-lg border border-red-500/60 bg-red-950/40 p-4 text-sm">
            <div className="font-medium mb-1">Status: Unreachable</div>
            <div className="text-red-200/90">{error}</div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Status</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  data?.status === "healthy"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                    : "bg-amber-500/15 text-amber-200 border border-amber-500/40"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    data?.status === "healthy"
                      ? "bg-emerald-400"
                      : "bg-amber-400"
                  }`}
                />
                {data?.status ?? "unknown"}
              </span>
            </div>
            {data?.version && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">API Version</span>
                <span className="font-mono text-neutral-100">
                  {data.version}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {typeof data?.mcp_tools === "number" && (
                <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-400 mb-1">
                    MCP Tools
                  </div>
                  <div className="text-lg font-semibold">
                    {data.mcp_tools.toLocaleString()}
                  </div>
                </div>
              )}
              {typeof data?.tool_groups === "number" && (
                <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-400 mb-1">
                    Tool Groups
                  </div>
                  <div className="text-lg font-semibold">
                    {data.tool_groups.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Backend endpoint: <code className="font-mono">/health</code>
              {data?.timestamp && (
                <>
                  <span className="mx-1">•</span>
                  <span>Reported at {data.timestamp}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}




