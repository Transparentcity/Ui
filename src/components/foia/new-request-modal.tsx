"use client"

import React, { useState, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { createFoiaRequest } from "@/app/actions/foia"
import {
  getCityFoiaProfileAndTargets,
  getRequesterProfile,
  listCityFoiaDepartments,
  suggestCityFoiaDepartment,
  composeCityFoiaRequestBlock,
} from "@/lib/foiaApiClient"
import { API_BASE } from "@/lib/apiBase"
import { useRouter } from "next/navigation"
import type { CityFoiaProfile, CityDatasetTarget, FoiaCityDepartment, FoiaRequesterProfile } from "@/lib/foia/types"

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
const SF_CITY_ID = 57260
const DEFAULT_AD_HOC_DATASET_TYPE_ID = "ad_hoc_public_records"

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
  const [departments, setDepartments] = useState<FoiaCityDepartment[]>([])
  const [requesterProfile, setRequesterProfile] = useState<FoiaRequesterProfile | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [suggestingDept, setSuggestingDept] = useState(false)
  const [deptSuggestionInfo, setDeptSuggestionInfo] = useState<string>("")
  const [additionalDeptIds, setAdditionalDeptIds] = useState<number[]>([])
  const [coordinationNote, setCoordinationNote] = useState<string>("")
  const [composingBlock, setComposingBlock] = useState(false)
  const [requestBlock, setRequestBlock] = useState<string>("")
  const [requestBlockInfo, setRequestBlockInfo] = useState<string>("")
  const [openRecordsCategory, setOpenRecordsCategory] = useState<string>("")
  const [openRecordsAgency, setOpenRecordsAgency] = useState<string>("")

  const [form, setForm] = useState({
    city_id: 0,
    city_name: "",
    dataset_type_id: "__custom__",
    title: "",
    request_description: "",
    department_id: undefined as number | undefined,
    requester_email_override: "",
    coverage_start: new Date().getFullYear() + "-01-01",
    coverage_end: new Date().getFullYear() + "-12-31",
    format_requested: "CSV",
  })

  // Load org-wide requester profile once when modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const prof = await getRequesterProfile()
        if (!cancelled) setRequesterProfile(prof)
      } catch {
        if (!cancelled) setRequesterProfile(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

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
    setCustomDatasetTypeId(DEFAULT_AD_HOC_DATASET_TYPE_ID)
    setDepartments([])
    setForm((f) => ({ ...f, department_id: undefined }))
    setDeptSuggestionInfo("")
    setAdditionalDeptIds([])
    setCoordinationNote("")
    setRequestBlock("")
    setRequestBlockInfo("")
    setOpenRecordsCategory("")
    setOpenRecordsAgency("")

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

    // Load city departments (portal routing)
    try {
      const depts = await listCityFoiaDepartments(city.id)
      setDepartments(depts)
      if (depts.length > 0) {
        setForm((f) => ({ ...f, department_id: depts[0].id }))
        // For NYC OpenRecords, the "agency" field often matches the selected department.
        if (!openRecordsAgency) {
          setOpenRecordsAgency(depts[0].name)
        }
      }
    } catch {
      setDepartments([])
    }
  }

  const isSf = form.city_id === SF_CITY_ID
  const isOpenRecords = Boolean(cityProfile?.portal_url?.includes("openrecords.nyc.gov"))

  const effectiveRequesterEmail =
    (form.requester_email_override || "").trim() || (requesterProfile?.email || "").trim()
  const requesterName = (requesterProfile?.display_name || "").trim()
  const requesterPhone = (requesterProfile?.phone || "").trim()
  const requesterStreet = (requesterProfile?.street_address || "").trim()
  const requesterCity = (requesterProfile?.city || "").trim()
  const requesterState = (requesterProfile?.state || "").trim()
  const requesterZip = (requesterProfile?.zip || "").trim()

  async function handleComposeBlock() {
    setError("")
    setRequestBlock("")
    setRequestBlockInfo("")

    if (!form.city_id) {
      setError("Please select a city first")
      return
    }
    if (departments.length > 0 && !form.department_id) {
      setError("Please select a primary department first")
      return
    }
    if (!form.request_description.trim()) {
      setError("Please add a request description first")
      return
    }
    if (form.city_id === SF_CITY_ID && !form.title.trim()) {
      setError("Please add a title (SF portal requires it)")
      return
    }
    if (isOpenRecords) {
      if (!openRecordsCategory.trim()) {
        setError("Please select an NYC OpenRecords category")
        return
      }
      if (!openRecordsAgency.trim()) {
        setError("Please enter the NYC OpenRecords agency")
        return
      }
    }

    setComposingBlock(true)
    try {
      const res = await composeCityFoiaRequestBlock(form.city_id, {
        primary_department_id: form.department_id,
        additional_department_ids: additionalDeptIds,
        coordination_note: coordinationNote || undefined,
        title: form.title || undefined,
        request_description: form.request_description || undefined,
        fee_waiver: true,
      })
      setRequestBlock(res.block)
      setRequestBlockInfo(
        `${res.used_ai ? "AI-generated" : "Basic draft"}${res.warning ? ` (${res.warning})` : ""}`
      )
    } catch (err) {
      setRequestBlockInfo(err instanceof Error ? err.message : "Failed to generate request block")
    } finally {
      setComposingBlock(false)
    }
  }

  async function copyText(label: string, text: string) {
    if (!text.trim()) {
      alert(`Nothing to copy for: ${label}`)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      alert(`Failed to copy: ${label}`)
    }
  }

  async function handleSuggestDepartment() {
    setError("")
    setDeptSuggestionInfo("")
    if (!form.city_id) {
      setError("Please select a city first")
      return
    }
    if (!form.request_description.trim() && !form.title.trim()) {
      setError("Add a title or request description first, then click Suggest")
      return
    }

    setSuggestingDept(true)
    try {
      const res = await suggestCityFoiaDepartment(form.city_id, {
        title: form.title || undefined,
        request_description: form.request_description || undefined,
      })
      if (res.department_id) {
        setForm((f) => ({ ...f, department_id: res.department_id ?? undefined }))
      }
      setDeptSuggestionInfo(
        `${res.department_name ? `Suggested: ${res.department_name}. ` : ""}${res.reason}${
          res.warning ? ` (${res.warning})` : ""
        }`
      )
    } catch (err) {
      setDeptSuggestionInfo(err instanceof Error ? err.message : "Failed to suggest department")
    } finally {
      setSuggestingDept(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!form.city_id) {
      setError("Please select a city")
      return
    }

    // SF portal requires title + description + department + contact info.
    if (form.city_id === SF_CITY_ID) {
      if (!form.title.trim()) {
        setError("Please add a title (SF portal requires it)")
        return
      }
      if (!form.request_description.trim()) {
        setError("Please add a request description (SF portal requires it)")
        return
      }
      if (!effectiveRequesterEmail) {
        setError("Please provide a requester email (SF portal requires it)")
        return
      }
      if (!requesterName) {
        setError("Requester name is missing in the org-wide profile (SF portal requires it)")
        return
      }
      // Address fields are required for SF portals when email is not sufficient; enforce minimally here.
      if (!requesterStreet || !requesterCity || !requesterState || !requesterZip) {
        setError("Requester mailing address is incomplete in the org-wide profile (SF portal requires it)")
        return
      }
    }
    if (isOpenRecords) {
      if (!openRecordsCategory.trim()) {
        setError("Please select an NYC OpenRecords category")
        return
      }
      if (!openRecordsAgency.trim()) {
        setError("Please enter the NYC OpenRecords agency")
        return
      }
      if (!form.title.trim()) {
        setError("Please add a title (NYC OpenRecords requires it)")
        return
      }
      if (!form.request_description.trim()) {
        setError("Please add a request description (NYC OpenRecords requires it)")
        return
      }
      if (!requesterName) {
        setError("Requester name is missing in the org-wide profile (NYC OpenRecords requires it)")
        return
      }
      if (!effectiveRequesterEmail && !requesterPhone && !requesterStreet) {
        setError("NYC OpenRecords requires email or alternate contact info (phone or address)")
        return
      }
    }

    const datasetTypeToSave =
      form.dataset_type_id === "__custom__"
        ? customDatasetTypeId.trim()
        : form.dataset_type_id.trim()
    const datasetTypeFinal = datasetTypeToSave || DEFAULT_AD_HOC_DATASET_TYPE_ID

    if (departments.length > 0 && !form.department_id) {
      setError("Please select a department")
      return
    }

    setSaving(true)
    try {
      const portalFields: Record<string, unknown> = {}
      if (additionalDeptIds.length > 0) portalFields.additional_department_ids = additionalDeptIds
      if (coordinationNote.trim()) portalFields.coordination_note = coordinationNote.trim()
      if (requestBlock.trim()) portalFields.request_block_draft = requestBlock.trim()
      if (isOpenRecords) {
        portalFields.openrecords_category = openRecordsCategory.trim()
        portalFields.openrecords_agency = openRecordsAgency.trim()
      }

      const result = await createFoiaRequest({
        city_id: form.city_id,
        dataset_type_id: datasetTypeFinal,
        title: form.title || undefined,
        request_description: form.request_description || undefined,
        department_id: form.department_id,
        requester_email_override: form.requester_email_override || undefined,
        portal_fields: Object.keys(portalFields).length > 0 ? portalFields : undefined,
        coverage_start: form.coverage_start,
        coverage_end: form.coverage_end,
        format_requested: form.format_requested,
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

            {/* Department (required if configured for city) */}
            {departments.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-gray-700">Department *</label>
                  <button
                    type="button"
                    onClick={handleSuggestDepartment}
                    disabled={suggestingDept || !form.city_id}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {suggestingDept ? "Suggesting..." : "Suggest"}
                  </button>
                </div>
                <select
                  value={form.department_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, department_id: e.target.value ? Number(e.target.value) : undefined }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {deptSuggestionInfo && (
                  <p className="mt-1 text-xs text-gray-500">
                    {deptSuggestionInfo}
                  </p>
                )}
                {departments.find((d) => d.id === form.department_id)?.notes && (
                  <p className="mt-1 text-xs text-gray-400">
                    {departments.find((d) => d.id === form.department_id)?.notes}
                  </p>
                )}

                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-700">Coordinate with additional departments (optional)</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    This does not submit multiple portal requests; it just improves the drafted letter.
                  </p>
                  <div className="mt-2 max-h-28 overflow-auto">
                    <div className="grid grid-cols-1 gap-1">
                      {departments
                        .filter((d) => d.id !== form.department_id)
                        .map((d) => {
                          const checked = additionalDeptIds.includes(d.id)
                          return (
                            <label key={d.id} className="flex cursor-pointer items-center gap-2 text-[12px] text-gray-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...additionalDeptIds, d.id]
                                    : additionalDeptIds.filter((x) => x !== d.id)
                                  setAdditionalDeptIds(next)
                                  setRequestBlock("")
                                  setRequestBlockInfo("")
                                }}
                              />
                              <span>{d.name}</span>
                            </label>
                          )
                        })}
                    </div>
                  </div>
                </div>

                <div className="mt-2">
                  <label className="mb-1 block text-[11px] font-medium text-gray-700">
                    Coordination note (optional)
                  </label>
                  <input
                    type="text"
                    value={coordinationNote}
                    onChange={(e) => {
                      setCoordinationNote(e.target.value)
                      setRequestBlock("")
                      setRequestBlockInfo("")
                    }}
                    placeholder='e.g. "all departments that sponsored or implemented OpenGov products or services"'
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Request core fields (MuckRock/portal aligned) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Title{isSf || isOpenRecords ? " *" : ""}
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder='e.g. "Drone Flights From Jan 1, 2025 – Jan 1, 2026"'
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Request Description{isSf || isOpenRecords ? " *" : ""}
              </label>
              <textarea
                value={form.request_description}
                onChange={(e) => setForm((f) => ({ ...f, request_description: e.target.value }))}
                rows={4}
                placeholder='e.g. "Looking for a list of all flights by day, time, location (lat/long) and purpose, plus who dispatched it."'
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Tip: avoid private info—many portals publish request descriptions publicly.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-900">Copy/Paste Request Block</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Generates one big block of text (includes fee waiver language).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleComposeBlock}
                    disabled={composingBlock || !form.city_id}
                    className="rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {composingBlock ? "Generating..." : "Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText("request block", requestBlock)}
                    disabled={!requestBlock}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
              {requestBlockInfo && <p className="mt-2 text-[11px] text-gray-500">{requestBlockInfo}</p>}
              <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800">
                {requestBlock || "Click Generate after you add your description."}
              </pre>
            </div>

            {/* Requester profile + override */}
            {requesterProfile && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs font-medium text-gray-700">Requester (org default)</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {requesterProfile.display_name}
                  {requesterProfile.organization ? `, ${requesterProfile.organization}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {requesterProfile.street_address ? `${requesterProfile.street_address}, ` : ""}
                  {requesterProfile.city ? `${requesterProfile.city}, ` : ""}
                  {requesterProfile.state ? `${requesterProfile.state} ` : ""}
                  {requesterProfile.zip ?? ""}
                </p>
                {requesterProfile.phone && <p className="mt-0.5 text-xs text-gray-500">{requesterProfile.phone}</p>}
                {requesterProfile.email && <p className="mt-0.5 text-xs text-gray-500">{requesterProfile.email}</p>}
              </div>
            )}

            {(isSf || isOpenRecords) && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-900">Portal checklist</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {isSf
                    ? "San Francisco portal fields we expect to fill (based on NextRequest)."
                    : "NYC OpenRecords requires Category + Agency + Title + Description + requester info."}
                </p>
                <div className="mt-3 grid gap-2 text-xs">
                  <ChecklistRow label="Department selected" ok={Boolean(form.department_id)} />
                  <ChecklistRow label="Title" ok={Boolean(form.title.trim())} />
                  <ChecklistRow label="Request description" ok={Boolean(form.request_description.trim())} />
                  <ChecklistRow label="Requester name (org profile)" ok={Boolean(requesterName)} />
                  <ChecklistRow label="Requester email" ok={Boolean(effectiveRequesterEmail)} />
                  {isSf && (
                    <>
                      <ChecklistRow label="Requester street address" ok={Boolean(requesterStreet)} />
                      <ChecklistRow label="Requester city" ok={Boolean(requesterCity)} />
                      <ChecklistRow label="Requester state" ok={Boolean(requesterState)} />
                      <ChecklistRow label="Requester zip" ok={Boolean(requesterZip)} />
                      <ChecklistRow label="Requester phone (often required)" ok={Boolean(requesterPhone)} />
                    </>
                  )}
                  {isOpenRecords && (
                    <>
                      <ChecklistRow label="OpenRecords category" ok={Boolean(openRecordsCategory.trim())} />
                      <ChecklistRow label="OpenRecords agency" ok={Boolean(openRecordsAgency.trim())} />
                      <ChecklistRow
                        label="Alternate contact info (if no email)"
                        ok={Boolean(effectiveRequesterEmail || requesterPhone || requesterStreet)}
                      />
                    </>
                  )}
                </div>
                {isSf && requesterProfile && (
                  <p className="mt-3 text-[11px] text-gray-500">
                    If any requester fields are missing, update the org-wide requester profile in the FOIA admin settings.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Requester Email Override (optional)
              </label>
              <input
                type="email"
                value={form.requester_email_override}
                onChange={(e) => setForm((f) => ({ ...f, requester_email_override: e.target.value }))}
                placeholder="Needed for many portals (e.g. NextRequest)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {isOpenRecords && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-900">NYC OpenRecords fields</p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Category *</label>
                    <select
                      value={openRecordsCategory}
                      onChange={(e) => {
                        setOpenRecordsCategory(e.target.value)
                        setRequestBlock("")
                        setRequestBlockInfo("")
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="">Select category…</option>
                      {[
                        "Business",
                        "Civic Services",
                        "Culture & Recreation",
                        "Education",
                        "Environment",
                        "Equity",
                        "Health",
                        "Housing & Development",
                        "Public Safety",
                        "Social Services",
                        "Transportation",
                      ].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Agency *</label>
                    <input
                      type="text"
                      value={openRecordsAgency}
                      onChange={(e) => {
                        setOpenRecordsAgency(e.target.value)
                        setRequestBlock("")
                        setRequestBlockInfo("")
                      }}
                      placeholder="e.g. New York City Police Department"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      OpenRecords requires selecting both Category and Agency in the portal UI.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs font-medium text-gray-700 hover:text-gray-900"
              >
                {showAdvanced ? "Hide advanced fields" : "Show advanced fields (optional)"}
              </button>
              {showAdvanced && (
                <div className="mt-3 flex flex-col gap-4">
                  {/* Dataset type (optional tagging for internal tracking) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Dataset Type (optional)</label>
                    <select
                      value={form.dataset_type_id}
                      onChange={(e) => {
                        const v = e.target.value
                        setForm((f) => ({ ...f, dataset_type_id: v }))
                        if (v !== "__custom__") setCustomDatasetTypeId("")
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                      </div>
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
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">Coverage End</label>
                      <input
                        type="date"
                        value={form.coverage_end}
                        onChange={(e) => setForm((f) => ({ ...f, coverage_end: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Format */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Format</label>
                    <select
                      value={form.format_requested}
                      onChange={(e) => setForm((f) => ({ ...f, format_requested: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {FORMAT_OPTIONS.map((fmt) => (
                        <option key={fmt} value={fmt}>{fmt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.city_id}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Draft
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChecklistRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {ok ? "OK" : "Missing"}
      </span>
    </div>
  )
}
