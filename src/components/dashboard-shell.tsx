"use client"

import React from "react"
import { MapPin, Globe } from "lucide-react"
import { CRMSidebar } from "./crm-sidebar"
import { AdminGuard } from "./AdminGuard"
import { CrmCityProvider, useCrmCitySafe } from "./crm-city-context"

interface DashboardShellProps {
  children: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
  cityAware?: boolean
}

export function DashboardShell({
  children,
  title,
  description,
  actions,
  cityAware = false,
}: DashboardShellProps) {
  return (
    <AdminGuard fallbackUrl="/home">
      <CrmCityProvider>
        <div className="md:hidden min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
          <div className="max-w-sm">
            <h1 className="text-lg font-semibold text-gray-900">Open on desktop</h1>
            <p className="mt-2 text-sm text-gray-600">
              The CRM dashboard is optimized for larger screens. Please switch to a
              desktop or tablet to continue.
            </p>
          </div>
        </div>
        <div className="hidden md:flex min-h-screen bg-gray-50">
          <CRMSidebar />
          <main id="main-content" className="flex-1 flex flex-col min-w-0">
            <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-200 min-h-16 gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
                    {title}
                  </h1>
                  {cityAware ? <ActiveCityChip /> : <GlobalScopeChip />}
                </div>
                {description && (
                  <p className="mt-1 text-sm text-gray-500">{description}</p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-3">{actions}</div>
              )}
            </header>

            <div className="flex-1 p-8 overflow-y-auto">
              {children}
            </div>
          </main>
        </div>
      </CrmCityProvider>
    </AdminGuard>
  )
}

function ActiveCityChip() {
  const ctx = useCrmCitySafe()
  const selected = ctx?.selectedCity ?? null
  const setPickerOpen = ctx?.setPickerOpen

  const label = selected
    ? `${selected.emoji ? selected.emoji + " " : ""}${selected.name}${
        selected.state ? `, ${selected.state}` : ""
      }`
    : "No city selected"

  return (
    <button
      type="button"
      onClick={() => setPickerOpen?.(true)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-200 bg-purple-50 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
      aria-label={selected ? `Change city from ${label}` : "Choose a city"}
    >
      <MapPin className="w-3 h-3" />
      {label}
      <span className="ml-1 text-purple-500/80 font-normal">change</span>
    </button>
  )
}

function GlobalScopeChip() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs font-medium text-gray-600"
      title="This page shows data across all cities"
    >
      <Globe className="w-3 h-3" />
      Global · all cities
    </span>
  )
}
