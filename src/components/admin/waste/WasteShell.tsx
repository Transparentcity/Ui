"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AdminGuard } from "@/components/AdminGuard";
import { useWasteState } from "@/lib/admin/waste/useWasteState";
import { WasteSidebar } from "./WasteSidebar";
import { CitySelector } from "./CitySelector";
import { Readout } from "./Readout";

function HealthPill() {
  const ui = useWasteState();
  const cls =
    ui.health === "down"
      ? "bg-red-50 text-red-700"
      : ui.health === "warn"
      ? "bg-amber-50 text-amber-700"
      : "bg-emerald-50 text-emerald-700";
  const dot =
    ui.health === "down" ? "bg-red-500" : ui.health === "warn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline text-xs text-gray-400">{ui.lastRunAt}</span>
      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", cls)}>
        <span className={cn("w-1.5 h-1.5 rounded-full", dot)} aria-hidden="true" />
        {ui.healthLabel}
      </span>
    </div>
  );
}

function WasteHeader() {
  const ui = useWasteState();
  return (
    <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-200 min-h-16 gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap min-w-0">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{ui.sectionLabel}</h1>
        <CitySelector active={ui.city} variant="chip" />
      </div>
      <HealthPill />
    </header>
  );
}

export function WasteShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard fallbackUrl="/home">
      {/* Mobile fallback, mirrors DashboardShell */}
      <div className="md:hidden min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-gray-900">Open on desktop</h1>
          <p className="mt-2 text-sm text-gray-600">
            The waste module is optimized for larger screens. Please switch to a desktop or tablet
            to continue.
          </p>
        </div>
      </div>

      <div className="waste-root hidden md:flex min-h-screen bg-gray-50">
        <WasteSidebar />
        <main id="main-content" className="flex-1 flex flex-col min-w-0 h-screen">
          <WasteHeader />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-8 pt-6">
              <Readout />
            </div>
            {children}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}
