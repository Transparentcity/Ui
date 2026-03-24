"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Activity,
  Inbox,
  BarChart3,
  FolderOpen,
} from "lucide-react"
import { useWasteViewMode } from "./WasteViewModeContext"

type InvestigationsTab = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const INVESTIGATIONS_TABS: InvestigationsTab[] = [
  { key: "dashboard", name: "Dashboard", href: "/waste/dashboard", icon: Activity },
  { key: "queue", name: "Queue", href: "/waste/queue", icon: Inbox },
  { key: "cases", name: "Cases", href: "/waste/investigations", icon: FolderOpen },
  { key: "scores", name: "Entity Scores", href: "/waste/scores", icon: BarChart3 },
]

interface InvestigationsShellProps {
  children: React.ReactNode
  title?: string
}

export function InvestigationsShell({ children, title }: InvestigationsShellProps) {
  const pathname = usePathname()
  const { viewMode } = useWasteViewMode()

  const isTabActive = (tab: InvestigationsTab) => {
    if (tab.href === "/waste/dashboard") return pathname === "/waste/dashboard"
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  return (
    <div>
      {/* Sub-tabs only visible in admin mode */}
      {viewMode === "admin" && (
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
                    : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300"
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
