"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Inbox, FolderOpen } from "lucide-react"
import { WasteSeymourAskBar } from "./waste-seymour-ask-bar"

type InvestigationsTab = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const INVESTIGATIONS_TABS: InvestigationsTab[] = [
  { key: "queue", name: "Queue", href: "/waste/queue", icon: Inbox },
  { key: "cases", name: "Open cases", href: "/waste/investigations", icon: FolderOpen },
]

interface InvestigationsShellProps {
  children: React.ReactNode
  title?: string
}

/**
 * Inner sub-tabs for the Cases area: Queue + Open cases. Sits between the
 * top WasteShell tabs and the page body. Hidden on the dashboard/overview
 * page since that lives under its own top tab now.
 */
export function InvestigationsShell({
  children,
  title,
}: InvestigationsShellProps) {
  const pathname = usePathname()

  const showTabs =
    pathname.startsWith("/waste/queue") ||
    pathname.startsWith("/waste/investigations")

  const isTabActive = (tab: InvestigationsTab) =>
    pathname === tab.href || pathname.startsWith(`${tab.href}/`)

  const askContextLabel = pathname.startsWith("/waste/queue")
    ? "Cases — review queue"
    : pathname.startsWith("/waste/investigations")
      ? "Cases — open investigations"
      : "Cases"

  return (
    <div>
      {showTabs && (
        <div className="mb-3">
          <WasteSeymourAskBar context={{ label: askContextLabel }} />
        </div>
      )}
      {showTabs && (
        <div className="flex items-center gap-0 mb-5 border-b border-gray-200 overflow-x-auto scrollbar-hide -mt-1">
          {INVESTIGATIONS_TABS.map((tab) => {
            const Icon = tab.icon
            const active = isTabActive(tab)
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap no-underline border-b-2 transition-colors",
                  active
                    ? "text-purple-700 border-purple-600"
                    : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.name}
              </Link>
            )
          })}
        </div>
      )}

      {title && (
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      )}

      {children}
    </div>
  )
}
