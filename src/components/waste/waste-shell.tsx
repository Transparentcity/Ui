"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth0 } from "@auth0/auth0-react"
import {
  ShieldAlert,
  ArrowLeft,
  LogIn,
  MapPin,
  Settings as SettingsIcon,
  Sparkles,
  PanelRightOpen,
  Code2,
  SlidersHorizontal,
  BookOpen,
  Cpu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Loader from "@/components/Loader"
import { useWasteCity } from "./WasteCityContext"
import { WasteCityPicker } from "./waste-city-picker"
import { useLatestWasteRun } from "@/lib/hooks/useWaste"
import {
  WasteSeymourProvider,
  useWasteSeymour,
} from "./waste-seymour-context"
import { WasteSeymourRail } from "./waste-seymour-rail"

type TabItem = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const GEAR_LINKS: TabItem[] = [
  {
    key: "detectors",
    name: "Detectors & Data",
    href: "/waste#detectors",
    icon: Cpu,
  },
  {
    key: "methodology",
    name: "Methodology",
    href: "/waste/methodology",
    icon: BookOpen,
  },
  {
    key: "thresholds",
    name: "Thresholds",
    href: "/waste/settings/thresholds",
    icon: SlidersHorizontal,
  },
  { key: "api", name: "Guardrails API", href: "/waste/api", icon: Code2 },
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

export function WasteShell(props: WasteShellProps) {
  return (
    <WasteSeymourProvider>
      <WasteShellInner {...props} />
    </WasteSeymourProvider>
  )
}

function WasteShellInner({
  children,
  title,
  description,
  actions,
}: WasteShellProps) {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } =
    useAuth0()
  const {
    selectedCityId,
    eligibleCities,
    isLoading: citiesLoading,
    isFetching,
    setSelectedCityId,
    selectedCityName,
  } = useWasteCity()
  const { data: latestRun, isLoading: latestRunLoading } =
    useLatestWasteRun(selectedCityId)
  const { open: seymourOpen, toggle: toggleSeymour } = useWasteSeymour()

  const [gearOpen, setGearOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!gearOpen) return
    function onClick(e: MouseEvent) {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [gearOpen])

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
    const dateStr = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    if (diffDays === 0)
      return `Today, ${d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}`
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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 lg:px-6 py-2.5">
          <div className="flex items-center gap-3">
            <Link
              href="/home"
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
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-700 border border-purple-200"
              title="This module is currently admin-only."
            >
              Admin
            </span>
          </div>

          <div className="flex items-center gap-4">
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
                <span
                  className="text-[11px] text-gray-500 whitespace-nowrap"
                  title="Most recent data pull"
                >
                  Data: {lastPullLabel}
                </span>
              ) : latestRun === null && !latestRunLoading ? (
                <span className="text-[11px] text-amber-500 whitespace-nowrap">
                  No data yet
                </span>
              ) : null}
            </div>

            <Link
              href="/home"
              className="flex items-center gap-1.5 text-xs text-gray-500 no-underline hover:text-purple-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Main App</span>
            </Link>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleSeymour}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors",
                  seymourOpen
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-white text-gray-500 border-gray-200 hover:text-purple-700 hover:border-purple-200",
                )}
                title={seymourOpen ? "Hide Seymour" : "Ask Seymour"}
              >
                {seymourOpen ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <PanelRightOpen className="w-3.5 h-3.5" />
                )}
                Seymour
              </button>

              <div className="relative" ref={gearRef}>
                <button
                  onClick={() => setGearOpen((v) => !v)}
                  className={cn(
                    "p-1.5 rounded text-gray-500 hover:text-gray-900 border border-transparent",
                    gearOpen && "bg-gray-100 border-gray-200",
                  )}
                  title="Admin tools"
                  aria-label="Admin tools"
                >
                  <SettingsIcon className="w-4 h-4" />
                </button>
                {gearOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Admin tools
                    </p>
                    {GEAR_LINKS.map((g) => {
                      const Icon = g.icon
                      return (
                        <Link
                          key={g.key}
                          href={g.href}
                          onClick={() => setGearOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 no-underline"
                        >
                          <Icon className="w-3.5 h-3.5 text-gray-400" />
                          {g.name}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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

      {/* Content + persistent Seymour rail */}
      <div className="flex-1 flex min-h-0">
        <main
          id="main-content"
          className="flex-1 p-3 lg:p-5 overflow-y-auto"
        >
          {children}
        </main>
        <WasteSeymourRail />
      </div>

      <footer className="px-4 lg:px-6 py-3 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-500 text-center">
          Analyzing: {selectedCityName} &middot; Anomalies &ne; confirmed fraud
        </p>
      </footer>
    </div>
  )
}
