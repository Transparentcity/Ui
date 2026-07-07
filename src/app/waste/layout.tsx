"use client"

import type { ReactNode } from "react"
import { WasteCityProvider } from "@/components/waste/WasteCityContext"
import { WasteAppShell } from "@/components/waste/waste-app-shell"

export default function WasteLayout({ children }: { children: ReactNode }) {
  return (
    <WasteCityProvider>
      <WasteAppShell>{children}</WasteAppShell>
    </WasteCityProvider>
  )
}
