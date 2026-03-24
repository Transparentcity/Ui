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
  SlidersHorizontal,
  ArrowLeft,
  LogIn,
  MapPin,
  FileText,
  Settings,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Loader from "@/components/Loader"
import { useWasteCity } from "./WasteCityContext"
import { WasteCityPicker } from "./waste-city-picker"
import { useLatestWasteRun } from "@/lib/hooks/useWaste"
import { WasteViewModeProvider, useWasteViewMode } from "./WasteViewModeContext"

type TabItem = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

// Auditor-facing tabs — clean, focused
const AUDITOR_TABS: TabItem[] = [
  { key: "workspace", name: "Findings", href: "/waste", icon: LayoutGrid },
  { key: "investigations", name: "Dashboard", href: "/waste/dashboard", icon: Activity },
  { key: "api", name: "Guardrails API", href: "/waste/api", icon: Code2 },
]

// Admin-only tabs — shown in admin mode
const ADMIN_EXTRA_TABS: TabItem[] = [
  { key: "backtrace", name: "Forensics", href: "/waste/forensics", icon: Search },
  { key: "executive", name: "Backtrace", href: "/waste/executive", icon: FileText },
  { key: "thresholds", name: "Thresholds", href: "/waste/settings/thresholds", icon: SlidersHorizontal },
]

const FOLDED_ROUTES: Record<string, string[]> = {
  investigations: ["/waste/dashboard", "/waste/queue", "/waste/investigations", "/waste/scores"],
  backtrace: ["/waste/forensics"],
  executive: ["/waste/executive"],
  thresholds: ["/waste/settings/thresholds", "/waste/methodology"],
}

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

export function WasteShell(props: WasteShellProps) {
  return (
    <WasteViewModeProvider>
      <WasteShellInner {...props} />
    </WasteViewModeProvider>
  )
}

function WasteShellInner({
  children,
  title,
  description,
  actions,
}: WasteShellProps) {
  const pathname = usePathname()
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0()
  const { selectedCityId, eligibleCities, isLoading: citiesLoading, isFetching, setSelectedCityId, selectedCityName } = useWasteCity()
  const { data: latestRun, isLoading: latestRunLoading } = useLatestWasteRun(selectedCityId)
  const { viewMode, toggle: toggleViewMode } = useWasteViewMode()

  const visibleTabs = viewMode === "admin"
    ? [...AUDITOR_TABS, ...ADMIN_EXTRA_TABS]
    : AUDITOR_TABS

  const lastPullLabel = (() => {
    if (!latestRun) return null
    const ts = latestRun.completed_at ?? latestRun.analysis_timestamp
    if (!ts) {
      if (latestRun.status === "running") return "Running…"
      return null
    }
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86_400_000)
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    if (diffDays === 0) return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    if (diffDays === 1) return `Yesterday`
    if (diffDays < 7) return `${diffDays}d ago (${dateStr})`
    return dateStr
  })()

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
    const routes = FOLDED_ROUTES[tab.key]
    if (routes) {
      return routes.some(
        (r) => pathname === r || pathname.startsWith(`${r}/`)
      )
    }
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top bar: branding + city indicator + back link */}
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
              Waste Detection
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* City selector + indicator */}
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <WasteCityPicker
                selectedCityId={selectedCityId}
                cities={eligibleCities}
                isLoading={citiesLoading}
                isFetching={isFetching}
                onChange={setSelectedCityId}
              />
              {lastPullLabel ? (
                <span className="text-[11px] text-gray-400 whitespace-nowrap" title="Most recent data pull">
                  Data: {lastPullLabel}
                </span>
              ) : latestRun === null && !latestRunLoading ? (
                <span className="text-[11px] text-amber-500 whitespace-nowrap">
                  No data yet
                </span>
              ) : null}
            </div>

            {/* View mode indicator + toggle */}
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-l-md text-xs font-medium border border-r-0",
                  viewMode === "admin"
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                )}
              >
                {viewMode === "admin" ? (
                  <><Settings className="w-3.5 h-3.5" /> Admin</>
                ) : (
                  <><Eye className="w-3.5 h-3.5" /> Auditor</>
                )}
              </span>
              <button
                onClick={toggleViewMode}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-r-md text-xs font-medium transition-colors border",
                  viewMode === "admin"
                    ? "bg-white text-gray-500 border-purple-200 hover:bg-purple-50 hover:text-purple-600"
                    : "bg-white text-gray-500 border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                )}
                title={viewMode === "admin" ? "Switch to Auditor view" : "Switch to Admin view"}
              >
                {viewMode === "admin" ? "Auditor" : "Admin"} →
              </button>
            </div>

            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-xs text-gray-400 no-underline hover:text-purple-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Main App</span>
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <nav className="flex items-center gap-0 px-4 lg:px-6 overflow-x-auto scrollbar-hide">
          {visibleTabs.map((tab) => {
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
              {title}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              <MapPin className="w-3 h-3" />
              {selectedCityName}
            </span>
          </div>
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
          Analyzing: {selectedCityName} &middot; Anomalies &ne; confirmed fraud
        </p>
      </footer>
    </div>
  )
}
