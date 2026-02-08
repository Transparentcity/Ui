"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Building2, ArrowRight, Search } from "lucide-react"
import { API_BASE } from "@/lib/apiBase"

interface CityListItem {
  id: number
  name: string
  state: string
  population?: number
}

export function CitiesContent() {
  const [cities, setCities] = useState<CityListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    async function load() {
      try {
        // Avoid calling /api/cities/search with an empty query (backend returns 422).
        // This page is intended for searching; load results only after a query.
        setCities([])
      } catch (err) {
        console.error("Failed to load cities:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function search() {
      const q = searchQuery.trim()
      if (q.length < 2) {
        setCities([])
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/cities/search?q=${encodeURIComponent(q)}&limit=100`, {
          headers: { "Content-Type": "application/json" },
        })
        if (res.ok) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : data.cities ?? data.items ?? []
          setCities(list)
        } else {
          setCities([])
        }
      } catch (err) {
        console.error("Failed to search cities:", err)
        setCities([])
      } finally {
        setLoading(false)
      }
    }
    search()
  }, [searchQuery])

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
          FOIA submission methods, contacts, and responsiveness stats per city
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search cities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cities
          .filter((c) =>
            searchQuery
              ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.state.toLowerCase().includes(searchQuery.toLowerCase())
              : true
          )
          .map((city) => (
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
            {searchQuery.trim().length < 2
              ? "Type at least 2 characters to search cities."
              : "No matching cities found."}
          </div>
        )}
      </div>
    </div>
  )
}
