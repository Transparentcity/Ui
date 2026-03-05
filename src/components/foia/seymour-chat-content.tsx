"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { sendChatMessageStream, createNewSession } from "@/lib/apiClient"
import type { ChatMessageRequest } from "@/lib/apiClient"

// ---------------------------------------------------------------------------
// FOIA-relevant Seymour capabilities reference
// ---------------------------------------------------------------------------

const foiaToolNames = [
  "Classify FOIA Email",
  "Process FOIA Emails",
  "Search Datasets",
  "Fetch Portal Data",
  "Anomaly Detection",
  "Web Research",
  "Send Email",
  "Analyze Requests",
]

// ---------------------------------------------------------------------------
// Quick-start prompts
// ---------------------------------------------------------------------------

const quickPrompts = [
  "Check the inbox for any new FOIA responses",
  "Which requests are overdue?",
  "Help me draft a new FOIA request for police incident data",
  "What's the status of our open requests?",
  "Research how to file a FOIA request in Austin, TX",
  "Draft a follow-up email for stalled requests",
]

// ---------------------------------------------------------------------------
// Chat message types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SeymourChatContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showTools, setShowTools] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function getToken(): Promise<string | undefined> {
    if (!isAuthenticated) return undefined
    try {
      return await getAccessTokenSilently()
    } catch {
      return undefined
    }
  }

  async function handleSend(text?: string) {
    const message = (text ?? input).trim()
    if (!message || sending) return

    setInput("")
    setShowTools(false)
    setSending(true)

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: message }])

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }])

    const token = await getToken()

    try {
      // Create session if needed
      let sid = sessionId
      if (!sid && token) {
        try {
          const session = await createNewSession("claude-sonnet-4.6", ["core", "foia", "email", "research", "web_search"], token)
          sid = session.session_id
          setSessionId(sid)
        } catch {
          // Fall back to sessionless
        }
      }

      const payload: ChatMessageRequest = {
        message,
        session_id: sid,
        tool_groups: ["core", "foia", "email", "research", "web_search"],
      }

      let fullResponse = ""

      if (token) {
        try {
          await sendChatMessageStream(payload, token, (event) => {
            if (event.type === "content" && event.content) {
              fullResponse += event.content
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: fullResponse, isStreaming: true }
                }
                return updated
              })
            }
            if (event.type === "session_id" && (event as any).session_id) {
              setSessionId((event as any).session_id)
            }
          })
        } catch (err) {
          fullResponse = fullResponse || "Sorry, I encountered an error processing your request. Please try again."
        }
      } else {
        fullResponse = "Please sign in to use Seymour. Authentication is required to access FOIA tools."
      }

      // Finalize the streaming message
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { role: "assistant", content: fullResponse || "I processed your request but didn't generate a text response. Check the Inbox or Requests tabs for any new items." }
        }
        return updated
      })
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { role: "assistant", content: "Sorry, something went wrong. Please try again." }
        }
        return updated
      })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
            <Bot className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Seymour</h1>
            <p className="text-sm text-gray-500">AI assistant for FOIA workflow</p>
          </div>
        </div>
      </div>

      {/* Tools reference + quick prompts */}
      {messages.length === 0 && (
        <div className="mb-4">
          <Collapsible open={showTools} onOpenChange={setShowTools}>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
              Available commands
              {showTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {foiaToolNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Quick prompts */}
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-gray-500">Quick start:</p>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={sending}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">Send a message to start working with Seymour</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 mb-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 mt-0.5">
                <Bot className="h-4 w-4 text-purple-600" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content || (msg.isStreaming ? "" : "...")}</div>
              {msg.isStreaming && sending && (
                <span className="inline-block mt-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                </span>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 mt-0.5">
                <User className="h-4 w-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Seymour anything about FOIA requests..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!input.trim() || sending}
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
