"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth0 } from "@auth0/auth0-react"
import { Loader2, Building2, ArrowRight } from "lucide-react"
import { listCities, type CityListItem as AdminCityListItem } from "@/lib/apiClient"

const COUNTRY_FILTER = "United States"
const MAX_CITY_PROFILES = 20

interface CityListItem {
  id: number
  name: string
  state: string
  population?: number
}

function parsePopulation(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return value
  if (typeof value !== "string") return undefined
  const parsed = Number(value.replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

function toCityListItem(city: AdminCityListItem): CityListItem {
  return {
    id: city.city_id,
    name: city.city_name,
    state: city.state ?? "",
    population: parsePopulation(city.population),
  }
}

export function CitiesContent() {
  const { getAccessTokenSilently } = useAuth0()
  const [cities, setCities] = useState<CityListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessTokenSilently()
        const rows = await listCities(token, undefined, COUNTRY_FILTER, true)
        const mapped = rows
          .map(toCityListItem)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, MAX_CITY_PROFILES)
        setCities(mapped)
      } catch (err) {
        console.error("Failed to load city profiles:", err)
        setError("Failed to load city profiles")
        setCities([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getAccessTokenSilently])

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
              {city.population && (
                <p className="text-xs text-gray-400">Pop. {city.population.toLocaleString()}</p>
              )}
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
