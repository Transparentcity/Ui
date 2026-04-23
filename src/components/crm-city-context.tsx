"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  listPublicCitiesForSitemap,
  type PublicCitySitemapItem,
} from "@/lib/publicApiClient"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"

export interface CrmCity {
  id: number
  name: string
  state?: string | null
  emoji?: string | null
  slug?: string
}

interface CrmCityContextValue {
  selectedCity: CrmCity | null
  cities: CrmCity[]
  recentCities: CrmCity[]
  isLoading: boolean
  error: string | null
  setSelectedCityId: (cityId: number) => void
  isPickerOpen: boolean
  setPickerOpen: (open: boolean) => void
}

const CrmCityContext = createContext<CrmCityContextValue | undefined>(undefined)

const STORAGE_KEY = "transparentcity_crm_selected_city_id"
const RECENTS_KEY = "transparentcity_crm_recent_city_ids"
const MAX_RECENTS = 3

function readStoredCityId(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

function writeStoredCityId(id: number) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // quota etc. ignore
  }
}

function readStoredRecents(): number[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => Number(x))
      .filter((x): x is number => Number.isFinite(x) && x > 0)
  } catch {
    return []
  }
}

function writeStoredRecents(ids: number[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(ids.slice(0, MAX_RECENTS)))
  } catch {
    // ignore
  }
}

function toCrmCity(item: PublicCitySitemapItem): CrmCity {
  return {
    id: item.id,
    name: item.name,
    state: item.state ?? null,
    emoji: item.emoji ?? null,
    slug: item.slug,
  }
}

export function CrmCityProvider({ children }: { children: React.ReactNode }) {
  const [cities, setCities] = useState<CrmCity[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [recentIds, setRecentIds] = useState<number[]>(() => readStoredRecents())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoading(true)
        const all = await listPublicCitiesForSitemap()
        if (cancelled) return
        const launched = all
          .filter((c) => c.is_launched === true)
          .map(toCrmCity)
          .sort((a, b) => a.name.localeCompare(b.name))
        setCities(launched)

        const stored = readStoredCityId()
        const storedMatches = stored && launched.some((c) => c.id === stored)
        const defaultMatches = launched.some((c) => c.id === CRM_DEFAULT_CITY_ID)
        const fallback =
          (storedMatches && stored) ||
          (defaultMatches && CRM_DEFAULT_CITY_ID) ||
          (launched[0]?.id ?? null)
        setSelectedId(fallback)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load cities")
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const setSelectedCityId = useCallback((cityId: number) => {
    setSelectedId(cityId)
    writeStoredCityId(cityId)
    setRecentIds((prev) => {
      const next = [cityId, ...prev.filter((id) => id !== cityId)].slice(0, MAX_RECENTS)
      writeStoredRecents(next)
      return next
    })
  }, [])

  const selectedCity = useMemo(() => {
    if (selectedId == null) return null
    return cities.find((c) => c.id === selectedId) ?? null
  }, [cities, selectedId])

  const recentCities = useMemo(() => {
    return recentIds
      .map((id) => cities.find((c) => c.id === id))
      .filter((c): c is CrmCity => Boolean(c))
  }, [cities, recentIds])

  const value = useMemo<CrmCityContextValue>(
    () => ({
      selectedCity,
      cities,
      recentCities,
      isLoading,
      error,
      setSelectedCityId,
      isPickerOpen,
      setPickerOpen,
    }),
    [selectedCity, cities, recentCities, isLoading, error, setSelectedCityId, isPickerOpen]
  )

  return <CrmCityContext.Provider value={value}>{children}</CrmCityContext.Provider>
}

export function useCrmCity(): CrmCityContextValue {
  const ctx = useContext(CrmCityContext)
  if (!ctx) {
    throw new Error("useCrmCity must be used inside a CrmCityProvider")
  }
  return ctx
}

/** Read selected city without throwing when outside the provider (for safe legacy components). */
export function useCrmCitySafe(): CrmCityContextValue | null {
  return useContext(CrmCityContext) ?? null
}
