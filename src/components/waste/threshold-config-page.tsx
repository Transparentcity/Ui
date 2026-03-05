"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useWasteThresholds, useUpdateWasteThresholds } from "@/lib/hooks/useWaste"
import { useCities } from "@/lib/hooks/useCities"
import { WasteShell } from "./waste-shell"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Save, RotateCcw, Loader2, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { WasteThreshold, UpdateThresholdRequest } from "@/lib/apiClient"

const CATEGORY_LABELS: Record<string, string> = {
  vendor: "Vendor / Procurement",
  payroll: "Payroll / Compensation",
  infrastructure: "Infrastructure / Services",
  nonprofit: "Nonprofit / Grants",
}

const CATEGORY_ORDER = ["vendor", "payroll", "infrastructure", "nonprofit"]

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

  useEffect(() => {
    if (!thresholds) return
    const initial: Record<string, number> = {}
    thresholds.forEach((t) => { initial[t.detector_key] = t.current_value })
    setLocalValues(initial)
    setHasChanges(false)
  }, [thresholds])

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

  const grouped = useMemo(() => {
    if (!thresholds) return {}
    const groups: Record<string, WasteThreshold[]> = {}
    thresholds.forEach((t) => {
      const cat = t.category || "other"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    })
    return groups
  }, [thresholds])

  return (
    <WasteShell
      title="Threshold Configuration"
      description="Adjust per-detector sensitivity thresholds"
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
      {/* Admin gate notice */}
      <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800">
          Only city administrators can modify detector thresholds. Changes take effect on the next analysis run.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load thresholds"}
        </div>
      )}

      {/* Success */}
      {updateMutation.isSuccess && (
        <div className="p-3 mb-6 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          Thresholds saved successfully. Changes will apply on the next analysis run.
        </div>
      )}

      {/* Save error */}
      {updateMutation.isError && (
        <div className="p-3 mb-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to save thresholds"}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="space-y-5 bg-white rounded-lg border border-gray-200 p-5">
                {grouped[cat]!.map((threshold) => {
                  const current = localValues[threshold.detector_key] ?? threshold.current_value
                  const isDefault = Math.abs(current - threshold.default_value) < 0.001
                  const isModified = Math.abs(current - threshold.current_value) > 0.001
                  return (
                    <div key={threshold.id}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            {threshold.detector_name}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">
                            {threshold.field_label}
                          </span>
                        </div>
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
                              aria-label={`Reset ${threshold.detector_name} to ${threshold.default_value.toFixed(2)}`}
                              className="text-[11px] text-gray-400 hover:text-purple-600 transition-colors"
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
                      <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                        <span>{threshold.min_value.toFixed(2)}</span>
                        <span>Default: {threshold.default_value.toFixed(2)}</span>
                        <span>{threshold.max_value.toFixed(2)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

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
