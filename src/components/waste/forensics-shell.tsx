"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Building2, Layers, FileText } from "lucide-react"

type ForensicsTab = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

// Simplified navigation: category browsing is the primary entry point,
// with department profiles and reports alongside it.
const FORENSICS_TABS: ForensicsTab[] = [
  { key: "categories", name: "By category", href: "/waste/forensics/categories", icon: Layers },
  { key: "departments", name: "By department", href: "/waste/forensics/departments", icon: Building2 },
  { key: "reports", name: "Reports", href: "/waste/executive", icon: FileText },
]

interface ForensicsShellProps {
  children: React.ReactNode
  title?: string
}

export function ForensicsShell({ children, title }: ForensicsShellProps) {
  const pathname = usePathname()

  const isTabActive = (tab: ForensicsTab) =>
    pathname === tab.href || pathname.startsWith(`${tab.href}/`)

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-0 mb-5 border-b border-gray-200 overflow-x-auto scrollbar-hide -mt-1">
        {FORENSICS_TABS.map((tab) => {
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

      {title && (
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      )}

      {children}
    </div>
  )
}
