export type ReadinessDatasetCandidate = {
  dataset_id?: string
  external_id?: string
  title?: string
  url?: string
  landing_page_url?: string
  score?: number
  category?: string | null
  publishing_department?: string | null
}

export type CityReadinessDatasetMatch = {
  template_id: number
  template_key: string
  template_name: string
  open_data_available: boolean
  best_match: ReadinessDatasetCandidate | null
  top_matches: ReadinessDatasetCandidate[]
}

export type CityCoreOpenDataCoverage = {
  templates_total: number
  templates_with_open_data: number
  open_data_ratio: number
  dataset_matches: CityReadinessDatasetMatch[]
  note?: string
}

export type ExpandedDashboardDatasetMatch = {
  metric_key: string
  metric_label: string
  group: string
  keywords: string[]
  open_data_available: boolean
  best_match: ReadinessDatasetCandidate | null
  top_matches: ReadinessDatasetCandidate[]
}

export type CityExpandedDashboardCoverage = {
  metrics_total: number
  metrics_with_open_data: number
  open_data_ratio: number
  dataset_matches: ExpandedDashboardDatasetMatch[]
  note?: string
}

export type CityReadinessCity = {
  id: number
  name: string
  state: string
  country?: string
  population?: number | null
  main_domain?: string | null
  main_portal_url?: string | null
  is_active?: boolean
}

export type CityReadinessResult = {
  city: CityReadinessCity
  ease_to_structure_score_0_100: number
  ease_to_structure_score_v2_0_100: number
  core_open_data_coverage?: CityCoreOpenDataCoverage
  expanded_dashboard_coverage?: CityExpandedDashboardCoverage
  missing_templates?: Array<{
    template_id: number
    template_key: string
    template_name: string
    category?: string | null
    subcategory?: string | null
  }>
  foia_needed?: unknown[]
}

export type CityReadinessReport = {
  generated_at: string
  baselines?: unknown
  rankings?: unknown
  cities: CityReadinessResult[]
}

