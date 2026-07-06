"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useWasteAdminCities } from "@/lib/hooks/useWasteAdmin"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"

const STORAGE_KEY = "waste:selectedCityId"

/** Minimal city shape the waste module needs for its picker. */
export interface WasteCityOption {
  id: number
  name: string
  slug: string
  emoji?: string
}

function readStoredCityId(): number | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function useWasteSelectedCity() {
  // The backend is the source of truth for which cities the waste module
  // supports: /api/admin/waste/cities marks each city `configured` (has a
  // dataset registry entry) and `launched`. Launching a new city therefore
  // requires no UI change. Reuses the shared admin cities query so both
  // consumers share one cache entry and one set of query options.
  const citiesQuery = useWasteAdminCities()

  const eligibleCities = useMemo<WasteCityOption[]>(
    () =>
      (citiesQuery.data ?? [])
        .filter((c) => c.configured && c.launched)
        .map((c) => ({
          id: Number(c.id),
          name: c.name,
          slug: c.slug,
          emoji: c.flag ?? undefined,
        })),
    [citiesQuery.data],
  )

  const [userChoice, setUserChoice] = useState<number | null>(() => readStoredCityId())

  const resolvedCityId = useMemo(() => {
    if (userChoice && eligibleCities.some((c) => c.id === userChoice)) {
      return userChoice
    }
    if (eligibleCities.length > 0) {
      return eligibleCities[0].id
    }
    return CRM_DEFAULT_CITY_ID
  }, [userChoice, eligibleCities])

  const isCityFallback = useMemo(
    () => !eligibleCities.some((c) => c.id === resolvedCityId),
    [eligibleCities, resolvedCityId],
  )

  const setSelectedCityId = useCallback((id: number | null) => {
    setUserChoice(id)
    if (typeof window !== "undefined") {
      if (id) {
        window.localStorage.setItem(STORAGE_KEY, String(id))
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const n = e.newValue ? Number(e.newValue) : null
        setUserChoice(n && Number.isFinite(n) && n > 0 ? n : null)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  return {
    selectedCityId: resolvedCityId,
    eligibleCities,
    isLoading: citiesQuery.isLoading,
    isFetching: citiesQuery.isFetching,
    cityLoadError: citiesQuery.error as Error | null,
    isCityFallback,
    setSelectedCityId,
  }
}
