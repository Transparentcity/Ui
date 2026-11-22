"use client"

import { useState, type ReactNode } from "react"
import { ReporterFeedLeads } from "@/components/reporter-feed-leads"

type View = "emails" | "feed_leads"

/** Top-level switch between email drafts and reporter feed leads (flag-gated by the page). */
export function ReviewAndSendTabs({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("emails")
  const views: { key: View; label: string }[] = [
    { key: "emails", label: "Email drafts" },
    { key: "feed_leads", label: "Feed leads" },
  ]
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-2">
        {views.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === v.key ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "emails" ? children : <ReporterFeedLeads />}
    </div>
  )
}
