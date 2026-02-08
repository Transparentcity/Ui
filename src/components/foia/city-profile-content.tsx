"use client"

import { useEffect, useState } from "react"
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
} from "lucide-react"
import { getCityFoiaProfile, getCityDatasetTargets, getCityFoiaMetrics } from "@/lib/foiaApiClient"
import type { CityFoiaProfile, CityDatasetTarget } from "@/lib/foia/types"

const targetStatusColors: Record<string, string> = {
  targeted: "bg-emerald-100 text-emerald-700",
  optional: "bg-blue-100 text-blue-700",
  out_of_scope: "bg-gray-100 text-gray-600",
  potentially_obtainable: "bg-amber-100 text-amber-700",
}

export function CityProfileContent({ cityId }: { cityId: string }) {
  const [profile, setProfile] = useState<CityFoiaProfile | null>(null)
  const [targets, setTargets] = useState<CityDatasetTarget[]>([])
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const id = parseInt(cityId, 10)
      try {
        const [p, t, m] = await Promise.allSettled([
          getCityFoiaProfile(id),
          getCityDatasetTargets(id),
          getCityFoiaMetrics(id),
        ])
        if (p.status === "fulfilled") setProfile(p.value)
        if (t.status === "fulfilled") setTargets(t.value)
        if (m.status === "fulfilled") setMetrics(m.value)
      } catch (err) {
        setError("Failed to load city profile")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [cityId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

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
        <span className="text-sm text-gray-900">City #{cityId}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
          <Building2 className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">City #{cityId} FOIA Profile</h1>
          <p className="text-sm text-gray-500">Submission method, contacts, and dataset targets</p>
        </div>
      </div>

      {!profile && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-700">
            No FOIA profile configured for this city yet. Edit to set up submission details.
          </p>
        </div>
      )}

      {profile && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Contact Info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900">Submission Details</h3>
            <dl className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Method</dt>
                  <dd className="text-sm font-medium text-gray-900 capitalize">{profile.submission_method}</dd>
                </div>
              </div>
              {profile.contact_name && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Contact</dt>
                    <dd className="text-sm text-gray-900">{profile.contact_name}</dd>
                  </div>
                </div>
              )}
              {profile.contact_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Email</dt>
                    <dd className="text-sm text-gray-900">{profile.contact_email}</dd>
                  </div>
                </div>
              )}
              {profile.contact_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Phone</dt>
                    <dd className="text-sm text-gray-900">{profile.contact_phone}</dd>
                  </div>
                </div>
              )}
              {profile.portal_url && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Portal URL</dt>
                    <dd className="text-sm text-purple-600 hover:underline">
                      <a href={profile.portal_url} target="_blank" rel="noreferrer">{profile.portal_url}</a>
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
              <div>
                <dt className="text-xs text-gray-500">Default Response Days</dt>
                <dd className="text-sm text-gray-900">{profile.default_response_days ?? "N/A"}</dd>
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

      {/* Dataset Targets */}
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
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              No dataset targets configured for this city.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
