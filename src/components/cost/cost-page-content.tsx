"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  TrendingUp, ArrowRightLeft, Scale, DollarSign,
} from "lucide-react"
import { getCostBasket, type CostBasketResponse, type CostMetricResult } from "@/lib/apiClient"
import { CostMetricCard } from "./cost-metric-card"
import { CostDetailDrawer } from "./cost-detail-drawer"
import Loader from "@/components/Loader"

function formatRatio(ratio: number): string {
  const display = ratio >= 1 ? ratio : 1 / ratio
  return `${display.toFixed(1)}x`
}

interface StatItemProps {
  label: string
  value: string
  subtext: string
  icon: React.ReactNode
  accentColor: string
}

function StatItem({ label, value, subtext, icon, accentColor }: StatItemProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: accentColor }} />
      <CardContent className="p-2 pl-2.5">
        <div className="flex items-center justify-between gap-1">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
            <p className="text-sm font-bold tracking-tight leading-tight">{value}</p>
            <p className="text-[9px] text-muted-foreground">{subtext}</p>
          </div>
          <div className="p-1 rounded bg-gray-100 shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function CostPageContent() {
  const { getAccessTokenSilently, isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0()
  const [useAdjusted, setUseAdjusted] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<CostMetricResult | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data, isLoading, error } = useQuery<CostBasketResponse>({
    queryKey: ["cost", "basket", 1, 3],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      return getCostBasket(token, 1, 3)
    },
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-600">Sign in to view city cost comparisons</p>
        <button
          onClick={() => loginWithRedirect()}
          className="rounded-lg bg-purple-600 px-6 py-2 text-white font-medium hover:bg-purple-700"
        >
          Sign In
        </button>
      </div>
    )
  }

  const handleCardClick = (metric: CostMetricResult) => {
    setSelectedMetric(metric)
    setDrawerOpen(true)
  }

  const cityAName = data?.city_a_name ?? "San Francisco"
  const cityBName = data?.city_b_name ?? "Chicago"

  const allMetrics = data?.categories.flatMap((cat) => cat.metrics) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Header — compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-bold text-gray-900">What Does It Cost?</h1>
            <span className="rounded-full bg-purple-50 border border-purple-200 px-2 py-px text-[10px] font-medium text-purple-700">
              {cityAName}
            </span>
            <span className="text-gray-400 text-[10px]">vs</span>
            <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-px text-[10px] font-medium text-indigo-700">
              {cityBName}
            </span>
            <div className="ml-auto inline-flex rounded-md border border-gray-200 bg-white p-0.5">
              <button
                onClick={() => setUseAdjusted(false)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  !useAdjusted ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Raw
              </button>
              <button
                onClick={() => setUseAdjusted(true)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  useAdjusted ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                COL Adjusted
              </button>
            </div>
          </div>
        </div>

        {/* Stat bar — compact */}
        {isLoading ? (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="h-16 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-4 gap-2 mb-3">
            <StatItem
              label="Basket Index"
              value={`${formatRatio(useAdjusted ? data.rpp_adjusted_basket_index : data.basket_index)} more`}
              subtext={`${data.more_expensive_city} costlier`}
              icon={<TrendingUp className="h-4 w-4 text-indigo-500" />}
              accentColor="#6366f1"
            />
            <StatItem
              label="More Expensive"
              value={data.more_expensive_city}
              subtext={`${data.metrics_available} metrics`}
              icon={<DollarSign className="h-4 w-4 text-red-500" />}
              accentColor="#ef4444"
            />
            <StatItem
              label="Biggest Gap"
              value={data.biggest_gap_metric}
              subtext={`${formatRatio(data.biggest_gap_ratio)} diff`}
              icon={<ArrowRightLeft className="h-4 w-4 text-amber-500" />}
              accentColor="#f59e0b"
            />
            <StatItem
              label="After COL"
              value={`${formatRatio(data.rpp_adjusted_basket_index)} more`}
              subtext="Regional prices adj."
              icon={<Scale className="h-4 w-4 text-purple-500" />}
              accentColor="#8b5cf6"
            />
          </div>
        ) : null}

        {/* Error state */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 mb-3">
            <p className="text-xs text-red-700">Failed to load cost data. Please try again.</p>
          </div>
        )}

        {/* All 14 metric cards — flat 4-col grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
          {allMetrics.map((metric) => (
            <CostMetricCard
              key={metric.metric_key}
              metric={metric}
              cityAName={cityAName}
              cityBName={cityBName}
              useAdjusted={useAdjusted}
              onClick={() => handleCardClick(metric)}
            />
          ))}
        </div>

        {/* Methodology — collapsed by default */}
        <details className="rounded-md border border-gray-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-gray-500 hover:bg-gray-50">
            Methodology and Sources
          </summary>
          <div className="px-3 pb-3 space-y-1.5 text-[10px] text-gray-500">
            <p><strong>Unit cost</strong> = agency/program budget &divide; service volume. Average cost, not marginal.</p>
            <p><strong>COL adjustment</strong> uses BLS Regional Price Parities (2024). SF = 115.6, Chicago = 103.6.</p>
            <p><strong>Sources:</strong> NTD, IMLS, DataSF, Chicago Data Portal, VERA, Silverstein/Civic Federation, SF Controller, WBEZ.</p>
          </div>
        </details>

        {/* Footer */}
        <p className="mt-2 text-center text-[9px] text-gray-400">
          Federal databases + city open data &middot; Unit cost &ne; marginal cost &middot; {data?.data_freshness ?? ""}
        </p>
      </div>

      {/* Detail drawer */}
      <CostDetailDrawer
        metric={selectedMetric}
        cityAName={cityAName}
        cityBName={cityBName}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
