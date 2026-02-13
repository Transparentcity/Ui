"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Building2, ArrowRight } from "lucide-react"
import {
  listPublicCitiesForSitemap,
  searchPublicCities,
  type PublicCitySitemapItem,
  type PublicCitySearchResult,
} from "@/lib/publicApiClient"

const MAX_CITY_PROFILES = 20
const PINNED_CITIES = [
  { name: "Pasadena", state: "CA" },
  { name: "Portsmouth", state: "NH" },
  { name: "Bloomington", state: "IL" },
  { name: "Oakland", state: "CA" },
]
const PINNED_CITY_KEYS = new Set(PINNED_CITIES.map((city) => `${city.name.toLowerCase()}|${city.state.toLowerCase()}`))

interface CityListItem {
  id: number
  name: string
  state: string
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  california: "ca",
  "new hampshire": "nh",
  illinois: "il",
}

function toCityListItem(city: PublicCitySitemapItem): CityListItem {
  return {
    id: city.id,
    name: city.name,
    state: city.state ?? "",
  }
}

function toCityListItemFromSearch(city: PublicCitySearchResult): CityListItem {
  return {
    id: city.id,
    name: city.name,
    state: city.state ?? "",
  }
}

function normalizeStateForKey(state: string): string {
  const normalized = state.toLowerCase().trim()
  if (normalized.length === 2) return normalized
  return STATE_ABBREVIATIONS[normalized] ?? normalized
}

function cityKey(city: CityListItem): string {
  return `${city.name.toLowerCase().trim()}|${normalizeStateForKey(city.state)}`
}

async function resolvePinnedCities(): Promise<CityListItem[]> {
  const resolved = await Promise.all(
    PINNED_CITIES.map(async (target) => {
      try {
        const results = await searchPublicCities(`${target.name} ${target.state}`, 20)
        const match = results.find(
          (city) =>
            city.name.toLowerCase() === target.name.toLowerCase() &&
            (city.state ?? "").toLowerCase() === target.state.toLowerCase()
        )
        return match ? toCityListItemFromSearch(match) : null
      } catch {
        return null
      }
    })
  )
  return resolved.filter((city): city is CityListItem => city !== null)
}

export function CitiesContent() {
  const [cities, setCities] = useState<CityListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [rows, pinnedResolved] = await Promise.all([
          listPublicCitiesForSitemap(),
          resolvePinnedCities(),
        ])
        const mapped = rows
          .map(toCityListItem)
          .sort((a, b) => a.name.localeCompare(b.name))

        const byKey = new Map<string, CityListItem>()
        for (const city of [...mapped, ...pinnedResolved]) {
          byKey.set(cityKey(city), city)
        }

        const merged = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name))
        const pinned = merged.filter((city) => PINNED_CITY_KEYS.has(cityKey(city)))
        const unpinned = merged.filter((city) => !PINNED_CITY_KEYS.has(cityKey(city)))

        const selected = [...pinned, ...unpinned]
          .slice(0, MAX_CITY_PROFILES)
          .sort((a, b) => a.name.localeCompare(b.name))
        setCities(selected)
      } catch (err) {
        console.error("Failed to load city profiles:", err)
        setError("Failed to load city profiles")
        setCities([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">City Profiles</h1>
        <p className="mt-1 text-sm text-gray-500">
          FOIA submission methods, contacts, and responsiveness stats for 20 cities
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map((city) => (
          <Link
            key={city.id}
            href={`/foia/cities/${city.id}`}
            className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-purple-50">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{city.name}</p>
              <p className="text-xs text-gray-500">{city.state}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
        {cities.length === 0 && (
          <div className="col-span-full rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
            No city profiles available.
          </div>
        )}
      </div>
    </div>
  )
}
