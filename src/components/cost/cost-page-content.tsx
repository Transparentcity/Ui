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
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentColor }} />
      <CardContent className="p-3 pl-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{subtext}</p>
          </div>
          <div className="p-2 rounded-lg bg-gray-100">{icon}</div>
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">What Does It Cost?</h1>
            <span className="rounded-full bg-purple-50 border border-purple-200 px-3 py-0.5 text-xs font-medium text-purple-700">
              {cityAName}
            </span>
            <span className="text-gray-400 text-sm">vs</span>
            <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-0.5 text-xs font-medium text-indigo-700">
              {cityBName}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            A side-by-side look at the price of city services — from transit rides to arrests to shelter beds.
          </p>
        </div>

        {/* Stat bar */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="h-24 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatItem
              label="Basket Index"
              value={`${formatRatio(useAdjusted ? data.rpp_adjusted_basket_index : data.basket_index)} more`}
              subtext={`${data.more_expensive_city} is costlier overall`}
              icon={<TrendingUp className="h-5 w-5 text-indigo-500" />}
              accentColor="#6366f1"
            />
            <StatItem
              label="More Expensive"
              value={data.more_expensive_city}
              subtext={`across ${data.metrics_available} metrics compared`}
              icon={<DollarSign className="h-5 w-5 text-red-500" />}
              accentColor="#ef4444"
            />
            <StatItem
              label="Biggest Gap"
              value={`${data.biggest_gap_metric}`}
              subtext={`${formatRatio(data.biggest_gap_ratio)} difference`}
              icon={<ArrowRightLeft className="h-5 w-5 text-amber-500" />}
              accentColor="#f59e0b"
            />
            <StatItem
              label="After Cost-of-Living"
              value={`${formatRatio(data.rpp_adjusted_basket_index)} more`}
              subtext="Adjusted for regional prices (BLS RPP)"
              icon={<Scale className="h-5 w-5 text-purple-500" />}
              accentColor="#8b5cf6"
            />
          </div>
        ) : null}

        {/* Toggle */}
        <div className="flex items-center gap-2 mb-6">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setUseAdjusted(false)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !useAdjusted ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Raw
            </button>
            <button
              onClick={() => setUseAdjusted(true)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                useAdjusted ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Cost-of-Living Adjusted
            </button>
          </div>
          {useAdjusted && (
            <span className="text-[10px] text-gray-400">Regional Price Parity: SF 115.6, Chicago 103.6 (BLS 2024)</span>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
            <p className="text-sm text-red-700">Failed to load cost data. Please try again.</p>
          </div>
        )}

        {/* Category sections */}
        {data?.categories.map((cat) => (
          <div key={cat.category} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">{cat.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cat.metrics.map((metric) => (
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
          </div>
        ))}

        {/* Methodology */}
        <details className="mt-8 rounded-lg border border-gray-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Methodology and Sources
          </summary>
          <div className="px-5 pb-4 space-y-2 text-xs text-gray-600">
            <p><strong>Unit cost</strong> = agency/program budget &divide; service volume. This is the average cost, not the marginal cost of one additional unit.</p>
            <p><strong>Cost-of-living adjustment</strong> uses BLS Regional Price Parities (2024). SF metro = 115.6, Chicago metro = 103.6, national = 100.</p>
            <p><strong>Data tiers:</strong> FEDERAL DATA = published by NTD or IMLS (standardized, audited). OPEN DATA = computed from city Socrata portals. RESEARCHED = from city controller reports or investigative journalism.</p>
            <p><strong>City vs county:</strong> SF is a consolidated city-county. Most metrics compare city-level agencies directly. Jail and K-12 are flagged where the provider differs.</p>
            <p><strong>Sources:</strong> National Transit Database, NCES F-33 Survey, IMLS Public Libraries Survey, DataSF, Chicago Data Portal, VERA Institute, Silverstein/Civic Federation, SF Controller, WBEZ/Sun-Times.</p>
          </div>
        </details>

        {/* Footer */}
        <p className="mt-6 text-center text-[10px] text-gray-400">
          Data: Federal databases + city open data portals &middot; Unit cost &ne; marginal cost &middot; {data?.data_freshness ?? ""}
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
