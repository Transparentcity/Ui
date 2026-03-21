"use client"

import { useWasteSystemMethodology } from "@/lib/hooks/useWaste"
import type {
  SystemCityOverview,
  SystemLearningInfo,
  SystemRequirementInfo,
} from "@/lib/apiClient"

export default function SystemMethodologyPage() {
  const { data, isLoading, error } = useWasteSystemMethodology()

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        Loading system methodology...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-sm text-red-500">
        Failed to load system methodology.
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          System Methodology
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Cross-city detector coverage, onboarding learnings, and standard
          dataset requirements.
        </p>
      </header>

      <CityOverviewTable cities={data.cities} />
      <LearningsSection learnings={data.learnings} />
      <RequirementsSection requirements={data.requirements} />
    </div>
  )
}

function CityOverviewTable({ cities }: { cities: SystemCityOverview[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">City Coverage</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                City
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Domain
              </th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                Datasets
              </th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                Missing
              </th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                Coverage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cities.map((c) => (
              <tr key={c.city_id}>
                <td className="px-4 py-2 font-medium">{c.city_key}</td>
                <td className="px-4 py-2 text-gray-500">{c.domain}</td>
                <td className="px-4 py-2 text-right">
                  {c.datasets_available}
                </td>
                <td className="px-4 py-2 text-right text-amber-600">
                  {c.datasets_missing}
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  {c.detector_coverage_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LearningsSection({
  learnings,
}: {
  learnings: SystemLearningInfo[]
}) {
  const universal = learnings.filter((l) => l.universal)
  const citySpecific = learnings.filter((l) => !l.universal)

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Onboarding Learnings</h2>
      <p className="text-sm text-gray-500 mb-4">
        Patterns discovered when integrating new cities. Universal learnings
        apply to every city onboarding.
      </p>

      {universal.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Universal
          </h3>
          <div className="space-y-3">
            {universal.map((l) => (
              <LearningCard key={l.id} learning={l} />
            ))}
          </div>
        </div>
      )}

      {citySpecific.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            City-Specific
          </h3>
          <div className="space-y-3">
            {citySpecific.map((l) => (
              <LearningCard key={l.id} learning={l} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function LearningCard({ learning }: { learning: SystemLearningInfo }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-sm">{learning.title}</h4>
        <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {learning.discovered_city}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{learning.description}</p>
      <p className="mt-2 text-xs text-gray-700">
        <span className="font-medium">Resolution:</span>{" "}
        {learning.resolution}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {learning.affected_detectors.map((d) => (
          <span
            key={d}
            className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

function RequirementsSection({
  requirements,
}: {
  requirements: SystemRequirementInfo[]
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">
        Standard Dataset Requirements
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Dataset
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Why Needed
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Detectors
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Alternatives
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requirements.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs">
                  {r.dataset_name}
                </td>
                <td className="px-4 py-2 text-gray-600 text-xs">
                  {r.why_needed}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.detectors_enabled.map((d) => (
                      <span
                        key={d}
                        className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {r.alternatives.length > 0
                    ? r.alternatives.join(", ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
