/**
 * Reporter leads feeds: admin review queue client (platform
 * /api/admin/reporter-feeds). Gated by NEXT_PUBLIC_REPORTER_FEEDS_ENABLED,
 * paired with REPORTER_FEEDS_ENABLED on the platform.
 */
import { getApiBaseUrl } from "@/lib/apiBase"

export function reporterFeedsEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_REPORTER_FEEDS_ENABLED ?? "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes"
}

export const REJECT_CODES = [
  { value: "off_beat", label: "Off beat" },
  { value: "weak_numbers", label: "Weak numbers" },
  { value: "already_covered", label: "Already covered" },
  { value: "other", label: "Other" },
] as const

export type RejectCode = (typeof REJECT_CODES)[number]["value"]

export const SCORE_PARTS = ["topic", "angle", "geography", "signal", "freshness", "novelty"] as const

export interface FeedItemContents {
  title: string
  finding: string
  numbers: string[]
  why_unusual: string
  why_you: string
  story_url: string
  metric_url: string | null
  source: { dataset?: string; publisher?: string; url?: string; refreshed?: string } | string | null
  caveat: string | null
}

export interface ReporterFeedItem {
  id: number
  feed_id: number
  story_id: number
  story_hash: string
  city_id: number
  status: "pending" | "approved" | "rejected"
  score: number
  score_parts: Record<string, number>
  reason: string | null
  topic_code: string | null
  item: FeedItemContents
  reporter_name: string
  queued_at: string
  approved_at: string | null
  reject_code: string | null
}

export interface ReporterFeed {
  id: number
  city_id: number
  city_name: string | null
  reporter_name: string
  outlet_domain: string | null
  feed_title: string
  status: "active" | "paused"
  min_score: number
  weekly_cap: number
  active_token_id: number | null
  last_fetched_at: string | null
  pending_count: number
  approved_count: number
  rejected_count: number
}

export interface QueueResult {
  feed_id: number
  dry_run: boolean
  stories_considered: number
  candidates: number
  below_min_score: number
  disqualified: Record<string, number>
  queued: { story_hash: string; headline: string; score: number; reason: string }[]
}

type Headers = Record<string, string>

const base = () => `${getApiBaseUrl()}/api/admin/reporter-feeds`

async function call<T>(url: string, headers: Headers, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  })
  if (!resp.ok) {
    let detail = ""
    try {
      const body = await resp.json()
      detail = typeof body?.detail === "string" ? body.detail : ""
    } catch {
      /* body was not JSON */
    }
    throw new Error(detail || `Request failed (${resp.status})`)
  }
  return (await resp.json()) as T
}

export async function listFeeds(headers: Headers): Promise<ReporterFeed[]> {
  return (await call<{ feeds: ReporterFeed[] }>(base(), headers)).feeds
}

export async function listItems(
  headers: Headers,
  status: "pending" | "approved" | "rejected" = "pending",
): Promise<ReporterFeedItem[]> {
  return (await call<{ items: ReporterFeedItem[] }>(`${base()}/items?status=${status}`, headers)).items
}

export function approveItem(headers: Headers, id: number, edits: Partial<FeedItemContents>) {
  return call<ReporterFeedItem>(`${base()}/items/${id}/approve`, headers, {
    method: "POST",
    body: JSON.stringify({ edits }),
  })
}

export function rejectItem(headers: Headers, id: number, code: RejectCode, note?: string) {
  return call<ReporterFeedItem>(`${base()}/items/${id}/reject`, headers, {
    method: "POST",
    body: JSON.stringify({ code, note: note || null }),
  })
}

export function queueCandidates(headers: Headers, feedId: number, dryRun: boolean) {
  return call<QueueResult>(`${base()}/${feedId}/queue`, headers, {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun }),
  })
}

export function issueToken(headers: Headers, feedId: number) {
  return call<{ url: string; note: string }>(`${base()}/${feedId}/token`, headers, { method: "POST" })
}

export function revokeToken(headers: Headers, feedId: number) {
  return call<{ revoked: number }>(`${base()}/${feedId}/token/revoke`, headers, { method: "POST" })
}
