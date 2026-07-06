"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import { CheckCircle2, XCircle, Loader2, Play, RefreshCw } from "lucide-react"
import {
  getAllScheduledJobs,
  getJob,
  runCustomScheduledJob,
  type CustomScheduledJob,
} from "@/lib/apiClient"
import { cn } from "@/lib/utils"

interface CityRunResult {
  city_id: number
  city_name: string
  status: string
  error?: string
}

/** Parse the per-city outcomes out of a weekly_waste_refresh job result. */
function parseCityResults(result: unknown): CityRunResult[] {
  if (!result || typeof result !== "object") return []
  const exec = (result as { execution_result?: { results?: unknown } })
    .execution_result
  const rows = exec?.results
  if (!Array.isArray(rows)) return []
  return rows.filter(
    (r): r is CityRunResult =>
      r && typeof r === "object" && typeof r.city_name === "string",
  )
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * Gear-menu panel for the weekly waste refresh schedule (job #2).
 *
 * Shows the last run's per-city outcome (the schedule-level status can say
 * "completed" even when every city failed, so we parse the job result),
 * the next scheduled run, and a Run-now trigger. Run-now executes the
 * weekly-refresh code path (full runs for all configured cities), so it
 * can't create the category-scoped partial runs the merge logic dislikes.
 */
export function WasteRefreshPanel() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const queryClient = useQueryClient()
  const [liveJobId, setLiveJobId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  const scheduleQuery = useQuery<CustomScheduledJob | null>({
    queryKey: ["waste", "refresh-schedule"],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      const all = await getAllScheduledJobs(token)
      return (
        all.custom_schedules.find(
          (s) => s.job_type === "weekly_waste_refresh",
        ) ?? null
      )
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  const schedule = scheduleQuery.data

  // Live job takes precedence over the schedule's recorded last run.
  const trackedJobId = liveJobId ?? schedule?.last_run_job_id ?? null
  const jobQuery = useQuery({
    queryKey: ["waste", "refresh-job", trackedJobId],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      return getJob(trackedJobId as string, token)
    },
    enabled: isAuthenticated && !!trackedJobId,
    // Poll while a run we started is in flight. Keyed on liveJobId (not the
    // fetched status) so polling survives a transient getJob error right
    // after the trigger, before the job row is visible.
    refetchInterval: (query) => {
      if (liveJobId) return 5000
      const status = query.state.data?.status
      return status === "pending" || status === "running" ? 5000 : false
    },
    // A finished job never changes; only the poll path needs freshness.
    staleTime: liveJobId ? 0 : Infinity,
    refetchOnWindowFocus: false,
  })
  const job = jobQuery.data
  // liveJobId counts as running even before the first poll returns, so the
  // Run button can't re-enable in the gap and double-trigger a refresh.
  const isRunning =
    liveJobId != null ||
    job?.status === "pending" ||
    job?.status === "running"
  const cityResults = parseCityResults(job?.result)

  // When a run we started finishes, fresh findings may exist.
  const liveJobStatus = liveJobId ? job?.status : undefined
  useEffect(() => {
    if (!liveJobId) return
    if (liveJobStatus !== "completed" && liveJobStatus !== "failed") return
    setLiveJobId(null)
    queryClient.invalidateQueries({ queryKey: ["waste", "persisted"] })
    queryClient.invalidateQueries({ queryKey: ["waste", "runs"] })
    queryClient.invalidateQueries({ queryKey: ["waste", "refresh-schedule"] })
  }, [liveJobId, liveJobStatus, queryClient])

  const startRun = async () => {
    if (!schedule || isStarting || isRunning) return
    setIsStarting(true)
    setStartError(null)
    try {
      const token = await getAccessTokenSilently()
      const res = await runCustomScheduledJob(schedule.id, token)
      const jobId = res?.job_id
      if (res?.status === "skipped") {
        // The backend declined to run (schedule paused, or a run already in
        // flight). Without this the click appears to do nothing.
        setStartError(
          res?.message || "Run was skipped: a refresh may already be running.",
        )
      } else if (typeof jobId === "string" && jobId) {
        setLiveJobId(jobId)
      } else {
        // Started but not trackable; refetch the schedule for last_run info.
        queryClient.invalidateQueries({
          queryKey: ["waste", "refresh-schedule"],
        })
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }

  if (scheduleQuery.isLoading) {
    return (
      <p className="px-3 py-2 text-xs text-gray-500">Loading refresh status…</p>
    )
  }
  if (!schedule) {
    return (
      <p className="px-3 py-2 text-xs text-gray-500">
        Weekly refresh schedule not found. Seed it from Job Administration on
        the home page, or set SEED_WEEKLY_WASTE_REFRESH_SCHEDULE on the
        backend and restart the scheduler.
      </p>
    )
  }

  return (
    <div className="px-3 py-2" data-testid="waste-refresh-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Weekly data refresh
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            startRun()
          }}
          disabled={isStarting || isRunning}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors",
            isStarting || isRunning
              ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
              : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
          )}
        >
          {isRunning || isStarting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isRunning ? "Running…" : isStarting ? "Starting…" : "Run now"}
        </button>
      </div>

      {isRunning ? (
        <p className="mt-1.5 text-xs text-gray-600">
          <RefreshCw className="w-3 h-3 inline mr-1 animate-spin text-purple-500" />
          {job?.status_message || "Refreshing all cities…"}{" "}
          {typeof job?.progress === "number" && job.progress > 0
            ? `(${job.progress}%)`
            : null}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-gray-600">
            Last run {formatWhen(schedule.last_run_at)} · next{" "}
            {formatWhen(schedule.next_run_at)}
          </p>
          {cityResults.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {cityResults.map((c) => {
                const ok = c.status === "completed" || c.status === "success"
                return (
                  <li
                    key={c.city_id}
                    className="flex items-center gap-1.5 text-xs"
                    title={c.error || undefined}
                  >
                    {ok ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                    )}
                    <span className="text-gray-700">{c.city_name}</span>
                    <span className={ok ? "text-emerald-600" : "text-red-600"}>
                      {ok ? "ok" : c.status}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {startError && (
        <p className="mt-1 text-xs text-red-600">
          Couldn&apos;t start refresh: {startError}
        </p>
      )}
    </div>
  )
}
