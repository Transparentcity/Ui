"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Bus, ShieldAlert, Phone, Flame, Home, Heart,
  FileText, Ticket, Paintbrush, BookOpen, Users,
  Construction, UtensilsCrossed, PawPrint,
  ExternalLink, Info, AlertTriangle,
  type LucideIcon,
} from "lucide-react"
import type { CostMetricResult, CostCityResult } from "@/lib/apiClient"

const ICON_MAP: Record<string, LucideIcon> = {
  Bus, ShieldAlert, Phone, Flame, Home, Heart,
  FileText, Ticket, BookOpen, Users,
  Construction, UtensilsCrossed, PawPrint,
  PaintBucket: Paintbrush,
}

function formatDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n).toLocaleString()}`
  return `$${n.toFixed(2)}`
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n).toLocaleString()}`
  return String(n)
}

function govLevelBadge(level: string) {
  if (level === "county")
    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">County service</span>
  if (level === "independent_district")
    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">Independent district</span>
  return null
}

function CityCalcBlock({ city, cityName, unit }: { city: CostCityResult; cityName: string; unit: string }) {
  const hasMath = city.budget != null && city.volume != null
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <p className="text-xs font-medium text-gray-500 mb-1">{cityName}</p>
      <p className="text-2xl font-bold tabular-nums mb-2">{formatDollar(city.cost)}</p>
      {hasMath ? (
        <p className="text-xs text-gray-600">
          {formatDollar(city.budget!)} budget ÷ {formatVolume(city.volume!)} = {formatDollar(city.cost)} {" "}
          <span className="text-gray-400">{unit}</span>
        </p>
      ) : (
        <p className="text-xs text-gray-600">
          Published reference ({city.source_name}, {city.source_year})
        </p>
      )}
      {govLevelBadge(city.government_level)}
    </div>
  )
}

interface CostDetailDrawerProps {
  metric: CostMetricResult | null
  cityAName: string
  cityBName: string
  open: boolean
  onClose: () => void
}

export function CostDetailDrawer({ metric, cityAName, cityBName, open, onClose }: CostDetailDrawerProps) {
  if (!metric) return null
  const Icon = ICON_MAP[metric.icon] ?? FileText
  const moreExpensive = metric.ratio >= 1 ? cityAName : cityBName
  const rawRatio = metric.ratio >= 1 ? metric.ratio : 1 / metric.ratio
  const rppMoreExpensive = metric.rpp_adjusted_ratio >= 1 ? cityAName : cityBName
  const adjRatio = metric.rpp_adjusted_ratio >= 1 ? metric.rpp_adjusted_ratio : 1 / metric.rpp_adjusted_ratio

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Icon className="h-5 w-5 text-gray-600" />
            {metric.label}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <CityCalcBlock city={metric.city_a} cityName={cityAName} unit={metric.unit} />
          <CityCalcBlock city={metric.city_b} cityName={cityBName} unit={metric.unit} />
        </div>

        {/* Normalization */}
        <div className="mt-4 rounded-md bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Comparison</p>
          <div className="space-y-1 text-sm text-gray-700">
            <p>Raw: <span className="font-medium">{moreExpensive} is {rawRatio.toFixed(2)}x more expensive</span></p>
            <p>After cost-of-living adjustment: <span className="font-medium">{rppMoreExpensive} is {adjRatio.toFixed(2)}x more</span></p>
            <p className="text-xs text-gray-500">RPP: SF 115.6, Chicago 103.6 (BLS 2024)</p>
          </div>
        </div>

        {/* Quality indicator */}
        {metric.city_a.quality_label && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Quality Indicator</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">{cityAName}</p>
                <p className="font-medium">{metric.city_a.quality_value ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{cityBName}</p>
                <p className="font-medium">{metric.city_b.quality_value ?? "N/A"}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{metric.city_a.quality_label}</p>
          </div>
        )}

        {/* Sources */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Sources</p>
          <div className="space-y-2 text-sm">
            {[
              { name: cityAName, city: metric.city_a },
              { name: cityBName, city: metric.city_b },
            ].map(({ name, city }) => (
              <div key={name} className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-28 shrink-0">{name}:</span>
                <div>
                  <span className="text-xs text-gray-700">{city.source_name} ({city.source_year})</span>
                  {city.source_url && (
                    <a href={city.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 ml-1 text-purple-600 hover:underline text-xs">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Methodology */}
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="h-3.5 w-3.5 text-gray-400" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Methodology</p>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{metric.methodology_note}</p>
        </div>

        {/* Caveats */}
        {metric.caveats.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Caveats</p>
            </div>
            <ul className="list-disc list-inside space-y-1">
              {metric.caveats.map((c, i) => (
                <li key={i} className="text-xs text-gray-600">{c}</li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
