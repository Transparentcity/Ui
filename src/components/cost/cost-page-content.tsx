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
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Methodology and Sources
          </summary>
          <div className="px-4 pb-4 space-y-3 text-xs text-gray-600 border-t border-gray-100 pt-3">
            <div>
              <p className="font-semibold text-gray-700 mb-1">How unit costs are calculated</p>
              <p>Each metric divides a city agency or program budget by the number of times that service was delivered: <strong>unit cost = budget &divide; volume</strong>. This is the average cost to the city, not the marginal cost of one more unit. It includes overhead, personnel, benefits, and administration unless noted otherwise.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Cost-of-living adjustment</p>
              <p>The &ldquo;COL Adjusted&rdquo; toggle divides each cost by the BLS Regional Price Parity index for that metro area, normalizing to the national average. This answers: &ldquo;If local prices were average, would this service still cost more?&rdquo; San Francisco RPP = 115.6 (15.6% above national average), Chicago RPP = 103.6 (3.6% above).</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Data tiers</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li><strong>Federal data</strong> &mdash; Published by standardized federal programs (National Transit Database, IMLS Public Libraries Survey). Audited, comparable across every US city.</li>
                <li><strong>Open data</strong> &mdash; Computed from city Socrata portals by dividing department budgets by operational volume datasets. Updated as portals refresh (daily to weekly).</li>
                <li><strong>Researched</strong> &mdash; Sourced from city controller audits, investigative journalism, or national cost estimates. Updated when new reports are published.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">City vs. county</p>
              <p>San Francisco is a consolidated city-county &mdash; its budget includes services (jails, courts, hospital) that in Chicago are handled by Cook County. For the unit costs shown here, all compared services are provided by identifiable city-level agencies in both places, so the city-county structure does not distort the comparison.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Card colors</p>
              <p>The colored left border on each card indicates the service category: <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 align-middle mx-0.5" /> Getting Around, <span className="inline-block w-2 h-2 rounded-sm bg-purple-500 align-middle mx-0.5" /> Public Safety, <span className="inline-block w-2 h-2 rounded-sm bg-amber-500 align-middle mx-0.5" /> Housing &amp; Health, <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 align-middle mx-0.5" /> City Services, <span className="inline-block w-2 h-2 rounded-sm bg-pink-500 align-middle mx-0.5" /> Your Government.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Sources</p>
              <p>National Transit Database (transit) &middot; IMLS Public Libraries Survey (libraries) &middot; DataSF and Chicago Data Portal (budget actuals, 311 cases, permits, citations, arrests, fire incidents, employee compensation) &middot; VERA Institute of Justice (policing costs) &middot; Silverstein / Civic Federation (Chicago fully loaded police costs) &middot; SF Controller (shelter audit, March 2025) &middot; WBEZ / Chicago Sun-Times (Cook County jail investigation) &middot; BLS / BEA Regional Price Parities (cost-of-living adjustment).</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Important caveats</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>Unit cost &ne; marginal cost. Reducing one arrest does not save $50,700 &mdash; most costs are fixed (salaries, facilities).</li>
                <li>Some metrics use national average estimates where city-specific budget isolation is not possible (e.g., pothole repair cost).</li>
                <li>Federal data sources (NTD, IMLS) lag 1&ndash;2 years by design. Open data metrics use the most recent fiscal year available.</li>
                <li>Click any card for full calculation details, source links, and metric-specific caveats.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-2">Per-metric data sources and calculations</p>
              <div className="space-y-3">

                <div className="border-l-2 border-emerald-400 pl-2.5">
                  <p className="font-medium text-gray-700">Transit Ride &mdash; $8.97 (SF) vs $6.20 (CHI)</p>
                  <p>Published by the <strong>National Transit Database</strong> (FTA). Operating expense &divide; unlinked passenger trips. This is the full cost to the transit agency per boarding, not the fare. SF Muni FY2022; CTA FY2024. No calculation needed &mdash; NTD publishes the per-trip number directly.</p>
                </div>

                <div className="border-l-2 border-purple-400 pl-2.5">
                  <p className="font-medium text-gray-700">Arrest &mdash; $50,700 (SF) vs $65,500 (CHI)</p>
                  <p><strong>SF:</strong> SFPD total department spending from DataSF budget actuals (<code>bpnb-jwfb</code>, dept = &ldquo;Police&rdquo;) &divide; arrests from police incident reports (<code>wg3w-h783</code>, filtered to resolution = &ldquo;Cite or Arrest Adult&rdquo;). <strong>CHI:</strong> Fully loaded police cost of $3.8B (Silverstein / Civic Federation study, Nov 2024 &mdash; includes $1.1B pensions, $212M health insurance, $42.5M legal settlements) &divide; 58,074 arrests from CPD arrest dataset (<code>dpt3-jri9</code>). &ldquo;Fully loaded&rdquo; means all costs attributable to policing, not just the official CPD budget.</p>
                </div>

                <div className="border-l-2 border-purple-400 pl-2.5">
                  <p className="font-medium text-gray-700">911 Call &mdash; $55 (SF) vs $38 (CHI)</p>
                  <p><strong>SF:</strong> Department of Emergency Management spending (<code>bpnb-jwfb</code>, dept = &ldquo;Emergency Management&rdquo;) &divide; distinct dispatched calls (<code>nuek-vuh3</code>, COUNT DISTINCT call_number). <strong>CHI:</strong> Office of Emergency Management &amp; Communications (OEMC) budget &divide; dispatched calls. Includes call-taking, dispatch, and communications infrastructure.</p>
                </div>

                <div className="border-l-2 border-purple-400 pl-2.5">
                  <p className="font-medium text-gray-700">Fire Response &mdash; $2,800 (SF) vs $1,500 (CHI)</p>
                  <p><strong>SF:</strong> Fire Department spending (<code>bpnb-jwfb</code>, dept = &ldquo;Fire Department&rdquo;) &divide; distinct fire incidents (<code>wr8u-xric</code>). Includes suppression, EMS, prevention, and administration. <strong>CHI:</strong> CFD budget from appropriations (<code>axxr-vais</code>, dept = &ldquo;FIRE&rdquo;) &divide; incident volume from OEMC estimates. Chicago fire incident data is not on Socrata; volume is estimated from department reports.</p>
                </div>

                <div className="border-l-2 border-amber-400 pl-2.5">
                  <p className="font-medium text-gray-700">Shelter Bed-Night &mdash; $119.21 (SF) vs $35 (CHI)</p>
                  <p><strong>SF:</strong> Published directly by the SF Controller in March 2025 (<em>Assessment of the San Francisco Shelter System</em>). $119.21 is the per-filled-bed-per-night cost for adult congregate shelters; $176M total across 3,228 beds in 33 shelters. Range: under $100 to over $300/night depending on facility. <strong>CHI:</strong> $35/night is the DFSS contract rate for city-owned and city-leased New Arrivals shelters (April 2024 RFP). True all-in cost is higher but not published. Chicago bed utilization data from <code>vg8w-2w9y</code>.</p>
                </div>

                <div className="border-l-2 border-amber-400 pl-2.5">
                  <p className="font-medium text-gray-700">Naloxone Dose &mdash; $28 (SF) vs $25 (CHI)</p>
                  <p>Estimated cost per dose based on public health department program expenditures and distribution volume. <strong>SF:</strong> DPH naloxone distribution contracts (FY2024). <strong>CHI:</strong> CDPH naloxone program (FY2024). Includes procurement ($2&ndash;$75 per kit depending on channel), distribution logistics, and training. One dose preventing an overdose saves an estimated $1,000&ndash;$1,500 in emergency response costs.</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Building Permit &mdash; $3,500 (SF) vs $1,000 (CHI)</p>
                  <p><strong>SF:</strong> Department of Building Inspection spending (<code>bpnb-jwfb</code>, dept = &ldquo;Building Inspection&rdquo;) &divide; distinct permits (<code>i98e-djp9</code>). DBI is fee-supported &mdash; permit fees are set at cost-recovery levels under California law. <strong>CHI:</strong> Buildings Department budget (<code>axxr-vais</code>, dept = &ldquo;BUILDINGS&rdquo;) &divide; permits issued (<code>ydr8-5enu</code>). Permit mix (simple alteration vs new construction) significantly affects the average.</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Parking Ticket &mdash; $55 (SF) vs $25 (CHI)</p>
                  <p><strong>SF:</strong> SFMTA parking enforcement division budget &divide; 1,847,467 citations in 2025 (<code>ab4h-6ztd</code>). Covers personnel (354 parking control officers), vehicles, handhelds, and supervision. Does not include adjudication or collections. <strong>CHI:</strong> Enforcement budget &divide; ~2.1M citations (ProPublica / Illinois Policy Institute volume estimates). Chicago citation data is not on Socrata.</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Graffiti Removal &mdash; $240 (SF) vs $43 (CHI)</p>
                  <p><strong>SF:</strong> DPW graffiti abatement budget ($20M+) &divide; 311 graffiti service requests (<code>vw6y-z8j6</code>, category = &ldquo;Graffiti&rdquo;). <strong>CHI:</strong> Graffiti Blasters program ($4.6M) &divide; 311 graffiti removal requests (<code>v6vf-nfxy</code>, sr_type = &ldquo;Graffiti Removal Request&rdquo;). The 5.6x gap is partly explained by SF&rsquo;s higher labor costs (RPP 115.6 vs 103.6).</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Library Visit &mdash; $26 (SF) vs $11 (CHI)</p>
                  <p>Published by the <strong>IMLS Public Libraries Survey</strong> (FY2022). Library operating expenditures &divide; annual visits. IMLS covers 9,000+ library systems nationwide with standardized data. SF Public Library serves ~6 million visits/year; Chicago Public Library ~9 million. Digital visits may not be counted consistently across systems.</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Pothole Filled &mdash; $150 (SF) vs $150 (CHI)</p>
                  <p>Estimated from <strong>national average repair costs</strong> ($30&ndash;$50 for a hot-asphalt patch, $100&ndash;$400 for a full repair). Pothole repair budgets are embedded in street maintenance and cannot be isolated as a separate line item in either city. Volume: SF from 311 street-defect cases (<code>vw6y-z8j6</code>, category = &ldquo;Street Defects&rdquo;); CHI from the pothole tracker (<code>wqdh-9gek</code>). Chicago crews often fill all potholes on a block per request.</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Food Inspection &mdash; $500 (SF) vs $350 (CHI)</p>
                  <p><strong>SF:</strong> Estimated from DPH fee schedule ($251/hour for inspector time, FY2025&ndash;26) &times; ~2-hour average inspection. Volume from food inspection dataset (<code>ramz-vejd</code>). <strong>CHI:</strong> CDPH budget estimate &divide; 22,165 inspections in 2025 (<code>4ijn-s7e5</code>). Food inspection budget is part of the larger Environmental Health division in both cities.</p>
                </div>

                <div className="border-l-2 border-indigo-400 pl-2.5">
                  <p className="font-medium text-gray-700">Stray Animal &mdash; $1,800 (SF) vs $500 (CHI)</p>
                  <p><strong>SF:</strong> SFACC department budget ($12.3M) &divide; 6,872 animal intakes (dogs, cats, other). <strong>CHI:</strong> CACC budget ($7.52M) &divide; ~15,000 intakes. Both are standalone city departments. Cost per animal varies dramatically by outcome &mdash; a same-day return-to-owner is much cheaper than weeks of shelter care plus veterinary treatment before adoption. Live release rate: SF ~88%, CHI ~86%.</p>
                </div>

                <div className="border-l-2 border-pink-400 pl-2.5">
                  <p className="font-medium text-gray-700">Average Employee Compensation &mdash; $163,426 (SF) vs $100,000 (CHI)</p>
                  <p><strong>SF:</strong> Average total compensation (salary + overtime + benefits) across all city employees, from DataSF employee compensation dataset (<code>88g8-5mnd</code>, FY2025). Includes part-time and seasonal workers, which lowers the average; median full-time is $175,378. <strong>CHI:</strong> Average salary from Chicago Data Portal (<code>xzkq-xp2w</code>) &times; 1.4 benefits multiplier (estimated). Benefits multiplier varies by position and union contract. Both figures reflect local cost of living.</p>
                </div>

              </div>
            </div>
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
