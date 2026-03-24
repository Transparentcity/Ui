"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

export type WasteViewMode = "auditor" | "admin"

interface WasteViewModeContextValue {
  viewMode: WasteViewMode
  toggle: () => void
}

const WasteViewModeContext = createContext<WasteViewModeContextValue>({
  viewMode: "auditor",
  toggle: () => {},
})

function getInitialMode(): WasteViewMode {
  if (typeof window === "undefined") return "auditor"
  try {
    const stored = window.localStorage.getItem("waste:viewMode")
    if (stored === "admin") return "admin"
  } catch {
    // SSR or localStorage unavailable
  }
  return "auditor"
}

export function WasteViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<WasteViewMode>(getInitialMode)

  const toggle = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === "auditor" ? "admin" : "auditor"
      try {
        window.localStorage.setItem("waste:viewMode", next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return (
    <WasteViewModeContext.Provider value={{ viewMode, toggle }}>
      {children}
    </WasteViewModeContext.Provider>
  )
}

export function useWasteViewMode() {
  return useContext(WasteViewModeContext)
}
