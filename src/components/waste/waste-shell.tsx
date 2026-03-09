"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth0 } from "@auth0/auth0-react"
import {
  ShieldAlert,
  LayoutGrid,
  Activity,
  Search,
  Code2,
  Inbox,
  FolderOpen,
  BarChart3,
  SlidersHorizontal,
  FileText,
  ArrowLeft,
  LogIn,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Loader from "@/components/Loader"

type TabItem = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const TOP_TABS: TabItem[] = [
  { key: "overview", name: "Command Center", href: "/waste", icon: LayoutGrid },
  { key: "dashboard", name: "Operations", href: "/waste/dashboard", icon: Activity },
  { key: "forensics", name: "Forensics", href: "/waste/forensics", icon: Search },
  { key: "api", name: "API", href: "/waste/api", icon: Code2 },
  { key: "queue", name: "Queue", href: "/waste/queue", icon: Inbox },
  { key: "investigations", name: "Investigations", href: "/waste/investigations", icon: FolderOpen },
  { key: "scores", name: "Scores", href: "/waste/scores", icon: BarChart3 },
  { key: "executive", name: "Executive", href: "/waste/executive", icon: FileText },
  { key: "thresholds", name: "Thresholds", href: "/waste/settings/thresholds", icon: SlidersHorizontal },
]

interface WasteShellProps {
  children: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
  /** @deprecated kept for backward compat with WastePageContent */
  activeCategory?: string
  /** @deprecated kept for backward compat with WastePageContent */
  onCategoryChange?: (category: string) => void
}

export function WasteShell({
  children,
  title,
  description,
  actions,
}: WasteShellProps) {
  const pathname = usePathname()
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0()

  if (authLoading) {
    return <Loader />
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-purple-600 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Sign in required
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            You need to be signed in to access Waste Detection.
          </p>
          <button
            onClick={() =>
              loginWithRedirect({
                appState: { returnTo: window.location.pathname },
              })
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const isTabActive = (tab: TabItem) => {
    if (tab.href === "/waste") return pathname === "/waste"
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top bar: branding + back link */}
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 lg:px-6 py-2.5">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 text-inherit no-underline"
            >
              <div className="w-5 h-5 shrink-0">
                <svg
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                  className="overflow-visible w-full h-full"
                >
                  <path
                    d="M 0 45 Q 0 0, 45 0 L 50 0 L 50 8.333 L 45 8.333 Q 8.333 8.333, 8.333 45 L 8.333 50 L 0 50 Z"
                    className="fill-gray-900"
                  />
                  <path
                    d="M 100 55 Q 100 100, 55 100 L 50 100 L 50 91.666 L 55 91.666 Q 91.666 91.666, 91.666 55 L 91.666 50 L 100 50 Z"
                    className="fill-gray-900"
                  />
                </svg>
              </div>
              <div className="font-bold text-lg whitespace-nowrap">
                <span className="text-gray-900">Transparent</span>
                <span className="text-purple-600">.city</span>
              </div>
            </Link>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span className="text-sm font-medium text-gray-500 hidden sm:inline">
              Waste Detection Module
            </span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-gray-400 no-underline hover:text-purple-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Main App</span>
          </Link>
        </div>

        {/* Tab bar */}
        <nav className="flex items-center gap-0 px-4 lg:px-6 overflow-x-auto scrollbar-hide">
          {TOP_TABS.map((tab) => {
            const Icon = tab.icon
            const active = isTabActive(tab)
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap no-underline border-b-2 transition-colors",
                  active
                    ? "text-purple-600 border-purple-600"
                    : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </Link>
            )
          })}
        </nav>
      </header>

      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>

      {/* Content */}
      <main className="flex-1 p-3 lg:p-5 overflow-y-auto">{children}</main>

      {/* Footer */}
      <footer className="px-4 lg:px-6 py-3 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-400 text-center">
          Data: DataSF Open Data Portal &middot; Anomalies &ne; confirmed fraud
        </p>
      </footer>
    </div>
  )
}
