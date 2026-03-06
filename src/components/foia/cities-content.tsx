"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Building2, ArrowRight, Plus, X, AlertTriangle } from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { listAdminFoiaCities, type AdminFoiaCityListItem } from "@/lib/foiaApiClient"

export function CitiesContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [cities, setCities] = useState<AdminFoiaCityListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token (backend may allow DEV_MODE)
      }
    }
    try {
      const rows = await listAdminFoiaCities(token)
      // Show cities that have datasets OR a FOIA profile (submission_method set).
      const curated = rows.filter(
        (c) => (c.total_datasets ?? 0) > 0 || c.submission_method
      )
      setCities(curated.length > 0 ? curated : rows.slice(0, 25))
    } catch (err) {
      console.error("Failed to load city profiles:", err)
      setError(err instanceof Error ? err.message : "Failed to load city profiles")
      setCities([])
    } finally {
      setLoading(false)
    }
  }, [getAccessTokenSilently, isAuthenticated])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cities
    return cities.filter((c) => `${c.name} ${c.state ?? ""}`.toLowerCase().includes(q))
  }, [cities, query])


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
          Cities with FOIA profiles or active datasets
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cities…"
          className="h-10 w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <div className="text-xs text-gray-500">
          {filtered.length.toLocaleString()} cities shown
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((city) => (
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
              <p className="text-xs text-gray-500">
                {city.state ?? ""}{city.total_datasets ? ` · ${city.total_datasets} datasets` : city.submission_method ? ` · ${city.submission_method}` : ""}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
            No city profiles available.
          </div>
        )}
      </div>
    </div>
  )
}
