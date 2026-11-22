"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { toast } from "sonner"
import { Check, Copy, Link2, Loader2, RefreshCw, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  REJECT_CODES,
  SCORE_PARTS,
  approveItem,
  issueToken,
  listFeeds,
  listItems,
  queueCandidates,
  rejectItem,
  revokeToken,
  type FeedItemContents,
  type QueueResult,
  type RejectCode,
  type ReporterFeed,
  type ReporterFeedItem,
} from "@/lib/reporterFeedLeads"

/** How the item reads in the reporter's RSS reader. */
export function FeedItemPreview({ item }: { item: FeedItemContents }) {
  const source =
    typeof item.source === "string"
      ? item.source
      : item.source
        ? [item.source.dataset, item.source.publisher].filter(Boolean).join(", ")
        : ""
  return (
    <div className="space-y-2 text-sm text-gray-800">
      <p className="font-semibold text-gray-900">{item.title}</p>
      {item.finding && <p>{item.finding}</p>}
      {item.numbers?.length > 0 && (
        <ul className="list-disc pl-5 space-y-1">
          {item.numbers.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {item.why_unusual && (
        <p>
          <span className="font-medium">Why unusual:</span> {item.why_unusual}
        </p>
      )}
      {item.why_you && (
        <p>
          <span className="font-medium">Why you:</span> {item.why_you}
        </p>
      )}
      <p className="flex gap-3">
        <a href={item.story_url} target="_blank" rel="noreferrer" className="text-purple-700 underline">
          Story
        </a>
        {item.metric_url && (
          <a href={item.metric_url} target="_blank" rel="noreferrer" className="text-purple-700 underline">
            Metric
          </a>
        )}
      </p>
      <p className="text-gray-600">
        <span className="font-medium">Source:</span> {source || "missing, add before approving"}
      </p>
      {item.caveat && (
        <p className="text-gray-600">
          <span className="font-medium">Caveat:</span> {item.caveat}
        </p>
      )}
    </div>
  )
}

function ItemCard({
  item,
  onApprove,
  onReject,
  busy,
}: {
  item: ReporterFeedItem
  onApprove: (id: number, edits: Partial<FeedItemContents>) => void
  onReject: (id: number, code: RejectCode, note: string) => void
  busy: boolean
}) {
  const [whyYou, setWhyYou] = useState(item.item.why_you ?? "")
  const [rejectCode, setRejectCode] = useState<RejectCode>("off_beat")
  const [note, setNote] = useState("")

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <Badge variant="secondary">{item.reporter_name}</Badge>
          <span>Score {item.score.toFixed(2)}</span>
          {SCORE_PARTS.map((k) => (
            <span key={k}>
              {k} {Number(item.score_parts?.[k] ?? 0).toFixed(2)}
            </span>
          ))}
        </div>
        {item.reason && <p className="text-xs text-gray-600">Reason: {item.reason}</p>}
        <FeedItemPreview item={{ ...item.item, why_you: whyYou }} />
        <div className="space-y-1">
          <Label htmlFor={`why-${item.id}`}>Why you (shown to the reporter)</Label>
          <Textarea
            id={`why-${item.id}`}
            value={whyYou}
            onChange={(e) => setWhyYou(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onApprove(item.id, { why_you: whyYou })}
            className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Check className="w-4 h-4" /> Approve
          </Button>
          <select
            aria-label="Reject reason"
            value={rejectCode}
            onChange={(e) => setRejectCode(e.target.value as RejectCode)}
            className="h-8 rounded-md border border-gray-300 px-2 text-sm"
          >
            {REJECT_CODES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Reject note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 rounded-md border border-gray-300 px-2 text-sm"
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(item.id, rejectCode, note)} className="gap-1">
            <X className="w-4 h-4" /> Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ReporterFeedLeads() {
  const { getAccessTokenSilently } = useAuth0()
  const [feeds, setFeeds] = useState<ReporterFeed[]>([])
  const [items, setItems] = useState<ReporterFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [newUrl, setNewUrl] = useState<{ feedId: number; url: string } | null>(null)
  const [dryRun, setDryRun] = useState<QueueResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const headers = useCallback(async () => {
    const h: Record<string, string> = {}
    try {
      h["Authorization"] = `Bearer ${await getAccessTokenSilently()}`
    } catch {
      // dev mode without Auth0
    }
    return h
  }, [getAccessTokenSilently])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const h = await headers()
      const [f, i] = await Promise.all([listFeeds(h), listItems(h, "pending")])
      setFeeds(f)
      setItems(i)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load feed leads")
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (id: number, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    try {
      await fn()
      toast.success(ok)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading feed leads
      </div>
    )
  }
  if (error) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-red-700">{error}</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Feeds</h2>
        {feeds.length === 0 && (
          <p className="text-sm text-gray-500">No reporter feeds yet. Create one through the platform admin API.</p>
        )}
        {feeds.map((f) => (
          <Card key={f.id}>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{f.reporter_name}</span>
                <span className="text-gray-500">{f.city_name ?? `City ${f.city_id}`}</span>
                <Badge variant="secondary">{f.status}</Badge>
                <span className="text-gray-500">
                  {f.pending_count} pending, {f.approved_count} approved, {f.rejected_count} rejected
                </span>
                <span className="text-gray-500">
                  {f.active_token_id
                    ? f.last_fetched_at
                      ? `Last fetched ${new Date(f.last_fetched_at).toLocaleString()}`
                      : "URL issued, never fetched"
                    : "No URL"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === -f.id}
                  className="gap-1"
                  onClick={async () => {
                    setBusyId(-f.id)
                    try {
                      setDryRun(await queueCandidates(await headers(), f.id, true))
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Dry run failed")
                    } finally {
                      setBusyId(null)
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4" /> Dry run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === -f.id}
                  onClick={() =>
                    run(-f.id, async () => queueCandidates(await headers(), f.id, false), "Candidates queued")
                  }
                >
                  Queue candidates
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={busyId === -f.id}
                  onClick={() =>
                    run(
                      -f.id,
                      async () => {
                        const r = await issueToken(await headers(), f.id)
                        setNewUrl({ feedId: f.id, url: r.url })
                      },
                      f.active_token_id ? "URL rotated" : "URL created",
                    )
                  }
                >
                  <Link2 className="w-4 h-4" /> {f.active_token_id ? "Rotate URL" : "Create URL"}
                </Button>
                {f.active_token_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === -f.id}
                    onClick={() => run(-f.id, async () => revokeToken(await headers(), f.id), "URL revoked")}
                  >
                    Revoke URL
                  </Button>
                )}
              </div>
              {newUrl?.feedId === f.id && (
                <div className="flex items-center gap-2 rounded-md bg-yellow-50 p-2 text-xs">
                  <span className="break-all">{newUrl.url}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Copy URL"
                    onClick={() => navigator.clipboard?.writeText(newUrl.url)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <span className="text-gray-600">Shown once. Copy it now.</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {dryRun && (
          <Card>
            <CardContent className="p-4 text-sm space-y-1">
              <p className="font-medium">
                Dry run: {dryRun.stories_considered} stories, {dryRun.candidates} candidates,{" "}
                {dryRun.queued.length} would queue, {dryRun.below_min_score} below the minimum score
              </p>
              {dryRun.queued.map((q) => (
                <p key={q.story_hash} className="text-gray-700">
                  {q.score.toFixed(2)} {q.headline} ({q.reason})
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Pending review ({items.length})</h2>
        {items.length === 0 && <p className="text-sm text-gray-500">Nothing waiting for review.</p>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onApprove={(id, edits) =>
              run(id, async () => approveItem(await headers(), id, edits), "Approved; it is in the feed")
            }
            onReject={(id, code, note) =>
              run(id, async () => rejectItem(await headers(), id, code, note), "Rejected")
            }
          />
        ))}
      </section>
    </div>
  )
}
