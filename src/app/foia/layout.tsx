import React from "react"
import { FoiaSidebar } from "@/components/foia/sidebar"
import { AdminGuard } from "@/components/AdminGuard"

export const metadata = {
  title: "FOIA Module - Transparent City",
  description: "Manage public records requests and data acquisition workflows",
}

export default function FoiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard fallbackUrl="/home">
      <div className="flex h-screen overflow-hidden bg-background">
        <FoiaSidebar />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}
