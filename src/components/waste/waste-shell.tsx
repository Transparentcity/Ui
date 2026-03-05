"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth0 } from "@auth0/auth0-react"
import {
  ShieldAlert,
  DollarSign,
  Truck,
  Building2,
  Scale,
  ArrowLeft,
  LogIn,
  Database,
  ClipboardCheck,
  Gauge,
  Target,
  ListChecks,
  Search,
  SlidersHorizontal,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Loader from "@/components/Loader"

type NavigationItem = {
  key: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  mode?: "category" | "link"
}

const navigation: NavigationItem[] = [
  {
    key: "overview",
    name: "Overview",
    href: "/waste",
    icon: ShieldAlert,
    description: "All anomalies",
    mode: "category",
  },
  {
    key: "payroll",
    name: "Payroll",
    href: "/waste#payroll",
    icon: DollarSign,
    description: "Compensation analysis",
    mode: "category",
  },
  {
    key: "contracts",
    name: "Contracts",
    href: "/waste#contracts",
    icon: Truck,
    description: "Procurement analysis",
    mode: "category",
  },
  {
    key: "infrastructure",
    name: "Infrastructure",
    href: "/waste#infrastructure",
    icon: Building2,
    description: "311 & services",
    mode: "category",
  },
  {
    key: "detectors",
    name: "Detectors & Data",
    href: "/waste#detectors",
    icon: Database,
    description: "Algorithms & datasets",
    mode: "category",
  },
  {
    key: "review",
    name: "Queue Overview",
    href: "/waste#review",
    icon: ClipboardCheck,
    description: "Quick triage view",
    mode: "category",
  },
  {
    key: "accuracy",
    name: "Detector Accuracy",
    href: "/waste#accuracy",
    icon: Gauge,
    description: "Precision feedback",
    mode: "category",
  },
  {
    key: "scores",
    name: "Entity Scores",
    href: "/waste/scores",
    icon: Target,
    description: "Risk score rankings",
    mode: "link",
  },
  {
    key: "queue-page",
    name: "Review Workbench",
    href: "/waste/queue",
    icon: ListChecks,
    description: "Full auditor workbench",
    mode: "link",
  },
  {
    key: "investigations",
    name: "Investigations",
    href: "/waste/investigations",
    icon: Search,
    description: "Active investigations",
    mode: "link",
  },
  {
    key: "thresholds",
    name: "Thresholds",
    href: "/waste/settings/thresholds",
    icon: SlidersHorizontal,
    description: "Detector sensitivity",
    mode: "link",
  },
  {
    key: "analysis",
    name: "Analysis",
    href: "/analysis",
    icon: Scale,
    description: "Auditor reports",
    mode: "link",
  },
]

interface WasteShellProps {
  children: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
  activeCategory?: string
  onCategoryChange?: (category: string) => void
}

export function WasteShell({
  children,
  title,
  description,
  actions,
  activeCategory,
  onCategoryChange,
}: WasteShellProps) {
  const pathname = usePathname()
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Handle auth: redirect to login if not authenticated
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

  const handleNavClick = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "w-[260px] min-w-[260px] h-screen bg-white border-r border-gray-200 flex-col sticky top-0 left-0 z-50",
          sidebarOpen
            ? "fixed flex lg:sticky"
            : "hidden lg:flex"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 min-h-16">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-inherit no-underline flex-1"
            onClick={handleNavClick}
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
        </div>

        {/* Module label */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Waste Detection
          </span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs text-gray-400 no-underline hover:text-purple-600 transition-colors"
            onClick={handleNavClick}
          >
            <ArrowLeft className="w-3 h-3" />
            Main App
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          <ul className="list-none m-0 p-0">
            {navigation.map((item) => {
              const isLinkItem = item.mode === "link"
              const isActive = isLinkItem
                ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                : activeCategory
                  ? item.key === activeCategory
                  : item.href === "/waste"
                    ? pathname === "/waste"
                    : pathname.startsWith(item.href.split("#")[0]) &&
                      item.href !== "/waste"

              return (
                <li key={item.name}>
                  {onCategoryChange && !isLinkItem ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCategoryChange(item.key)
                        handleNavClick()
                      }}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-all border-l-[3px]",
                        isActive
                          ? "text-purple-600 font-semibold bg-gray-100 border-l-purple-600"
                          : "text-gray-600 font-normal bg-transparent border-l-transparent hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px]" />
                      <div className="flex-1">
                        <span className="block">{item.name}</span>
                        <span className="block text-[11px] text-gray-400 font-normal">
                          {item.description}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={handleNavClick}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-all border-l-[3px]",
                        isActive
                          ? "text-purple-600 font-semibold bg-gray-100 border-l-purple-600"
                          : "text-gray-600 font-normal bg-transparent border-l-transparent hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px]" />
                      <div className="flex-1">
                        <span className="block">{item.name}</span>
                        <span className="block text-[11px] text-gray-400 font-normal">
                          {item.description}
                        </span>
                      </div>
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-gray-100" />

          {/* Info section */}
          <div className="px-4 py-2">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Analyzes publicly available data from the SF Open Data Portal.
              Anomalies are statistical patterns that warrant investigation —
              they do not confirm fraud or waste.
            </p>
          </div>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-white">
          <p className="text-xs text-gray-400 m-0">
            Data: DataSF Open Data Portal
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 lg:px-8 py-5 bg-white border-b border-gray-200 min-h-16 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-gray-100 text-gray-600"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-gray-500">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </header>

        {/* Content */}
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
