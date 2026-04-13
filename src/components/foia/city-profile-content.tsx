"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  FileText,
  Loader2,
  AlertTriangle,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  Clock,
} from "lucide-react"
import { toast } from "sonner"
import {
  getCityFoiaProfile,
  updateCityFoiaProfile,
  getCityDatasetTargets,
  getCityFoiaMetrics,
  listAdminCityDepartments,
  createCityDepartment,
  updateCityDepartment,
  deleteCityDepartment,
} from "@/lib/foiaApiClient"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { CityFoiaProfile, CityDatasetTarget, FoiaCityDepartment, SubmissionMethod } from "@/lib/foia/types"

const targetStatusColors: Record<string, string> = {
  targeted: "bg-emerald-100 text-emerald-700",
  optional: "bg-blue-100 text-blue-700",
  out_of_scope: "bg-gray-100 text-gray-600",
  potentially_obtainable: "bg-amber-100 text-amber-700",
}

const SUBMISSION_METHODS: { value: SubmissionMethod; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "web", label: "Web Form" },
  { value: "portal", label: "FOIA Portal (NextRequest, JustFOIA, etc.)" },
  { value: "mail", label: "Physical Mail" },
  { value: "fax", label: "Fax" },
]

interface ProfileForm {
  submission_method: string
  contact_name: string
  contact_email: string
  contact_phone: string
  portal_url: string
  civic_platform_url: string
  civic_platform_username: string
  civic_platform_email: string
  civic_platform_password: string
  statute_name: string
  default_response_days: string
  observed_ack_latency_days: string
  common_deflections: string
  notes: string
}

function detectPortalTechnology(portalUrl?: string): string {
  if (!portalUrl) return "Unknown"
  const url = portalUrl.toLowerCase()
  if (url.includes("nextrequest")) return "NextRequest"
  if (url.includes("civicrequest")) return "CivicRequest"
  if (url.includes("justfoia")) return "JustFOIA"
  if (url.includes("openrecords")) return "OpenRecords"
  if (url.includes("mycusthelp") || url.includes("govqa")) return "GovQA"
  if (url.includes("granicus")) return "Granicus"
  if (url.includes("socrata")) return "Socrata-hosted intake"
  if (url.includes("arcgis")) return "ArcGIS/Open Data intake"
  return "Unknown/Custom portal"
}

function profileToForm(p: CityFoiaProfile | null): ProfileForm {
  return {
    submission_method: p?.submission_method ?? "email",
    contact_name: p?.contact_name ?? "",
    contact_email: p?.contact_email ?? "",
    contact_phone: p?.contact_phone ?? "",
    portal_url: p?.portal_url ?? "",
    civic_platform_url: p?.civic_platform_url ?? "",
    civic_platform_username: p?.civic_platform_username ?? "",
    civic_platform_email: p?.civic_platform_email ?? "",
    civic_platform_password: p?.civic_platform_password ?? "",
    statute_name: p?.statute_name ?? "",
    default_response_days: p?.default_response_days?.toString() ?? "10",
    observed_ack_latency_days: p?.observed_ack_latency_days?.toString() ?? "",
    common_deflections: (p?.common_deflections ?? []).join(", "),
    notes: p?.notes ?? "",
  }
}

export function CityProfileContent({ cityId }: { cityId: string }) {
  const id = parseInt(cityId, 10)
  const [profile, setProfile] = useState<CityFoiaProfile | null>(null)
  const [targets, setTargets] = useState<CityDatasetTarget[]>([])
  const [departments, setDepartments] = useState<FoiaCityDepartment[]>([])
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode state
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProfileForm>(profileToForm(null))

  // Department edit state
  const [editingDept, setEditingDept] = useState<number | "new" | null>(null)
  const [deptForm, setDeptForm] = useState({ name: "", portal_routing_key: "", contact_email: "", contact_phone: "", notes: "" })
  const [savingDept, setSavingDept] = useState(false)
  const [deleteDeptConfirmId, setDeleteDeptConfirmId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [p, t, d, m] = await Promise.allSettled([
        getCityFoiaProfile(id),
        getCityDatasetTargets(id),
        listAdminCityDepartments(id),
        getCityFoiaMetrics(id),
      ])
      if (p.status === "fulfilled") setProfile(p.value)
      if (t.status === "fulfilled") setTargets(t.value)
      if (d.status === "fulfilled") setDepartments(d.value)
      if (m.status === "fulfilled") setMetrics(m.value)
    } catch (err) {
      setError("Failed to load city profile")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  function startEditing() {
    setForm(profileToForm(profile))
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError(null)
  }

  async function saveProfile() {
    setSaving(true)
    setError(null)
    try {
      const data: Record<string, unknown> = {
        submission_method: form.submission_method,
        contact_name: form.contact_name || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
        portal_url: form.portal_url || undefined,
        civic_platform_url: form.civic_platform_url || undefined,
        civic_platform_username: form.civic_platform_username || undefined,
        civic_platform_email: form.civic_platform_email || undefined,
        civic_platform_password: form.civic_platform_password || undefined,
        statute_name: form.statute_name || undefined,
        default_response_days: form.default_response_days ? parseInt(form.default_response_days, 10) : undefined,
        observed_ack_latency_days: form.observed_ack_latency_days ? parseInt(form.observed_ack_latency_days, 10) : undefined,
        common_deflections: form.common_deflections.trim()
          ? form.common_deflections.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        notes: form.notes || undefined,
      }
      // Strip undefined keys
      const cleaned = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
      const updated = await updateCityFoiaProfile(id, cleaned)
      setProfile(updated)
      setEditing(false)
    } catch (err) {
      console.error(err)
      setError("Failed to save profile. Make sure the backend is running.")
    } finally {
      setSaving(false)
    }
  }

  // Department CRUD
  function startAddDept() {
    setDeptForm({ name: "", portal_routing_key: "", contact_email: "", contact_phone: "", notes: "" })
    setEditingDept("new")
  }

  function startEditDept(dept: FoiaCityDepartment) {
    setDeptForm({
      name: dept.name,
      portal_routing_key: dept.portal_routing_key ?? "",
      contact_email: dept.contact_email ?? "",
      contact_phone: dept.contact_phone ?? "",
      notes: dept.notes ?? "",
    })
    setEditingDept(dept.id)
  }

  async function saveDept() {
    if (!deptForm.name.trim()) return
    setSavingDept(true)
    try {
      if (editingDept === "new") {
        await createCityDepartment(id, {
          name: deptForm.name.trim(),
          portal_routing_key: deptForm.portal_routing_key.trim() || undefined,
          contact_email: deptForm.contact_email.trim() || undefined,
          contact_phone: deptForm.contact_phone.trim() || undefined,
          notes: deptForm.notes.trim() || undefined,
        })
      } else if (typeof editingDept === "number") {
        await updateCityDepartment(editingDept, {
          name: deptForm.name.trim(),
          portal_routing_key: deptForm.portal_routing_key.trim() || undefined,
          contact_email: deptForm.contact_email.trim() || undefined,
          contact_phone: deptForm.contact_phone.trim() || undefined,
          notes: deptForm.notes.trim() || undefined,
        })
      }
      setEditingDept(null)
      await loadData()
    } catch (err) {
      console.error("Failed to save department:", err)
      toast.error("Failed to save department")
    } finally {
      setSavingDept(false)
    }
  }

  async function handleDeleteDeptConfirm(deptId: number) {
    try {
      await deleteCityDepartment(deptId)
      setDeleteDeptConfirmId(null)
      toast.success("Department deleted")
      await loadData()
    } catch (err) {
      console.error("Failed to delete department:", err)
      toast.error("Failed to delete department")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  const cityName = profile?.city?.name
  const cityState = profile?.city?.state
  const displayName = cityName ? `${cityName}${cityState ? `, ${cityState}` : ""}` : `City #${cityId}`

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/foia/cities"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          City Profiles
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-900">{displayName}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
            <Building2 className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{displayName} FOIA Profile</h1>
            <p className="text-sm text-gray-500">Submission method, contacts, departments, and dataset targets</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={startEditing}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <Pencil className="h-4 w-4" />
            {profile ? "Edit Profile" : "Set Up Profile"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!profile && !editing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-700">
            No FOIA profile configured for this city yet. Click &quot;Set Up Profile&quot; above to get started.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* EDIT MODE */}
      {/* ---------------------------------------------------------------- */}
      {editing && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-semibold text-gray-900">
              {profile ? "Edit FOIA Profile" : "Set Up FOIA Profile"}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Profile
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Submission Details */}
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-gray-700">Submission Details</h4>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Submission Method *</label>
                <select
                  value={form.submission_method}
                  onChange={(e) => setForm((f) => ({ ...f, submission_method: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {SUBMISSION_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Portal URL</label>
                <input
                  type="url"
                  value={form.portal_url}
                  onChange={(e) => setForm((f) => ({ ...f, portal_url: e.target.value }))}
                  placeholder="https://cityname.nextrequest.com or https://cityname.justfoia.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  The system auto-detects NextRequest, JustFOIA, and OpenRecords portals from this URL.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Contact Name</label>
                <input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  placeholder="FOIA Officer name"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Contact Email</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                    placeholder="foia@city.gov"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Contact Phone</label>
                  <input
                    type="tel"
                    value={form.contact_phone}
                    onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="mt-1 border-t border-gray-200 pt-4">
                <h5 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Civic/Open Data Platform Access
                </h5>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Civic Platform URL
                    </label>
                    <input
                      type="url"
                      value={form.civic_platform_url}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, civic_platform_url: e.target.value }))
                      }
                      placeholder="https://portal.city.gov/login"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Platform Username
                      </label>
                      <input
                        value={form.civic_platform_username}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, civic_platform_username: e.target.value }))
                        }
                        placeholder="username"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Platform Email
                      </label>
                      <input
                        type="email"
                        value={form.civic_platform_email}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, civic_platform_email: e.target.value }))
                        }
                        placeholder="records@transparentcity.org"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Platform Password
                    </label>
                    <input
                      type="password"
                      value={form.civic_platform_password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, civic_platform_password: e.target.value }))
                      }
                      placeholder="Stored for internal filing workflows"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Statute & Responsiveness */}
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-gray-700">Statute & Responsiveness</h4>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Statute Name</label>
                <input
                  value={form.statute_name}
                  onChange={(e) => setForm((f) => ({ ...f, statute_name: e.target.value }))}
                  placeholder="e.g. California Public Records Act, FOIL, etc."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Default Response Days</label>
                  <input
                    type="number"
                    min={1}
                    value={form.default_response_days}
                    onChange={(e) => setForm((f) => ({ ...f, default_response_days: e.target.value }))}
                    placeholder="10"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Observed Ack Latency (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.observed_ack_latency_days}
                    onChange={(e) => setForm((f) => ({ ...f, observed_ack_latency_days: e.target.value }))}
                    placeholder="e.g. 3"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Common Deflections</label>
                <input
                  value={form.common_deflections}
                  onChange={(e) => setForm((f) => ({ ...f, common_deflections: e.target.value }))}
                  placeholder='e.g. "too broad", "fee required", "request clarification"'
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">Comma-separated list of common agency deflection tactics.</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any general notes about filing with this city..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* READ-ONLY PROFILE */}
      {/* ---------------------------------------------------------------- */}
      {profile && !editing && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Contact Info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900">Submission Details</h3>
            <dl className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-gray-500" />
                <div>
                  <dt className="text-xs text-gray-500">Method</dt>
                  <dd className="text-sm font-medium text-gray-900 capitalize">{profile.submission_method}</dd>
                </div>
              </div>
              {profile.contact_name && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Contact</dt>
                    <dd className="text-sm text-gray-900">{profile.contact_name}</dd>
                  </div>
                </div>
              )}
              {profile.contact_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Email</dt>
                    <dd className="text-sm text-gray-900">{profile.contact_email}</dd>
                  </div>
                </div>
              )}
              {profile.contact_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Phone</dt>
                    <dd className="text-sm text-gray-900">{profile.contact_phone}</dd>
                  </div>
                </div>
              )}
              {profile.portal_url && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Portal URL</dt>
                    <dd className="text-sm text-purple-600 hover:underline">
                      <a href={profile.portal_url} target="_blank" rel="noreferrer">{profile.portal_url}</a>
                    </dd>
                  </div>
                </div>
              )}
              {profile.civic_platform_url && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Civic Platform URL</dt>
                    <dd className="text-sm text-purple-600 hover:underline">
                      <a href={profile.civic_platform_url} target="_blank" rel="noreferrer">
                        {profile.civic_platform_url}
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              {profile.civic_platform_username && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Civic Platform Username</dt>
                    <dd className="text-sm text-gray-900">{profile.civic_platform_username}</dd>
                  </div>
                </div>
              )}
              {profile.civic_platform_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Civic Platform Email</dt>
                    <dd className="text-sm text-gray-900">{profile.civic_platform_email}</dd>
                  </div>
                </div>
              )}
              {profile.civic_platform_password && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Civic Platform Password</dt>
                    <dd className="text-sm text-gray-900">{"*".repeat(12)}</dd>
                  </div>
                </div>
              )}
              {profile.portal_url && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-gray-500" />
                  <div>
                    <dt className="text-xs text-gray-500">Portal Technology</dt>
                    <dd className="text-sm text-gray-900">
                      {detectPortalTechnology(profile.portal_url)}
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {/* Statute & Responsiveness */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900">Statute & Responsiveness</h3>
            <dl className="mt-4 flex flex-col gap-3">
              {profile.statute_name && (
                <div>
                  <dt className="text-xs text-gray-500">Statute</dt>
                  <dd className="text-sm text-gray-900">{profile.statute_name}</dd>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-500" />
                <div>
                  <dt className="text-xs text-gray-500">Default Response Days</dt>
                  <dd className="text-sm text-gray-900">{profile.default_response_days ?? "N/A"}</dd>
                </div>
              </div>
              {profile.observed_ack_latency_days != null && (
                <div>
                  <dt className="text-xs text-gray-500">Observed Ack Latency</dt>
                  <dd className="text-sm text-gray-900">{profile.observed_ack_latency_days} days</dd>
                </div>
              )}
              {(profile.common_deflections?.length ?? 0) > 0 && (
                <div>
                  <dt className="text-xs text-gray-500">Common Deflections</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {profile.common_deflections.map((d, i) => (
                      <span key={i} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {d}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {profile.notes && (
                <div>
                  <dt className="text-xs text-gray-500">Notes</dt>
                  <dd className="text-sm text-gray-600">{profile.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* DEPARTMENTS */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Departments ({departments.length})</h2>
          <button
            onClick={startAddDept}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Department
          </button>
        </div>

        {/* Add/Edit department inline form */}
        {editingDept !== null && (
          <div className="border-b border-purple-200 bg-purple-50/30 px-6 py-4">
            <p className="mb-3 text-xs font-semibold text-gray-700">
              {editingDept === "new" ? "Add Department" : "Edit Department"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Name *</label>
                <input
                  value={deptForm.name}
                  onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Police Department"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Portal Routing Key</label>
                <input
                  value={deptForm.portal_routing_key}
                  onChange={(e) => setDeptForm((f) => ({ ...f, portal_routing_key: e.target.value }))}
                  placeholder="Portal value (for NextRequest, JustFOIA, etc.)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Contact Email</label>
                <input
                  type="email"
                  value={deptForm.contact_email}
                  onChange={(e) => setDeptForm((f) => ({ ...f, contact_email: e.target.value }))}
                  placeholder="dept@city.gov"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Contact Phone</label>
                <input
                  type="tel"
                  value={deptForm.contact_phone}
                  onChange={(e) => setDeptForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Notes</label>
                <input
                  value={deptForm.notes}
                  onChange={(e) => setDeptForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes about this department..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={saveDept}
                disabled={savingDept || !deptForm.name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {savingDept ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editingDept === "new" ? "Add" : "Update"}
              </button>
              <button
                onClick={() => setEditingDept(null)}
                disabled={savingDept}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {departments.map((dept) => (
            <div key={dept.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{dept.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {dept.portal_routing_key && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px]">{dept.portal_routing_key}</span>
                  )}
                  {dept.contact_email && <span>{dept.contact_email}</span>}
                  {dept.contact_phone && <span>{dept.contact_phone}</span>}
                </div>
                {dept.notes && <p className="mt-1 text-xs text-gray-500">{dept.notes}</p>}
              </div>
              <div className="flex items-center gap-1.5 ml-4">
                <button
                  onClick={() => startEditDept(dept)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteDeptConfirmId(dept.id)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete department"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {departments.length === 0 && editingDept === null && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No departments configured. Add departments to route requests to the right agency.
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* DATASET TARGETS */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Dataset Targets ({targets.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {targets.map((t) => {
            const color = targetStatusColors[t.status] ?? "bg-gray-100 text-gray-700"
            return (
              <div key={t.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.dataset_type_id}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                    {t.refresh_cadence_days && <span>Refresh every {t.refresh_cadence_days}d</span>}
                    {t.last_received_at && <span>Last received: {new Date(t.last_received_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
                  {t.status.replace(/_/g, " ")}
                </span>
              </div>
            )
          })}
          {targets.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No dataset targets configured for this city.
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteDeptConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteDeptConfirmId(null) }}
        title="Delete department"
        description="This department will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteDeptConfirmId !== null) handleDeleteDeptConfirm(deleteDeptConfirmId) }}
      />
    </div>
  )
}
