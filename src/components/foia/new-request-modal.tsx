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
  const [createdRequestId, setCreatedRequestId] = useState<number | null>(null)
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
  const [generatedDeptName, setGeneratedDeptName] = useState<string>("")
  const [composingBlock, setComposingBlock] = useState(false)
  const [requestBlock, setRequestBlock] = useState<string>("")
  const [requestBlockInfo, setRequestBlockInfo] = useState<string>("")
  const [showSteps, setShowSteps] = useState(false)
  const [openRecordsCategory, setOpenRecordsCategory] = useState<string>("")
  const [openRecordsAgency, setOpenRecordsAgency] = useState<string>("")

  const [form, setForm] = useState({
    city_id: 0,
    city_name: "",
    dataset_type_id: "__custom__",
    request_description: "",
    department_id: undefined as number | undefined,
    requester_email_override: "",
    format_requested: "CSV",
    submission_url: "",
    submission_email_address: "",
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
    setGeneratedDeptName("")
    setRequestBlock("")
    setRequestBlockInfo("")
    setShowSteps(false)
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
      // Do not auto-select a department; defaulting to the first item can be wrong.
    } catch {
      setDepartments([])
    }
  }

  const isSf = form.city_id === SF_CITY_ID
  const isOpenRecords = Boolean(cityProfile?.portal_url?.includes("openrecords.nyc.gov"))
  const isNextRequest = Boolean(cityProfile?.portal_url?.includes("nextrequest.com"))
  const isJustFoia = Boolean(cityProfile?.portal_url?.includes("justfoia.com") || cityProfile?.portal_url?.includes("request.justfoia"))

  const effectiveRequesterEmail =
    (form.requester_email_override || "").trim() || (requesterProfile?.email || "").trim()
  const requesterName = (requesterProfile?.display_name || "").trim()
  const requesterPhone = (requesterProfile?.phone || "").trim()
  const requesterStreet = (requesterProfile?.street_address || "").trim()
  const requesterCity = (requesterProfile?.city || "").trim()
  const requesterState = (requesterProfile?.state || "").trim()
  const requesterZip = (requesterProfile?.zip || "").trim()
  const generatedTitle = generateTitleFromDescription(form.request_description)

  async function handleComposeBlock() {
    setError("")
    setRequestBlock("")
    setRequestBlockInfo("")

    if (!form.city_id) {
      setError("Please select a city first")
      return
    }
    if (!form.request_description.trim()) {
      setError("Please add a request description first")
      return
    }
    let primaryDeptId = form.department_id
    if (departments.length > 0 && !primaryDeptId) {
      // Best-effort: auto-suggest a department instead of defaulting.
      try {
        const res = await suggestCityFoiaDepartment(form.city_id, {
          title: generatedTitle || undefined,
          request_description: form.request_description || undefined,
        })
        if (res.department_id) {
          primaryDeptId = res.department_id
          if (res.department_name) setGeneratedDeptName(res.department_name)
          setForm((f) => ({ ...f, department_id: res.department_id ?? undefined }))
        }
      } catch {
        /* ignore; fall through to error */
      }
      if (!primaryDeptId) {
        setError("Please select a primary department (or click Suggest)")
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
      if (!generatedTitle.trim()) {
        setError("Please add a request description (we auto-generate the NYC title from it)")
        return
      }
    }

    setComposingBlock(true)
    try {
      const res = await composeCityFoiaRequestBlock(form.city_id, {
        primary_department_id: primaryDeptId,
        additional_department_ids: additionalDeptIds,
        title: generatedTitle || undefined,
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

  async function handleGenerateAndOpenSteps() {
    // Open immediately so the user always sees the step-by-step screen.
    setShowSteps(true)
    await handleComposeBlock()
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
    if (!form.request_description.trim()) {
      setError("Add a request description first, then click Suggest")
      return
    }

    setSuggestingDept(true)
    try {
      const res = await suggestCityFoiaDepartment(form.city_id, {
        title: generatedTitle || undefined,
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

  async function createDraft(): Promise<number | null> {
    setError("")

    if (!form.city_id) {
      setError("Please select a city")
      return null
    }

    // SF NextRequest portal requires description + department + contact info.
    if (form.city_id === SF_CITY_ID) {
      if (!form.request_description.trim()) {
        setError("Please add a request description (SF portal requires it)")
        return null
      }
      if (!effectiveRequesterEmail) {
        setError("Please provide a requester email (SF portal requires it)")
        return null
      }
      if (!requesterName) {
        setError("Requester name is missing in the org-wide profile (SF portal requires it)")
        return null
      }
      if (!requesterStreet || !requesterCity || !requesterState || !requesterZip) {
        setError("Requester mailing address is incomplete in the org-wide profile (SF portal requires it)")
        return null
      }
    }

    if (isOpenRecords) {
      if (!openRecordsCategory.trim()) {
        setError("Please select an NYC OpenRecords category")
        return null
      }
      if (!openRecordsAgency.trim()) {
        setError("Please enter the NYC OpenRecords agency")
        return null
      }
      if (!generatedTitle.trim()) {
        setError("Please add a request description (we auto-generate the NYC title from it)")
        return null
      }
      if (!form.request_description.trim()) {
        setError("Please add a request description (NYC OpenRecords requires it)")
        return null
      }
      if (!requesterName) {
        setError("Requester name is missing in the org-wide profile (NYC OpenRecords requires it)")
        return null
      }
      if (!effectiveRequesterEmail && !requesterPhone && !requesterStreet) {
        setError("NYC OpenRecords requires email or alternate contact info (phone or address)")
        return null
      }
    }

    const datasetTypeToSave =
      form.dataset_type_id === "__custom__"
        ? customDatasetTypeId.trim()
        : form.dataset_type_id.trim()
    const datasetTypeFinal = datasetTypeToSave || DEFAULT_AD_HOC_DATASET_TYPE_ID

    let primaryDeptId = form.department_id
    if (departments.length > 0 && !primaryDeptId) {
      // Default to suggestion unless the user picked one in Advanced.
      try {
        const res = await suggestCityFoiaDepartment(form.city_id, {
          title: generatedTitle || undefined,
          request_description: form.request_description || undefined,
        })
        if (res.department_id) {
          primaryDeptId = res.department_id
          if (res.department_name) setGeneratedDeptName(res.department_name)
          setForm((f) => ({ ...f, department_id: res.department_id ?? undefined }))
        }
      } catch {
        /* ignore */
      }
      if (!primaryDeptId) {
        setError("Please open Advanced and select a department (suggestion unavailable)")
        return null
      }
    }

    setSaving(true)
    try {
      const portalFields: Record<string, unknown> = {}
      if (additionalDeptIds.length > 0) portalFields.additional_department_ids = additionalDeptIds
      if (requestBlock.trim()) portalFields.request_block_draft = requestBlock.trim()
      if (isOpenRecords) {
        portalFields.openrecords_category = openRecordsCategory.trim()
        portalFields.openrecords_agency = openRecordsAgency.trim()
      }

      const result = await createFoiaRequest({
        city_id: form.city_id,
        dataset_type_id: datasetTypeFinal,
        title: generatedTitle || undefined,
        request_description: form.request_description || undefined,
        department_id: primaryDeptId,
        requester_email_override: form.requester_email_override || undefined,
        portal_fields: Object.keys(portalFields).length > 0 ? portalFields : undefined,
        format_requested: form.format_requested,
        submission_url: form.submission_url.trim() || undefined,
        submission_email_address: form.submission_email_address.trim() || undefined,
      })

      const newId = (result as { id?: number })?.id
      if (typeof newId === "number") {
        setCreatedRequestId(newId)
        return newId
      }
      return null
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request")
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmittedFromSteps() {
    const id = createdRequestId ?? (await createDraft())
    if (!id) return
    setShowSteps(false)
    onClose()
    router.push(`/foia/requests/${id}?external=1`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newId = await createDraft()
    if (!newId) return
    onClose()
    router.push(`/foia/requests/${newId}`)
  }

  if (!open) return null

  const selectedDepartment = departments.find((d) => d.id === form.department_id) ?? null
  const portalUrl = (cityProfile?.portal_url || "").trim()
  const portalRequestText = extractPortalRequestText(requestBlock)

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

        <SubmissionStepsModal
          open={showSteps}
          onClose={() => setShowSteps(false)}
          cityName={form.city_name || citySearch}
          portalUrl={portalUrl}
          isNextRequest={isNextRequest}
          isOpenRecords={isOpenRecords}
          isJustFoia={isJustFoia}
          departmentName={selectedDepartment?.name || generatedDeptName || ""}
          openRecordsCategory={openRecordsCategory}
          openRecordsAgency={openRecordsAgency}
          title={generatedTitle}
          portalRequestText={portalRequestText}
          fullRequestBlock={requestBlock}
          requester={{
            name: requesterName,
            email: effectiveRequesterEmail,
            phone: requesterPhone,
            street: requesterStreet,
            city: requesterCity,
            state: requesterState,
            zip: requesterZip,
            organization: (requesterProfile?.organization || "").trim(),
          }}
          onCopy={copyText}
          onSubmitted={handleSubmittedFromSteps}
          submitting={saving}
        />

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

            {/* Request core fields (MuckRock/portal aligned) */}
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

            {/* Submission channel - where was the request submitted */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-900">Where was this submitted?</p>
              <p className="mt-0.5 text-xs text-gray-500">Track the website or email address used for submission.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Portal / Website URL</label>
                  <input
                    type="url"
                    value={form.submission_url}
                    onChange={(e) => setForm((f) => ({ ...f, submission_url: e.target.value }))}
                    placeholder="https://nextrequest.com/... or https://cityname.justfoia.com/..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Submission Email Address</label>
                  <input
                    type="email"
                    value={form.submission_email_address}
                    onChange={(e) => setForm((f) => ({ ...f, submission_email_address: e.target.value }))}
                    placeholder="records@sfgov.org"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-900">Portal submission steps</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Generates a request letter and shows exact portal steps for this city.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateAndOpenSteps}
                    disabled={composingBlock || !form.city_id}
                    className="rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {composingBlock ? "Generating..." : "Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSteps(true)}
                    disabled={!requestBlock || !form.city_id}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    View steps
                  </button>
                </div>
              </div>
              {requestBlockInfo && <p className="mt-2 text-[11px] text-gray-500">{requestBlockInfo}</p>}
              <p className="mt-3 text-[11px] text-gray-500">
                This does not submit anything automatically—it’s optimized for copy/paste into the official portal.
              </p>
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

            {(isSf || isOpenRecords || isJustFoia) && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-900">Portal checklist</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {isSf
                    ? "San Francisco portal fields we expect to fill (based on NextRequest)."
                    : isJustFoia
                    ? "JustFOIA requires Description + requester name + email."
                    : "NYC OpenRecords requires Category + Agency + Title + Description + requester info."}
                </p>
                <div className="mt-3 grid gap-2 text-xs">
                  <ChecklistRow
                    label="Department (auto on Generate, or select in Advanced)"
                    ok={Boolean(form.department_id || generatedDeptName)}
                  />
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
                      <ChecklistRow label="Title" ok={Boolean(generatedTitle.trim())} />
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
                  {/* Department + coordination (optional) */}
                  {departments.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-900">Department (advanced)</p>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            Default behavior: we’ll auto-suggest a department on Generate unless you pick one here.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSuggestDepartment}
                          disabled={suggestingDept || !form.city_id || !form.request_description.trim()}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {suggestingDept ? "Suggesting..." : "Suggest"}
                        </button>
                      </div>

                      <div className="mt-2">
                        <select
                          value={form.department_id ?? ""}
                          onChange={(e) => {
                            const nextId = e.target.value ? Number(e.target.value) : undefined
                            setForm((f) => ({ ...f, department_id: nextId }))
                            const dept = nextId ? departments.find((d) => d.id === nextId) : null
                            if (dept?.name) setGeneratedDeptName(dept.name)
                            if (isOpenRecords && dept?.name && !openRecordsAgency.trim()) {
                              setOpenRecordsAgency(dept.name)
                            }
                          }}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="">(use auto-suggestion on Generate)</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        {deptSuggestionInfo && <p className="mt-1 text-xs text-gray-500">{deptSuggestionInfo}</p>}
                        {departments.find((d) => d.id === form.department_id)?.notes && (
                          <p className="mt-1 text-xs text-gray-400">
                            {departments.find((d) => d.id === form.department_id)?.notes}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-[11px] font-medium text-gray-700">
                          Coordinate with additional departments (optional)
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          This does not submit multiple portal requests; it only improves the drafted letter.
                        </p>
                        <div className="mt-2 max-h-28 overflow-auto">
                          <div className="grid grid-cols-1 gap-1">
                            {departments
                              .filter((d) => !form.department_id || d.id !== form.department_id)
                              .map((d) => {
                                const checked = additionalDeptIds.includes(d.id)
                                return (
                                  <label
                                    key={d.id}
                                    className="flex cursor-pointer items-center gap-2 text-[12px] text-gray-700"
                                  >
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
                    </div>
                  )}

                  {/* Requester email override */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Requester Email Override (advanced)
                    </label>
                    <input
                      type="email"
                      value={form.requester_email_override}
                      onChange={(e) => setForm((f) => ({ ...f, requester_email_override: e.target.value }))}
                      placeholder="If you want replies sent to a different address"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

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

function extractPortalRequestText(block: string): string {
  const txt = (block || "").trim()
  if (!txt) return ""
  const marker = "Request:"
  const idx = txt.indexOf(marker)
  if (idx < 0) return txt
  const after = txt.slice(idx + marker.length).replace(/^\s+/, "")
  return after.trim()
}

function generateTitleFromDescription(description: string): string {
  const raw = (description || "").trim()
  if (!raw) return ""

  const norm = raw.toLowerCase()

  const years = Array.from(new Set((raw.match(/\b(19|20)\d{2}\b/g) ?? []))).sort()
  const yearPart =
    years.length >= 2 ? `${years[0]}–${years[years.length - 1]}` : years[0] || ""

  let city = ""
  if (/san\s+francisco|city\s+of\s+san\s+francisco/.test(norm)) city = "San Francisco"
  if (/new\s+york\s+city|\bnyc\b/.test(norm)) city = "New York City"

  const droneish =
    /\b(drone|uav|uas)\b/.test(norm) ||
    // Common typo we saw in testing: "drown" when meaning "drone"
    (/\bdrown\b/.test(norm) && /\b(deploy|deployment|time in air|flight)\b/.test(norm))

  const topic =
    droneish
      ? /\bdeploy|deployment\b/.test(norm)
        ? "Drone deployments"
        : /\bflight|flights\b/.test(norm)
          ? "Drone flights"
          : "Drone use"
      : /\bbody[-\s]?worn\b/.test(norm)
        ? "Body-worn camera records"
        : /\b911\b|\bdispatch\b/.test(norm)
          ? "911/dispatch records"
          : ""

  if (topic) {
    const parts: string[] = []
    if (city) parts.push(city)
    parts.push(topic)
    let t = parts.join(" ")
    if (yearPart) t = `${t} (${yearPart})`
    t = t.replace(/\s+/g, " ").trim()

    const maxLen = 80
    if (t.length > maxLen) t = `${t.slice(0, maxLen - 1).trimEnd()}…`
    return t
  }

  // Fallback: first sentence, cleaned.
  const firstLine = raw.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || raw
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0] || firstLine

  let t = firstSentence.replace(/\s+/g, " ").trim()
  t = t.replace(/[.?!]+$/g, "").trim()
  t = t.replace(
    /^(please\s+|can you\s+|could you\s+|i (would like|want|need)\s+|give me\s+|looking for\s+|request(ing)?\s+|seeking\s+)/i,
    ""
  )
  t = t.replace(/^(a\s+|an\s+|the\s+)?(list|set)\s+of\s+/i, "")
  t = t.trim()
  if (t.length > 0) t = t[0].toUpperCase() + t.slice(1)

  const maxLen = 80
  if (t.length > maxLen) t = `${t.slice(0, maxLen - 1).trimEnd()}…`
  return t
}

function SubmissionStepsModal({
  open,
  onClose,
  cityName,
  portalUrl,
  isNextRequest,
  isOpenRecords,
  isJustFoia,
  departmentName,
  openRecordsCategory,
  openRecordsAgency,
  title,
  portalRequestText,
  fullRequestBlock,
  requester,
  onCopy,
  onSubmitted,
  submitting,
}: {
  open: boolean
  onClose: () => void
  cityName: string
  portalUrl: string
  isNextRequest: boolean
  isOpenRecords: boolean
  isJustFoia: boolean
  departmentName: string
  openRecordsCategory: string
  openRecordsAgency: string
  title: string
  portalRequestText: string
  fullRequestBlock: string
  requester: {
    name: string
    email: string
    phone: string
    street: string
    city: string
    state: string
    zip: string
    organization: string
  }
  onCopy: (label: string, text: string) => Promise<void>
  onSubmitted: () => Promise<void>
  submitting: boolean
}) {
  if (!open) return null

  const safeCityName = (cityName || "").trim() || "city portal"
  const dept = (departmentName || "").trim() || "(select a department)"
  const link = (portalUrl || "").trim()
  const [copied, setCopied] = useState(false)

  const addressLine = [requester.street, requester.city, requester.state, requester.zip]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Submit on portal (copy/paste steps)</h3>
            <p className="mt-0.5 text-xs text-gray-500">{safeCityName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-900">Steps</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
              <li>
                Go to{" "}
                {link ? (
                  <a className="text-purple-700 underline" href={link} target="_blank" rel="noopener noreferrer">
                    {link}
                  </a>
                ) : (
                  <span className="text-gray-500">(no portal URL on file)</span>
                )}
              </li>

              {isOpenRecords ? (
                <>
                  <li>
                    Select <span className="font-semibold">Category</span>:{" "}
                    <span className="font-semibold">{openRecordsCategory.trim() || "(choose one)"}</span>
                  </li>
                  <li>
                    Select/enter <span className="font-semibold">Agency</span>:{" "}
                    <span className="font-semibold">{openRecordsAgency.trim() || "(enter agency)"}</span>
                  </li>
                  <li>
                    Paste <span className="font-semibold">Title</span>:{" "}
                    <span className="font-semibold">{title.trim() || "(auto-generated from description)"}</span>
                  </li>
                  <li>
                    Copy the request text below and paste it into{" "}
                    <span className="font-semibold">Request description</span>.
                  </li>
                </>
              ) : isJustFoia ? (
                <>
                  <li>
                    Click <span className="font-semibold">Submit a Request</span> (or <span className="font-semibold">New Request</span>).
                  </li>
                  {departmentName.trim() ? (
                    <li>
                      Select <span className="font-semibold">{dept}</span> from the{" "}
                      <span className="font-semibold">Department</span> dropdown if available.
                    </li>
                  ) : null}
                  <li>
                    Paste the request text below into the <span className="font-semibold">Description</span> or{" "}
                    <span className="font-semibold">Request</span> field.
                  </li>
                  <li>
                    Fill in <span className="font-semibold">Your name</span>, <span className="font-semibold">Email</span>,
                    and any other required contact fields using the requester info below.
                  </li>
                  <li>
                    JustFOIA will email a confirmation with a case number (e.g.{" "}
                    <span className="font-semibold">FOIA 92-2026</span>). Save it.
                  </li>
                  <li>
                    Responses come from <span className="font-semibold">[city]@request.justfoia.com</span>.
                    You can reply directly to that address.
                  </li>
                </>
              ) : isNextRequest ? (
                <>
                  <li>
                    In the <span className="font-semibold">Request description</span> box, paste the request text below.
                  </li>
                  <li>
                    Select <span className="font-semibold">{dept}</span> from the{" "}
                    <span className="font-semibold">Department</span> dropdown.
                  </li>
                  <li>
                    Fill out <span className="font-semibold">Your information</span> (Email, Name, Phone, Address, etc.)
                    using the values below.
                  </li>
                </>
              ) : (
                <>
                  <li>Copy the request text below and paste it into the portal’s request/description field.</li>
                  {departmentName.trim() ? (
                    <li>Select <span className="font-semibold">{dept}</span> if the portal asks for a department/agency.</li>
                  ) : null}
                  <li>Fill in your requester contact info if the portal requires it.</li>
                </>
              )}

              <li>
                Submit the portal form, then copy the portal confirmation number/receipt.
              </li>
              <li>
                Click <span className="font-semibold">Submitted</span> below to save this draft and jump straight to
                confirmation-number entry.
              </li>
            </ol>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-900">Copy helpers</p>
                <p className="mt-0.5 text-xs text-gray-500">One-click copy for the portal’s request box.</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onCopy("portal request text", portalRequestText || fullRequestBlock)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1200)
                }}
                disabled={submitting || (!portalRequestText.trim() && !fullRequestBlock.trim())}
                className="rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {submitting ? "Generating..." : copied ? "Copied" : "Copy request text"}
              </button>
            </div>

            {isOpenRecords && (
              <div className="mt-3">
                <label className="block text-[11px] font-medium text-gray-600">NYC Title (paste into Title field)</label>
                <input
                  value={title}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800"
                />
                <p className="mt-1 text-[11px] text-gray-500">Click the box and press Cmd+C to copy.</p>
              </div>
            )}

            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800">
              {portalRequestText || fullRequestBlock || "Click Generate in the draft first."}
            </pre>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-900">Requester info (from org profile)</p>
            <div className="mt-3 grid gap-2 text-xs text-gray-700 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-medium text-gray-600">Name</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{requester.name || "(missing)"}</span>
                  <button
                    type="button"
                    onClick={() => onCopy("requester name", requester.name)}
                    disabled={!requester.name.trim()}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-medium text-gray-600">Email</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{requester.email || "(missing)"}</span>
                  <button
                    type="button"
                    onClick={() => onCopy("requester email", requester.email)}
                    disabled={!requester.email.trim()}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-medium text-gray-600">Phone</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{requester.phone || "(optional)"}</span>
                  <button
                    type="button"
                    onClick={() => onCopy("requester phone", requester.phone)}
                    disabled={!requester.phone.trim()}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-medium text-gray-600">Address</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{addressLine || "(missing)"}</span>
                  <button
                    type="button"
                    onClick={() => onCopy("requester address", addressLine)}
                    disabled={!addressLine.trim()}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
              {requester.organization.trim() && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:col-span-2">
                  <p className="text-[11px] font-medium text-gray-600">Organization</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-medium">{requester.organization}</span>
                    <button
                      type="button"
                      onClick={() => onCopy("organization", requester.organization)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSubmitted}
            disabled={submitting}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Submitted"}
          </button>
        </div>
      </div>
    </div>
  )
}
