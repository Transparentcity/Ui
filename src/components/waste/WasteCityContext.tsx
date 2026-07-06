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
  /** Slug of the selected city, or null while the city list is loading or
   *  when the selected id isn't in the eligible list. */
  selectedCitySlug: string | null
}

const WasteCityCtx = createContext<WasteCityContextValue | null>(null)

export function WasteCityProvider({ children }: { children: React.ReactNode }) {
  const city = useWasteSelectedCity()

  const selectedCity = city.eligibleCities.find(
    (c) => Number(c.id) === city.selectedCityId,
  )
  const selectedCityName = selectedCity?.name ?? "City"
  const selectedCitySlug = selectedCity?.slug ?? null

  return (
    <WasteCityCtx.Provider
      value={{ ...city, selectedCityName, selectedCitySlug }}
    >
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
