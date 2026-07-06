"use client"

import React, { createContext, useContext } from "react"
import {
  useWasteSelectedCity,
  type WasteCityOption,
} from "@/lib/hooks/useWasteSelectedCity"

interface WasteCityContextValue {
  selectedCityId: number
  eligibleCities: WasteCityOption[]
  isLoading: boolean
  isFetching: boolean
  cityLoadError: Error | null
  isCityFallback: boolean
  setSelectedCityId: (id: number | null) => void
  selectedCityName: string
}

const WasteCityCtx = createContext<WasteCityContextValue | null>(null)

export function WasteCityProvider({ children }: { children: React.ReactNode }) {
  const city = useWasteSelectedCity()

  const selectedCityName =
    city.eligibleCities.find((c) => Number(c.id) === city.selectedCityId)?.name ??
    "City"

  return (
    <WasteCityCtx.Provider value={{ ...city, selectedCityName }}>
      {children}
    </WasteCityCtx.Provider>
  )
}

export function useWasteCity(): WasteCityContextValue {
  const ctx = useContext(WasteCityCtx)
  if (!ctx) {
    throw new Error("useWasteCity must be used inside <WasteCityProvider>")
  }
  return ctx
}
