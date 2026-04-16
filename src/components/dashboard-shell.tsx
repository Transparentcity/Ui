"use client"

import React from "react"
import { CRMSidebar } from "./crm-sidebar"
import { AdminGuard } from "./AdminGuard"

interface DashboardShellProps {
  children: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
}

/**
 * CRM Dashboard Shell - Protected by AdminGuard
 * Only authenticated admin users can access CRM features.
 * Styled to match TransparentCity design system.
 */
export function DashboardShell({ children, title, description, actions }: DashboardShellProps) {
  return (
    <AdminGuard fallbackUrl="/home">
      <div className="flex min-h-screen bg-gray-50">
        <CRMSidebar />
        <main id="main-content" className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-200 min-h-16 gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-gray-500">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-3">
                {actions}
              </div>
            )}
          </header>
          
          {/* Content */}
          <div className="flex-1 p-8 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}
