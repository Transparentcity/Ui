"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import {
  Loader2,
  PanelRightClose,
  Sparkles,
  Send,
} from "lucide-react"
import { createChatJob, getJob } from "@/lib/apiClient"
import { useWasteSeymour } from "./waste-seymour-context"
import { useWasteCity } from "./WasteCityContext"

interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

const POLL_INTERVAL_MS = 1500
const MAX_POLL_MS = 120_000

export function WasteSeymourRail() {
  const { open, close, context, pendingPrompt, consumePendingPrompt } =
    useWasteSeymour()
  const { selectedCityName } = useWasteCity()
  const { getAccessTokenSilently } = useAuth0()

  const [input, setInput] = useState("")
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-fire any pending prompt the rest of the UI queued up. Fires both
  // when the rail opens (was closed) and when a new prompt is queued while
  // the rail is already open.
  useEffect(() => {
    if (!open || !pendingPrompt) return
    const pending = consumePendingPrompt()
    if (pending) {
      void send(pending)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns, busy])

  async function send(rawText: string) {
    const text = rawText.trim()
    if (!text || busy) return

    const contextLine = buildContextLine(context, selectedCityName)
    const fullMessage = contextLine
      ? `${contextLine}\n\nQuestion: ${text}`
      : text

    setTurns((prev) => [...prev, { role: "user", content: text }])
    setInput("")
    setBusy(true)
    setError(null)

    try {
      const token = await getAccessTokenSilently()
      const job = await createChatJob(
        {
          message: fullMessage,
          session_id: sessionId ?? undefined,
        },
        token,
      )

      const started = Date.now()
      let final: any = null
      while (Date.now() - started < MAX_POLL_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        const status = await getJob(job.job_id, token)
        if (status.status === "completed") {
          final = status
          break
        }
        if (status.status === "failed") {
          throw new Error(status.error || "Seymour failed to respond")
        }
      }

      if (!final) throw new Error("Seymour timed out")

      const result = final.result ?? {}
      const reply: string =
        result.response ?? result.message ?? "(no response)"
      if (result.session_id) setSessionId(result.session_id)
      setTurns((prev) => [...prev, { role: "assistant", content: reply }])
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong"
      setError(message)
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: `⚠ ${message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <aside
      className="hidden lg:flex flex-col w-[360px] shrink-0 border-l border-gray-200 bg-white"
      aria-label="Seymour assistant"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">Seymour</span>
        </div>
        <button
          onClick={close}
          className="text-gray-400 hover:text-gray-700 p-1 rounded"
          title="Collapse Seymour"
          aria-label="Collapse Seymour"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </header>

      {context && (
        <div className="px-3 py-1.5 text-[11px] text-gray-500 border-b border-gray-100 bg-gray-50">
          Looking at: <span className="text-gray-800">{context.label}</span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm"
      >
        {turns.length === 0 && (
          <div className="text-gray-500 text-xs leading-relaxed">
            Ask anything about findings, entities, or cases. I'll see what
            you're looking at and answer with that context.
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === "user"
                ? "ml-6 bg-purple-50 border border-purple-100 rounded-md px-3 py-2 text-gray-900"
                : "mr-2 text-gray-800 whitespace-pre-wrap"
            }
          >
            {t.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        className="border-t border-gray-200 p-2 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          rows={2}
          placeholder="Ask anything…"
          className="flex-1 resize-none text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-purple-600 text-white rounded p-2 disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
      {error && (
        <div className="px-3 pb-2 text-[11px] text-red-600">{error}</div>
      )}
    </aside>
  )
}

function buildContextLine(
  context: { label: string; details?: Record<string, unknown> } | null,
  cityName: string | undefined,
): string {
  const parts: string[] = []
  if (cityName) parts.push(`City: ${cityName}`)
  if (context?.label) parts.push(`Current view: ${context.label}`)
  if (context?.details) {
    try {
      parts.push(`Context: ${JSON.stringify(context.details)}`)
    } catch {
      /* ignore */
    }
  }
  return parts.length ? `(${parts.join(" · ")})` : ""
}
