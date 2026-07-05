"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"

const STORAGE_KEY = "waste:selectedCityId"

// The waste module is limited to a small pilot set of cities.
const WASTE_ENABLED_CITY_SLUGS = new Set(["san-francisco", "chicago"])

function readStoredCityId(): number | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function useWasteSelectedCity() {
  const citiesQuery = useQuery({
    queryKey: ["public", "cities", "sitemap"],
    queryFn: listPublicCitiesForSitemap,
    staleTime: 5 * 60 * 1000,
  })

  const eligibleCities = useMemo(
    () =>
      (citiesQuery.data ?? []).filter(
        (c) =>
          WASTE_ENABLED_CITY_SLUGS.has(c.slug ?? "") &&
          (c.datasets_count ?? 0) > 0 &&
          c.is_launched === true,
      ),
    [citiesQuery.data],
  )

  const [userChoice, setUserChoice] = useState<number | null>(() => readStoredCityId())

  const resolvedCityId = useMemo(() => {
    if (userChoice && eligibleCities.some((c) => Number(c.id) === userChoice)) {
      return userChoice
    }
    if (eligibleCities.length > 0) {
      return Number(eligibleCities[0].id)
    }
    return CRM_DEFAULT_CITY_ID
  }, [userChoice, eligibleCities])

  const isCityFallback = useMemo(
    () => !eligibleCities.some((c) => Number(c.id) === resolvedCityId),
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
