"use client"

import { useState } from "react"
import { useWasteCityMethodology } from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  ChevronDown,
  Database,
  ExternalLink,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Columns3,
  ArrowRightLeft,
  Info,
  FileText,
  Copy,
  ShieldAlert,
} from "lucide-react"
import type {
  CityMethodologyResponse,
  MethodologyDatasetInfo,
  MethodologyBudgetYearInfo,
  DataGapInfo,
} from "@/lib/apiClient"

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

function DatasetCard({
  ds,
  domain,
}: {
  ds: MethodologyDatasetInfo
  domain: string
}) {
  const [open, setOpen] = useState(false)
  const hasColumnMappings = Object.keys(ds.column_mappings).length > 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {ds.display_name}
              </h3>
              {ds.available ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              {ds.logical_name}
            </p>
          </div>
          {ds.portal_url && (
            <a
              href={ds.portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 whitespace-nowrap shrink-0"
            >
              <span className="font-mono">{ds.socrata_id}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {ds.detectors_enabled.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              {ds.available ? "Detectors enabled" : "Detectors skipped"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ds.detectors_enabled.map((d) => (
                <span
                  key={d}
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs",
                    ds.available
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-400 line-through"
                  )}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasColumnMappings && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-2 border-t border-gray-100 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <ArrowRightLeft className="w-3 h-3" />
              Column mappings ({Object.keys(ds.column_mappings).length})
              <ChevronDown
                className={cn(
                  "w-3 h-3 ml-auto transition-transform",
                  open && "rotate-180"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-3 pt-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left font-medium pb-1 pr-4">
                      Source column
                    </th>
                    <th className="text-left font-medium pb-1">
                      Canonical column
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {Object.entries(ds.column_mappings).map(([src, dest]) => (
                    <tr key={src} className="border-t border-gray-50">
                      <td className="py-1 pr-4 font-mono text-gray-500">
                        {src}
                      </td>
                      <td className="py-1 font-mono text-gray-800">{dest}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

function BudgetYearsSection({
  years,
}: {
  years: MethodologyBudgetYearInfo[]
}) {
  if (years.length === 0) return null

  return (
    <div className="mt-6">
      <SectionHeading
        icon={<Calendar className="w-5 h-5 text-amber-600" />}
        title="Per-Year Budget Datasets"
        subtitle="Budget data is split across separate datasets per fiscal year"
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {years.map((yr) => (
          <a
            key={yr.fiscal_year}
            href={yr.portal_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white hover:border-purple-300 transition-colors no-underline group"
          >
            <div>
              <span className="text-sm font-semibold text-gray-900">
                FY {yr.fiscal_year}
              </span>
              <span className="block text-xs font-mono text-gray-400 mt-0.5">
                {yr.socrata_id}
              </span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-purple-500 transition-colors" />
          </a>
        ))}
      </div>
    </div>
  )
}

function MethodologyNotes({
  notes,
}: {
  notes: Record<string, string>
}) {
  const entries = Object.entries(notes)
  if (entries.length === 0) return null

  const noteLabels: Record<string, string> = {
    fiscal_year: "Fiscal Year",
    data_portal: "Data Portal",
    overtime: "Overtime & Compensation",
    budget: "Budget Data",
    vendor_payments: "Vendor Payments",
    influence: "Influence & Lobbying",
    missing_datasets: "Missing Datasets",
    column_normalization: "Column Normalization",
  }

  const noteIcons: Record<string, React.ReactNode> = {
    fiscal_year: <Calendar className="w-4 h-4 text-blue-500" />,
    data_portal: <Globe className="w-4 h-4 text-purple-500" />,
    overtime: <Info className="w-4 h-4 text-orange-500" />,
    budget: <Database className="w-4 h-4 text-emerald-500" />,
    vendor_payments: <Columns3 className="w-4 h-4 text-indigo-500" />,
    influence: <Info className="w-4 h-4 text-red-500" />,
    missing_datasets: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    column_normalization: <ArrowRightLeft className="w-4 h-4 text-gray-500" />,
  }

  return (
    <div className="mt-8">
      <SectionHeading
        icon={<Info className="w-5 h-5 text-blue-600" />}
        title="Analysis Decisions & Notes"
        subtitle="How we handle this city's specific data characteristics"
      />
      <div className="space-y-3">
        {entries.map(([key, text]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {noteIcons[key] ?? <Info className="w-4 h-4 text-gray-400" />}
                {noteLabels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

const GAP_TYPE_LABELS: Record<string, string> = {
  missing_dataset: "Missing Dataset",
  missing_columns: "Missing Columns",
  missing_years: "Incomplete Years",
  external_source_needed: "External Source Needed",
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
}

function DataGapCard({ gap }: { gap: DataGapInfo }) {
  const [showPrr, setShowPrr] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gap.public_records_request)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900">
                {gap.title}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border",
                  PRIORITY_STYLES[gap.priority] ?? PRIORITY_STYLES.medium
                )}
              >
                {gap.priority}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {GAP_TYPE_LABELS[gap.gap_type] ?? gap.gap_type}
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          {gap.description}
        </p>

        {gap.detectors_blocked.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              Detectors blocked
            </p>
            <div className="flex flex-wrap gap-1.5">
              {gap.detectors_blocked.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-50 text-red-600"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {gap.new_detectors_enabled.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              New detectors this would unlock
            </p>
            <div className="flex flex-wrap gap-1.5">
              {gap.new_detectors_enabled.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <Collapsible open={showPrr} onOpenChange={setShowPrr}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 text-xs font-medium text-purple-700 hover:bg-purple-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Public records request template
            <ChevronDown
              className={cn(
                "w-3 h-3 ml-auto transition-transform",
                showPrr && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-1">
            <div className="relative rounded-md border border-gray-200 bg-gray-50 p-3">
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-gray-200 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {copied && (
                <span className="absolute top-2 right-10 text-[10px] font-medium text-emerald-600">
                  Copied
                </span>
              )}
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap pr-8">
                {gap.public_records_request}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function DataGapsSection({ gaps }: { gaps: DataGapInfo[] }) {
  if (gaps.length === 0) return null

  const criticalCount = gaps.filter((g) => g.priority === "critical").length
  const highCount = gaps.filter((g) => g.priority === "high").length

  return (
    <div className="mt-8">
      <SectionHeading
        icon={<ShieldAlert className="w-5 h-5 text-red-600" />}
        title="Data Gaps & Public Records Requests"
        subtitle={`${gaps.length} data gaps identified — ${criticalCount} critical, ${highCount} high priority`}
      />
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800 leading-relaxed">
          Each gap below includes a ready-to-send public records request template
          with the specific columns, date ranges, row counts, and formats needed.
          Filling these gaps will enable new detectors and strengthen existing ones.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {gaps.map((gap) => (
          <DataGapCard key={gap.id} gap={gap} />
        ))}
      </div>
    </div>
  )
}

function MethodologyContent({
  data,
  cityName,
}: {
  data: CityMethodologyResponse
  cityName: string
}) {
  return (
    <div className="space-y-8">
      {/* Header summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Data Portal
          </p>
          <a
            href={`https://${data.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm font-medium text-purple-600 hover:text-purple-800 inline-flex items-center gap-1"
          >
            {data.domain}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Fiscal Year
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {data.fiscal_year_label}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Datasets Active
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {data.datasets.length}{" "}
            <span className="text-gray-400 font-normal">
              of {data.datasets.length + data.missing_datasets.length}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Detector Families
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {data.total_detectors_available} active
            {data.total_detectors_skipped > 0 && (
              <span className="text-gray-400 font-normal">
                {" "}· {data.total_detectors_skipped} skipped
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Active datasets */}
      <div>
        <SectionHeading
          icon={<Database className="w-5 h-5 text-emerald-600" />}
          title="Active Datasets"
          subtitle={`${data.datasets.length} datasets connected and feeding detectors`}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {data.datasets.map((ds) => (
            <DatasetCard key={ds.logical_name} ds={ds} domain={data.domain} />
          ))}
        </div>
      </div>

      {/* Budget year datasets */}
      {data.budget_year_datasets.length > 0 && (
        <BudgetYearsSection years={data.budget_year_datasets} />
      )}

      {/* Missing datasets */}
      {data.missing_datasets.length > 0 && (
        <div>
          <SectionHeading
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            title="Unavailable Datasets"
            subtitle="These datasets are not published by this city's data portal — related detectors are skipped"
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {data.missing_datasets.map((ds) => (
              <DatasetCard
                key={ds.logical_name}
                ds={ds}
                domain={data.domain}
              />
            ))}
          </div>
        </div>
      )}

      {/* Data gaps & public records requests */}
      {data.data_gaps && data.data_gaps.length > 0 && (
        <DataGapsSection gaps={data.data_gaps} />
      )}

      {/* Methodology notes */}
      <MethodologyNotes notes={data.methodology_notes} />
    </div>
  )
}

export function CityMethodologyPage() {
  const { selectedCityId, selectedCityName } = useWasteCity()
  const { data, isLoading, error } = useWasteCityMethodology(selectedCityId)

  return (
    <WasteShell
      title="City Methodology"
      description="Datasets, analysis decisions, and data handling specifics"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="ml-3 text-sm text-gray-500">
            Loading methodology for {selectedCityName}…
          </span>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">
            Could not load methodology
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {data && !isLoading && (
        <MethodologyContent data={data} cityName={selectedCityName} />
      )}
    </WasteShell>
  )
}
