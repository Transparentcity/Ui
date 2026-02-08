"use client"

import React, { useState, useEffect } from "react"
import { X, Loader2, Plus, Minus } from "lucide-react"
import { createFoiaRequest } from "@/app/actions/foia"
import { getCityFoiaProfileAndTargets } from "@/lib/foiaApiClient"
import { API_BASE } from "@/lib/apiBase"
import { useRouter } from "next/navigation"
import type { CityFoiaProfile, CityDatasetTarget } from "@/lib/foia/types"

interface CityOption {
  id: number
  name: string
  state: string
}

const DEFAULT_DATASET_TYPES = [
  "police_incidents",
  "use_of_force",
  "officer_complaints",
  "arrest_records",
  "budget_expenditures",
  "building_permits",
  "traffic_stops",
  "jail_bookings",
  "court_records",
  "911_calls",
]

const FORMAT_OPTIONS = ["CSV", "XLSX", "JSON", "PDF"]

export function NewRequestModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [cities, setCities] = useState<CityOption[]>([])
  const [citySearch, setCitySearch] = useState("")
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const [cityProfile, setCityProfile] = useState<CityFoiaProfile | null>(null)
  const [datasetTargets, setDatasetTargets] = useState<CityDatasetTarget[]>([])
  const [datasetTypes, setDatasetTypes] = useState<string[]>(DEFAULT_DATASET_TYPES)
  const [profileInfo, setProfileInfo] = useState("")
  const [customDatasetTypeId, setCustomDatasetTypeId] = useState("")

  const [form, setForm] = useState({
    city_id: 0,
    city_name: "",
    dataset_type_id: DEFAULT_DATASET_TYPES[0],
    coverage_start: new Date().getFullYear() + "-01-01",
    coverage_end: new Date().getFullYear() + "-12-31",
    format_requested: "CSV",
    requested_fields: [""] as string[],
    assigned_to: "admin",
  })

  // Search cities as user types
  useEffect(() => {
    if (citySearch.length < 2) {
      setCities([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/cities/search?q=${encodeURIComponent(citySearch)}&limit=10`
        )
        if (res.ok) {
          const data = await res.json()
          setCities(Array.isArray(data) ? data : [])
        }
      } catch {
        /* ignore */
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [citySearch])

  async function selectCity(city: CityOption) {
    setForm((f) => ({ ...f, city_id: city.id, city_name: `${city.name}, ${city.state}` }))
    setCitySearch(`${city.name}, ${city.state}`)
    setShowCityDropdown(false)
    setCustomDatasetTypeId("")

    // Load city FOIA profile and auto-populate
    try {
      const { profile, dataset_targets } = await getCityFoiaProfileAndTargets(city.id)
      setCityProfile(profile)
      setDatasetTargets(dataset_targets)

      if (dataset_targets.length > 0) {
        const targeted = dataset_targets
          .filter((t) => t.status === "targeted" || t.status === "potentially_obtainable")
          .map((t) => t.dataset_type_id)
        if (targeted.length > 0) {
          setDatasetTypes([...targeted, "__custom__"])
          setForm((f) => ({ ...f, dataset_type_id: targeted[0] }))
        }
      }

      if (profile) {
        const parts: string[] = []
        if (profile.submission_method) parts.push(`Submit via: ${profile.submission_method}`)
        if (profile.portal_url) parts.push(`Portal: ${profile.portal_url}`)
        if (profile.contact_email) parts.push(`Contact: ${profile.contact_email}`)
        if (profile.statute_name) parts.push(`Law: ${profile.statute_name}`)
        if (profile.default_response_days) parts.push(`Response: ${profile.default_response_days} days`)
        setProfileInfo(parts.join(" · "))
      } else {
        setProfileInfo("")
      }
    } catch {
      // Profile not found - use defaults
      setCityProfile(null)
      setDatasetTargets([])
      setDatasetTypes([...DEFAULT_DATASET_TYPES, "__custom__"])
      setProfileInfo("")
    }
  }

  function addField() {
    setForm((f) => ({ ...f, requested_fields: [...f.requested_fields, ""] }))
  }

  function removeField(idx: number) {
    setForm((f) => ({
      ...f,
      requested_fields: f.requested_fields.filter((_, i) => i !== idx),
    }))
  }

  function updateField(idx: number, val: string) {
    setForm((f) => ({
      ...f,
      requested_fields: f.requested_fields.map((v, i) => (i === idx ? val : v)),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!form.city_id) {
      setError("Please select a city")
      return
    }

    const datasetTypeToSave =
      form.dataset_type_id === "__custom__"
        ? customDatasetTypeId.trim()
        : form.dataset_type_id.trim()
    if (!datasetTypeToSave) {
      setError("Please choose or enter a dataset type")
      return
    }

    setSaving(true)
    try {
      const fields = form.requested_fields.filter((f) => f.trim())
      const result = await createFoiaRequest({
        city_id: form.city_id,
        dataset_type_id: datasetTypeToSave,
        coverage_start: form.coverage_start,
        coverage_end: form.coverage_end,
        format_requested: form.format_requested,
        requested_fields: fields.length > 0 ? fields : undefined,
        assigned_to: form.assigned_to || undefined,
      })
      onClose()
      // Navigate to the new request
      const newId = (result as { id?: number })?.id
      if (newId) {
        router.push(`/foia/requests/${newId}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">New FOIA Request</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4">
            {/* City search */}
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-gray-700">City *</label>
              <input
                type="text"
                value={citySearch}
                onChange={(e) => {
                  setCitySearch(e.target.value)
                  setShowCityDropdown(true)
                  if (!e.target.value) setForm((f) => ({ ...f, city_id: 0, city_name: "" }))
                }}
                onFocus={() => citySearch.length >= 2 && setShowCityDropdown(true)}
                placeholder="Search for a city..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {showCityDropdown && cities.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {cities.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCity(c)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-purple-50"
                    >
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-gray-500">{c.state}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* City profile info */}
            {profileInfo && (
              <div className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
                {profileInfo}
              </div>
            )}

            {/* Dataset type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Dataset Type *</label>
              <select
                value={form.dataset_type_id}
                onChange={(e) => {
                  const v = e.target.value
                  setForm((f) => ({ ...f, dataset_type_id: v }))
                  if (v !== "__custom__") setCustomDatasetTypeId("")
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {datasetTypes.map((dt) => {
                  if (dt === "__custom__") {
                    return (
                      <option key="__custom__" value="__custom__">
                        Other (custom)…
                      </option>
                    )
                  }
                  const target = datasetTargets.find((t) => t.dataset_type_id === dt)
                  const label = dt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                  const suffix = target?.status === "potentially_obtainable" ? " (open data)" : ""
                  return (
                    <option key={dt} value={dt}>
                      {label}{suffix}
                    </option>
                  )
                })}
              </select>

              {form.dataset_type_id === "__custom__" && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Custom dataset type id
                  </label>
                  <input
                    type="text"
                    value={customDatasetTypeId}
                    onChange={(e) => setCustomDatasetTypeId(e.target.value)}
                    placeholder="e.g. sfpd_drone_flight_logs"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Tip: use a stable identifier like <code className="font-mono">sfpd_drone_flight_logs</code>. This is just a label in our system.
                  </p>
                </div>
              )}

              {/* Show dataset notes if available */}
              {form.dataset_type_id !== "__custom__" &&
                datasetTargets.find((t) => t.dataset_type_id === form.dataset_type_id)?.notes && (
                <p className="mt-1 text-xs text-gray-400">
                  {datasetTargets.find((t) => t.dataset_type_id === form.dataset_type_id)?.notes}
                </p>
              )}
            </div>

            {/* Coverage period */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Coverage Start</label>
                <input
                  type="date"
                  value={form.coverage_start}
                  onChange={(e) => setForm((f) => ({ ...f, coverage_start: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Coverage End</label>
                <input
                  type="date"
                  value={form.coverage_end}
                  onChange={(e) => setForm((f) => ({ ...f, coverage_end: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Format</label>
              <select
                value={form.format_requested}
                onChange={(e) => setForm((f) => ({ ...f, format_requested: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {FORMAT_OPTIONS.map((fmt) => (
                  <option key={fmt} value={fmt}>{fmt}</option>
                ))}
              </select>
            </div>

            {/* Requested Fields */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Requested Fields</label>
                <button
                  type="button"
                  onClick={addField}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                >
                  <Plus className="h-3 w-3" /> Add field
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.requested_fields.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field}
                      onChange={(e) => updateField(idx, e.target.value)}
                      placeholder="e.g. incident_number, date, category..."
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    {form.requested_fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned to */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Assigned To</label>
              <input
                type="text"
                value={form.assigned_to}
                onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                placeholder="admin"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as () => void}
            disabled={saving || !form.city_id}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Draft
          </button>
        </div>
      </div>
    </div>
  )
}
