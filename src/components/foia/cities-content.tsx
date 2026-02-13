"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Building2, ArrowRight, Plus, X, AlertTriangle } from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { createAdminFoiaCity, listAdminFoiaCities, type AdminFoiaCityListItem } from "@/lib/foiaApiClient"

export function CitiesContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [cities, setCities] = useState<AdminFoiaCityListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewCity, setShowNewCity] = useState(false)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")

  const [newCity, setNewCity] = useState({
    name: "",
    state: "",
    country: "United States",
    population: "",
    emoji: "",
    main_domain: "",
    main_portal_url: "",
    is_active: true,
  })

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
      // Show curated FOIA cities only (not the full master city table).
      const curated = rows.filter((c) => (c.total_datasets ?? 0) > 0)
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

  async function handleCreateCity() {
    if (!newCity.name.trim() || !newCity.main_domain.trim() || !newCity.main_portal_url.trim()) {
      alert("Name, main domain, and main portal URL are required.")
      return
    }
    setCreating(true)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    try {
      const created = await createAdminFoiaCity(
        {
          name: newCity.name.trim(),
          state: newCity.state.trim() || undefined,
          country: newCity.country.trim() || undefined,
          population: newCity.population.trim() ? parseInt(newCity.population, 10) : undefined,
          emoji: newCity.emoji.trim() || undefined,
          main_domain: newCity.main_domain.trim(),
          main_portal_url: newCity.main_portal_url.trim(),
          is_active: newCity.is_active,
        },
        token
      )
      setShowNewCity(false)
      setNewCity({
        name: "",
        state: "",
        country: "United States",
        population: "",
        emoji: "",
        main_domain: "",
        main_portal_url: "",
        is_active: true,
      })
      // Navigate straight to the new city profile page.
      window.location.href = `/foia/cities/${created.id}`
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create city")
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {showNewCity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => !creating && setShowNewCity(false)} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Add a new city</h2>
              <button
                onClick={() => setShowNewCity(false)}
                disabled={creating}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">City name *</label>
                  <input
                    value={newCity.name}
                    onChange={(e) => setNewCity((c) => ({ ...c, name: e.target.value }))}
                    placeholder="e.g. Pasadena"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">State</label>
                  <input
                    value={newCity.state}
                    onChange={(e) => setNewCity((c) => ({ ...c, state: e.target.value }))}
                    placeholder="e.g. CA"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Country</label>
                  <input
                    value={newCity.country}
                    onChange={(e) => setNewCity((c) => ({ ...c, country: e.target.value }))}
                    placeholder="United States"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Population</label>
                  <input
                    value={newCity.population}
                    onChange={(e) => setNewCity((c) => ({ ...c, population: e.target.value }))}
                    placeholder="optional"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Emoji</label>
                  <input
                    value={newCity.emoji}
                    onChange={(e) => setNewCity((c) => ({ ...c, emoji: e.target.value }))}
                    placeholder="optional"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">Main domain *</label>
                  <input
                    value={newCity.main_domain}
                    onChange={(e) => setNewCity((c) => ({ ...c, main_domain: e.target.value }))}
                    placeholder="e.g. data.city.gov (or 'no-portal')"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">Main portal URL *</label>
                  <input
                    value={newCity.main_portal_url}
                    onChange={(e) => setNewCity((c) => ({ ...c, main_portal_url: e.target.value }))}
                    placeholder="e.g. https://data.city.gov or https://city.gov/public-records"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={newCity.is_active}
                    onChange={(e) => setNewCity((c) => ({ ...c, is_active: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Active
                  </label>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <p>
                    This creates a new city record and a blank FOIA profile. You can fill in the FOIA
                    submission details on the next screen.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowNewCity(false)}
                disabled={creating}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCity}
                disabled={creating}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create city
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">City Profiles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Curated FOIA city set (not full city master list)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewCity(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          New City
        </button>
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
                {city.state ?? ""}{city.total_datasets ? ` · ${city.total_datasets} datasets` : ""}
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
