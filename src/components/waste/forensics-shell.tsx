"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

type ForensicsTab = {
  key: string
  name: string
  href: string
}

// Simplified navigation: category browsing is the primary entry point,
// with department profiles and reports alongside it.
const FORENSICS_TABS: ForensicsTab[] = [
  { key: "categories", name: "By category", href: "/waste" },
  { key: "departments", name: "By department", href: "/waste/departments" },
  { key: "reports", name: "Reports", href: "/waste/reports" },
]

interface ForensicsShellProps {
  children: React.ReactNode
  title?: string
}

export function ForensicsShell({ children, title }: ForensicsShellProps) {
  const pathname = usePathname()

  const isTabActive = (tab: ForensicsTab) => {
    if (tab.href === "/waste") {
      // Category browsing is the module root; keep it active on detail pages.
      return pathname === "/waste" || pathname.startsWith("/waste/categories")
    }
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  return (
    <div>
      {/* Sub-tab navigation: full-width 3-column grid, centered labels, active
          tab carries a 3px brand underline overlapping the container hairline. */}
      <div className="grid grid-cols-3 mb-5 border-b border-[#e5e7eb]">
        {FORENSICS_TABS.map((tab) => {
          const active = isTabActive(tab)
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "flex items-center justify-center py-3 text-sm text-center whitespace-nowrap no-underline border-b-[3px] -mb-px transition-colors",
                active
                  ? "text-[#111827] font-semibold border-[#ad35fa]"
                  : "text-[#6b7280] font-medium border-transparent hover:text-gray-900"
              )}
            >
              {tab.name}
            </Link>
          )
        })}
      </div>

      {title && (
        <h2
          className="text-lg text-gray-900 mb-4"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
      )}

      {children}
    </div>
  )
}
