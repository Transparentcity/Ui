"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth0 } from "@auth0/auth0-react"
import {
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  LogIn,
  MapPin,
  Settings as SettingsIcon,
  Sparkles,
  PanelRightOpen,
  Code2,
  SlidersHorizontal,
  BookOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Loader from "@/components/Loader"
import { useWasteCity } from "./WasteCityContext"
import { WasteCityPicker } from "./waste-city-picker"
import { WasteRefreshPanel } from "./waste-refresh-panel"
import { useLatestWasteRun } from "@/lib/hooks/useWaste"
import {
  WasteSeymourProvider,
  useWasteSeymour,
} from "./waste-seymour-context"
import { parseWasteTimestamp } from "./waste-utils"
import { WasteSeymourRail } from "./waste-seymour-rail"

type GearLink = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const GEAR_LINKS: GearLink[] = [
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
    cityLoadError,
    setSelectedCityId,
    selectedCityName,
    refetchCities,
  } = useWasteCity()
  const { data: latestRun, isLoading: latestRunLoading } =
    useLatestWasteRun(selectedCityId)
  const { open: seymourOpen, toggle: toggleSeymour } = useWasteSeymour()

  const selectedCityEmoji = eligibleCities.find(
    (c) => Number(c.id) === selectedCityId,
  )?.emoji

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
    const d = parseWasteTimestamp(ts)
    if (!d) return null
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000))
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
      {/* ADMIN VIEW banner: centered label flanked by dashed rules, with the
          admin-tools gear anchored at the right end. */}
      <div
        className="relative flex items-center justify-center px-4 lg:px-6 py-2"
        style={{ backgroundColor: "#f5f0fb" }}
      >
        <span
          className="flex items-center gap-3 text-[12px] font-bold"
          style={{ color: "#6d28d9", letterSpacing: "0.08em" }}
        >
          <span
            className="hidden sm:block w-16 border-t border-dashed"
            style={{ borderColor: "#c4b5fd" }}
            aria-hidden
          />
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            ADMIN VIEW
          </span>
          <span
            className="hidden sm:block w-16 border-t border-dashed"
            style={{ borderColor: "#c4b5fd" }}
            aria-hidden
          />
        </span>

        <div
          className="absolute right-3 lg:right-6 top-1/2 -translate-y-1/2"
          ref={gearRef}
        >
          <button
            onClick={() => setGearOpen((v) => !v)}
            className="inline-flex items-center gap-1 h-[26px] px-1.5 rounded-lg bg-white transition-colors"
            style={{ border: "1px solid rgba(173,53,250,0.35)" }}
            title="Admin tools"
            aria-label="Admin tools"
          >
            <SettingsIcon className="w-3.5 h-3.5" style={{ color: "#6d28d9" }} />
            <ChevronDown className="w-3 h-3" style={{ color: "#6d28d9" }} />
          </button>
          {gearOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
              <WasteRefreshPanel />
              <div className="my-1 border-t border-gray-100" />
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

      {/* City list failure: without this banner a 403 (non-admin) or outage
          leaves an empty picker and silently falls back to the default city. */}
      {cityLoadError && !citiesLoading && (
        <div className="bg-red-50 border-b border-red-200 px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">
            {(cityLoadError as { status?: number }).status === 403
              ? "Your account doesn't have admin access to the waste module, so the city list can't be loaded."
              : `Couldn't load the waste city list: ${cityLoadError.message}. Data shown below may be for the wrong city.`}
          </p>
          {(cityLoadError as { status?: number }).status !== 403 && (
            <button
              type="button"
              onClick={() => {
                void refetchCities()
              }}
              className="shrink-0 text-xs font-semibold text-red-700 underline hover:text-red-800"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* City header row: emoji tile + city picker (the city heading) on the
          left; last-pull label + Seymour toggle on the right. */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: "#f3f4f6" }}
          >
            {selectedCityEmoji ? (
              <span aria-hidden>{selectedCityEmoji}</span>
            ) : (
              <MapPin className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <WasteCityPicker
            selectedCityId={selectedCityId}
            cities={eligibleCities}
            isLoading={citiesLoading}
            isFetching={isFetching}
            onChange={setSelectedCityId}
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {lastPullLabel ? (
            <span
              className="text-[11px] text-gray-500 whitespace-nowrap"
              style={{ fontFamily: "var(--font-data)" }}
              title="Most recent data pull"
            >
              Data: {lastPullLabel}
            </span>
          ) : latestRun === null && !latestRunLoading ? (
            <span className="text-[11px] text-amber-500 whitespace-nowrap">
              No data yet
            </span>
          ) : null}

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
        </div>
      </div>

      {/* Module head: purple eyebrow, page title, description. */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p
            className="text-[11.5px] font-bold uppercase"
            style={{ color: "#ad35fa", letterSpacing: "0.06em" }}
          >
            WASTE DETECTION
          </p>
          <h1
            className="text-xl text-gray-900"
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h1>
          {description && (
            <p className="text-[13.5px]" style={{ color: "#6b7280" }}>
              {description}
            </p>
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
