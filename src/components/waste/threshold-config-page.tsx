"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import {
  useWasteThresholds,
  useUpdateWasteThresholds,
  useWasteReviewQueue,
  useWasteDetectorAccuracy,
} from "@/lib/hooks/useWaste"
import { useCities } from "@/lib/hooks/useCities"
import { WasteShell } from "./waste-shell"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import Link from "next/link"
import {
  Save,
  RotateCcw,
  Loader2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Gauge,
  Info,
  BookOpen,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { WasteThreshold, UpdateThresholdRequest } from "@/lib/apiClient"

// ── Business Use-Case Groups ────────────────────────────────────────────────

interface PolicyGroup {
  key: string
  title: string
  description: string
  icon: typeof Gauge
  color: string
  detectorCategories: string[]
}

const POLICY_GROUPS: PolicyGroup[] = [
  {
    key: "payroll",
    title: "Payroll Approvals",
    description:
      "Controls that flag overtime outliers, compensation anomalies, and time-reporting irregularities before payroll is approved.",
    icon: Gauge,
    color: "border-l-indigo-500",
    detectorCategories: ["payroll"],
  },
  {
    key: "procurement",
    title: "Procurement Risk",
    description:
      "Detectors that identify vendor concentration, split purchase orders, ghost vendors, and other procurement red flags in the PO approval flow.",
    icon: Gauge,
    color: "border-l-orange-500",
    detectorCategories: ["vendor"],
  },
  {
    key: "contracts",
    title: "Contract Oversight",
    description:
      "Monitors for contract drift, vague scope language, sole-source justification weaknesses, and amendment patterns that circumvent competitive processes.",
    icon: Gauge,
    color: "border-l-teal-500",
    detectorCategories: ["infrastructure"],
  },
  {
    key: "grants",
    title: "Grant Compliance",
    description:
      "Flags nonprofit grantees with financial irregularities, missing audits, or patterns consistent with misuse of public funds.",
    icon: Gauge,
    color: "border-l-purple-500",
    detectorCategories: ["nonprofit"],
  },
  {
    key: "integrity",
    title: "Integrity & Influence",
    description:
      "Revolving-door indicators, dual employment concerns, lobbyist influence patterns, and pay-to-play signals that affect public trust.",
    icon: Gauge,
    color: "border-l-rose-500",
    detectorCategories: ["integrity", "influence"],
  },
  {
    key: "quality",
    title: "Signal Quality Controls",
    description:
      "Global filters that control finding actionability: materiality floors, confidence thresholds, effect-size gates, and entity consolidation. These apply equally across all detector families.",
    icon: ShieldAlert,
    color: "border-l-slate-500",
    detectorCategories: ["global"],
  },
]

// ── Detector plain-English descriptions ─────────────────────────────────────

const DETECTOR_DESCRIPTIONS: Record<string, string> = {
  payroll_d1_ot_ratio: "Flags employees whose overtime exceeds a percentage of base pay",
  payroll_d2_pareto_concentration: "Identifies when a small group captures disproportionate overtime",
  payroll_d3_yoy_spike: "Detects year-over-year overtime spending spikes by department",
  payroll_d4_hours_feasibility: "Flags physically impossible work-hour claims",
  payroll_d5_comp_time: "Detects compensatory time accumulation anomalies",
  payroll_d6_dual_employment: "Identifies employees working multiple city jobs simultaneously",
  payroll_d7_cross_dept_double_dip: "Flags employees claiming hours across departments with overlap",
  vendor_d1_sss_duplicates: "Detects duplicate vendor records sharing SSN/EIN identifiers",
  vendor_d2_misdirected_payments: "Identifies payments routed to unexpected bank accounts",
  vendor_d4_vendor_concentration: "Flags departments that funnel most spending to a single vendor",
  vendor_d5_ghost_vendors: "Detects vendors with no verifiable physical presence",
  vendor_d6_round_numbers: "Identifies invoices with suspicious round-number amounts (Benford's Law)",
  vendor_d8_split_pos: "Flags purchase orders split to stay below approval thresholds",
  vendor_d9_mail_drop: "Detects vendor addresses at known mail-drop/virtual-office locations",
  vendor_d10_contract_drift: "Identifies contracts whose spending drifts from original scope",
  vendor_d12_vague_contracts: "Flags contracts with vague scope or deliverable language",
  vendor_d14_sole_source: "Detects sole-source contracts that may bypass competitive bidding",
  vendor_d19_benford: "Applies Benford's Law to invoice amount leading digits",
  infrastructure_d1_response_time: "Flags deteriorating response times in public services",
  infrastructure_d2_resolution_rate: "Detects declining issue resolution rates",
  infrastructure_d5_budget_variance: "Identifies budget-to-actual spending variances beyond tolerance",
  infrastructure_d6_budget_timing: "Flags end-of-fiscal-year spending surges",
  infrastructure_d8_permit_fast_track: "Detects permits approved unusually fast compared to peers",
  integrity_rd1_revolving_door: "Flags former city employees who became vendors within a restricted period",
  integrity_rd3_time_feasibility: "Detects impossible scheduling overlaps in official duties",
  influence_d17_lobbyist: "Identifies lobbyist influence patterns in contract awards",
  influence_d18_pay_to_play: "Detects campaign contribution patterns linked to contract recipients",
  nonprofit_np1: "Flags nonprofits receiving grants with missing required financial audits",
  nonprofit_np2: "Detects unusual grant disbursement patterns",
  nonprofit_np3: "Identifies nonprofits with financial ratios outside acceptable bounds",
  global_materiality_floor: "Minimum dollar exposure for a finding to appear in the default view — findings below this amount are suppressed",
  global_confidence_floor: "Minimum confidence score (0–1) for a finding to appear — low-confidence statistical-only findings are suppressed below this",
  global_entity_consolidation: "Number of independent detector signals required to consolidate findings into a single multi-signal investigation target",
  global_novelty_discount: "Severity cap for findings that recur across multiple analysis runs (1=Low, 2=Medium, 3=High) — recurring structural patterns are capped",
}

// ── Impact Preview ──────────────────────────────────────────────────────────

function ImpactPreview({
  cityId,
  groupKey,
}: {
  cityId: number | null
  groupKey: string
}) {
  const { data: queueData } = useWasteReviewQueue({
    cityId,
    status: "pending",
    perPage: 1,
  })
  const { data: accuracyData } = useWasteDetectorAccuracy(cityId ?? 0)

  const stats = useMemo(() => {
    if (!accuracyData?.length) return null
    const relevant = accuracyData.filter((d) =>
      d.detector_key.startsWith(groupKey === "procurement" ? "vendor" : groupKey)
    )
    if (relevant.length === 0) return null

    const totalResolved = relevant.reduce(
      (s, d) => s + (d.confirmed_count ?? 0) + (d.false_positive_count ?? 0),
      0
    )
    const fpCount = relevant.reduce((s, d) => s + (d.false_positive_count ?? 0), 0)
    const avgPrecision =
      relevant.reduce((s, d) => s + d.precision_rate, 0) / relevant.length

    return { totalResolved, fpCount, avgPrecision, detectorCount: relevant.length }
  }, [accuracyData, groupKey])

  if (!stats) return null

  return (
    <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Impact Preview
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-sm font-bold text-gray-800 tabular-nums">
            {queueData?.total ?? "--"}
          </div>
          <div className="text-[10px] text-gray-500">Queue items</div>
        </div>
        <div>
          <div className="text-sm font-bold text-emerald-600 tabular-nums">
            {Math.round(stats.avgPrecision * 100)}%
          </div>
          <div className="text-[10px] text-gray-500">Precision</div>
        </div>
        <div>
          <div className="text-sm font-bold text-gray-800 tabular-nums">
            {stats.fpCount}
          </div>
          <div className="text-[10px] text-gray-500">False positives</div>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-2">
        Raising thresholds reduces queue volume but may miss true positives.
        Lowering them increases coverage at the cost of more false positives.
      </p>
    </div>
  )
}

// ── Category Sensitivity Slider ─────────────────────────────────────────────

function CategorySensitivity({
  thresholds,
  localValues,
  onBulkAdjust,
}: {
  thresholds: WasteThreshold[]
  localValues: Record<string, number>
  onBulkAdjust: (factor: number) => void
}) {
  // Calculate average sensitivity as % of max range
  const avgSensitivity = useMemo(() => {
    if (thresholds.length === 0) return 50
    const pcts = thresholds.map((t) => {
      const current = localValues[t.detector_key] ?? t.current_value
      const range = t.max_value - t.min_value
      return range > 0 ? ((current - t.min_value) / range) * 100 : 50
    })
    return Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
  }, [thresholds, localValues])

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-medium text-gray-600">Overall Sensitivity</span>
      </div>
      <div className="flex-1 max-w-[200px]">
        <Slider
          value={[avgSensitivity]}
          min={0}
          max={100}
          step={5}
          onValueChange={([v]) => {
            const factor = v / (avgSensitivity || 1)
            onBulkAdjust(factor)
          }}
        />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-0.5">
          <TrendingDown className="w-3 h-3" /> Fewer alerts
        </span>
        <span className="flex items-center gap-0.5">
          <TrendingUp className="w-3 h-3" /> More alerts
        </span>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ThresholdConfigPage() {
  const citiesQuery = useCities({ includeInactive: false })
  const selectedCityId = useMemo(() => {
    const eligible = (citiesQuery.data ?? []).filter((c) => (c.datasets_count ?? 0) > 0)
    return eligible.length > 0 ? Number(eligible[0].city_id) : null
  }, [citiesQuery.data])

  const { data: thresholds, isLoading, error } = useWasteThresholds(selectedCityId)
  const updateMutation = useUpdateWasteThresholds()

  const [localValues, setLocalValues] = useState<Record<string, number>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [confirmResetAll, setConfirmResetAll] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- sync local state from server data */
  useEffect(() => {
    if (!thresholds) return
    const initial: Record<string, number> = {}
    thresholds.forEach((t) => { initial[t.detector_key] = t.current_value })
    setLocalValues(initial)
    setHasChanges(false)
  }, [thresholds])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSliderChange = useCallback(
    (detectorKey: string, value: number) => {
      setLocalValues((prev) => ({ ...prev, [detectorKey]: value }))
      setHasChanges(true)
    },
    []
  )

  const handleReset = useCallback(
    (detectorKey: string, defaultValue: number) => {
      setLocalValues((prev) => ({ ...prev, [detectorKey]: defaultValue }))
      setHasChanges(true)
    },
    []
  )

  const handleResetAll = useCallback(() => {
    if (!thresholds) return
    const defaults: Record<string, number> = {}
    thresholds.forEach((t) => { defaults[t.detector_key] = t.default_value })
    setLocalValues(defaults)
    setHasChanges(true)
  }, [thresholds])

  const handleBulkAdjust = useCallback(
    (category: string, factor: number) => {
      if (!thresholds) return
      const updates: Record<string, number> = {}
      thresholds
        .filter((t) => t.category === category)
        .forEach((t) => {
          const current = localValues[t.detector_key] ?? t.current_value
          const range = t.max_value - t.min_value
          const normalized = range > 0 ? (current - t.min_value) / range : 0.5
          const newNormalized = Math.min(1, Math.max(0, normalized * factor))
          updates[t.detector_key] = t.min_value + newNormalized * range
        })
      setLocalValues((prev) => ({ ...prev, ...updates }))
      setHasChanges(true)
    },
    [thresholds, localValues]
  )

  const handleSave = useCallback(() => {
    if (!selectedCityId || !thresholds) return
    const updates: UpdateThresholdRequest[] = thresholds
      .filter((t) => localValues[t.detector_key] !== t.current_value)
      .map((t) => ({
        detector_key: t.detector_key,
        value: localValues[t.detector_key] ?? t.current_value,
      }))
    if (updates.length === 0) return
    updateMutation.mutate(
      { cityId: selectedCityId, updates },
      {
        onSuccess: () => {
          setHasChanges(false)
          toast.success("Thresholds saved")
        },
        onError: () => toast.error("Failed to save thresholds"),
      }
    )
  }, [selectedCityId, thresholds, localValues, updateMutation])

  // Group thresholds by policy group
  const groupedThresholds = useMemo(() => {
    if (!thresholds) return {}
    const result: Record<string, WasteThreshold[]> = {}
    POLICY_GROUPS.forEach((group) => {
      result[group.key] = thresholds.filter((t) =>
        group.detectorCategories.includes(t.category || "")
      )
    })
    // Catch ungrouped
    const allGrouped = new Set(Object.values(result).flat().map((t) => t.id))
    const ungrouped = thresholds.filter((t) => !allGrouped.has(t.id))
    if (ungrouped.length > 0) result["other"] = ungrouped
    return result
  }, [thresholds])

  return (
    <WasteShell
      title="Policy Tuning"
      description="Adjust detection sensitivity by business use case"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmResetAll(true)}
            disabled={!hasChanges}
          >
            <RotateCcw className="w-4 h-4 mr-1" /> Reset All
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save Changes
          </Button>
        </div>
      }
    >
      {/* Admin notice */}
      <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-amber-800 font-medium">
            Administrator Access Required
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Threshold changes take effect on the next analysis run. Lowering a threshold makes a detector
            more sensitive (more alerts); raising it reduces alerts but may miss true positives.
          </p>
        </div>
      </div>

      {/* Error / Success banners */}
      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load thresholds"}
        </div>
      )}
      {updateMutation.isSuccess && (
        <div className="p-3 mb-6 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          Thresholds saved. Changes apply on the next analysis run.
        </div>
      )}
      {updateMutation.isError && (
        <div className="p-3 mb-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to save"}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {POLICY_GROUPS.filter((g) => groupedThresholds[g.key]?.length).map((group) => {
            const groupThresholds = groupedThresholds[group.key]!
            return (
              <div
                key={group.key}
                className={cn(
                  "bg-white rounded-lg border border-gray-200 border-l-4 overflow-hidden",
                  group.color
                )}
              >
                {/* Group header */}
                <div className="p-5 pb-3">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {group.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {group.description}
                  </p>

                  {/* Category sensitivity slider */}
                  <div className="mt-3">
                    <CategorySensitivity
                      thresholds={groupThresholds}
                      localValues={localValues}
                      onBulkAdjust={(factor) => {
                        const cats = group.detectorCategories
                        cats.forEach((cat) => handleBulkAdjust(cat, factor))
                      }}
                    />
                  </div>

                  {/* Impact preview */}
                  <ImpactPreview
                    cityId={selectedCityId}
                    groupKey={group.detectorCategories[0]}
                  />
                </div>

                {/* Individual thresholds */}
                <div className="px-5 pb-5 space-y-5">
                  {groupThresholds.map((threshold) => {
                    const current = localValues[threshold.detector_key] ?? threshold.current_value
                    const isDefault = Math.abs(current - threshold.default_value) < 0.001
                    const isModified = Math.abs(current - threshold.current_value) > 0.001
                    const description =
                      DETECTOR_DESCRIPTIONS[threshold.detector_key] ?? null
                    return (
                      <div key={threshold.id} className="pt-3 border-t border-gray-100 first:border-t-0 first:pt-0">
                        <div className="flex items-start justify-between mb-1">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-gray-800">
                              {threshold.detector_name}
                            </span>
                            {description && (
                              <p className="text-[11px] text-gray-500 mt-0.5 flex items-start gap-1">
                                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                                {description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                isModified ? "text-purple-600" : "text-gray-700"
                              )}
                            >
                              {current.toFixed(2)}
                            </span>
                            {!isDefault && (
                              <button
                                type="button"
                                onClick={() => handleReset(threshold.detector_key, threshold.default_value)}
                                className="text-[11px] text-gray-500 hover:text-purple-600 transition-colors"
                              >
                                Reset ({threshold.default_value.toFixed(2)})
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <Slider
                            value={[current]}
                            min={threshold.min_value}
                            max={threshold.max_value}
                            step={(threshold.max_value - threshold.min_value) / 100}
                            onValueChange={([v]) => handleSliderChange(threshold.detector_key, v)}
                          />
                          <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                            <span>Less sensitive ({threshold.min_value.toFixed(2)})</span>
                            <span>Default: {threshold.default_value.toFixed(2)}</span>
                            <span>More sensitive ({threshold.max_value.toFixed(2)})</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Ungrouped / Other */}
          {groupedThresholds["other"]?.length ? (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Other Detectors
              </h3>
              <div className="space-y-5">
                {groupedThresholds["other"]!.map((threshold) => {
                  const current = localValues[threshold.detector_key] ?? threshold.current_value
                  const isDefault = Math.abs(current - threshold.default_value) < 0.001
                  const isModified = Math.abs(current - threshold.current_value) > 0.001
                  return (
                    <div key={threshold.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-800">
                          {threshold.detector_name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              isModified ? "text-purple-600" : "text-gray-700"
                            )}
                          >
                            {current.toFixed(2)}
                          </span>
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleReset(threshold.detector_key, threshold.default_value)}
                              className="text-[11px] text-gray-500 hover:text-purple-600 transition-colors"
                            >
                              Reset ({threshold.default_value.toFixed(2)})
                            </button>
                          )}
                        </div>
                      </div>
                      <Slider
                        value={[current]}
                        min={threshold.min_value}
                        max={threshold.max_value}
                        step={(threshold.max_value - threshold.min_value) / 100}
                        onValueChange={([v]) => handleSliderChange(threshold.detector_key, v)}
                      />
                      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                        <span>{threshold.min_value.toFixed(2)}</span>
                        <span>Default: {threshold.default_value.toFixed(2)}</span>
                        <span>{threshold.max_value.toFixed(2)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Methodology links */}
      <div className="mt-8 bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Methodology</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Understand how detectors work, how scores are computed, and how thresholds affect the analysis pipeline.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/waste/methodology"
            className="text-xs font-medium text-purple-600 no-underline hover:text-purple-700 flex items-center gap-1"
          >
            City Methodology <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            href="/waste/methodology/system"
            className="text-xs font-medium text-purple-600 no-underline hover:text-purple-700 flex items-center gap-1"
          >
            System Methodology <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirmResetAll}
        onOpenChange={setConfirmResetAll}
        title="Reset All Thresholds"
        description="Reset all thresholds to their default values? You can still adjust individual thresholds before saving."
        confirmLabel="Reset All"
        variant="destructive"
        onConfirm={() => {
          handleResetAll()
          setConfirmResetAll(false)
        }}
      />
    </WasteShell>
  )
}
