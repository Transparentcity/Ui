"use client"

import type { ReactNode } from "react"
import { WasteCityProvider } from "@/components/waste/WasteCityContext"

export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return <WasteCityProvider>{children}</WasteCityProvider>
}
