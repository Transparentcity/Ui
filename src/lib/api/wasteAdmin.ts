// Admin-scoped waste read endpoints. Backend: /api/admin/waste/* in
// src/transparentcity/api/routes/waste_admin.py. This module mirrors the
// pydantic response models so the UI can fetch live data without parsing.

import { request } from "./request";

export type WasteAdminDetectorKind = "metric" | "bespoke";

export interface WasteAdminCityHealth {
  failing_count: number;
  failing_detector_id: string | null;
  message: string | null;
}

export interface WasteAdminCityRow {
  id: number;
  slug: string;
  name: string;
  flag: string | null;
  state: string | null;
  detectors: number;
  launched: boolean;
  status: string;
  last_run_at: string | null;
  health: WasteAdminCityHealth;
  configured: boolean;
}

export interface WasteAdminDetectorRow {
  id: string;
  name: string;
  kind: WasteAdminDetectorKind;
  category: string;
  severity: string;
  report_key: string | null;
  blurb: string | null;
  methodology_md: string | null;
  standards_basis: string | null;
  historical_anchor_md: string | null;
  available: boolean;
}

export type WasteAdminPeriod = "today" | "week" | "month" | "all";
export type WasteAdminSeverityFilter = "all" | "high" | "med";

export interface WasteAdminFindingRow {
  id: number;
  finding_id: string;
  detector_key: string;
  detector_name: string | null;
  category: string;
  subcategory: string | null;
  severity: string;
  confidence: string | null;
  entity_name: string | null;
  department: string | null;
  description: string | null;
  headline: string | null;
  amount: number | null;
  estimated_dollar_impact: number | null;
  report_key: string | null;
  finding_status: string;
  is_new: boolean;
  created_at: string | null;
}

export interface WasteAdminFindingDetail extends WasteAdminFindingRow {
  narrative: string | null;
  finding_report: string | null;
  caveat: string | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  fiscal_year: number | null;
  evidence: Record<string, unknown>;
}

export interface WasteAdminReadoutKPI {
  key: string;
  label: string;
  value: number;
  period_days: number | null;
}

export interface WasteAdminReadoutResponse {
  city: string;
  generated_at: string;
  kpis: WasteAdminReadoutKPI[];
}

export interface WasteAdminReportRow {
  slug: string;
  title: string;
  period: string;
  findings_count: number;
  estimated_exposure: number;
  materiality: number | null;
  updated_at: string | null;
  status: string;
}

export interface WasteAdminReportDetail extends WasteAdminReportRow {
  blurb: string;
  methodology_md: string | null;
  caveats_md: string | null;
  standards_basis: string | null;
  findings: WasteAdminFindingRow[];
}

export interface WasteAdminSeymourCluster {
  id: string;
  title: string;
  finding_ids: number[];
  department: string | null;
  composite_risk: number | null;
  accept_url: string;
  snooze_url: string;
  dismiss_url: string;
}

export interface WasteAdminSeymourSuggestion {
  entity_type: string;
  entity_name: string;
  score_delta: number;
  last_scored_at: string | null;
}

export interface WasteAdminSeymourFeed {
  city: string;
  read_of_the_day: string;
  clusters: WasteAdminSeymourCluster[];
  suggested_investigations: WasteAdminSeymourSuggestion[];
}

export function listWasteAdminCities(
  token: string,
  timeoutMs?: number,
): Promise<WasteAdminCityRow[]> {
  return request<WasteAdminCityRow[]>(
    "/api/admin/waste/cities",
    "GET",
    undefined,
    token,
    timeoutMs ? { timeoutMs } : undefined,
  );
}

export function listWasteAdminDetectors(
  token: string,
  citySlug: string
): Promise<WasteAdminDetectorRow[]> {
  const q = new URLSearchParams({ city: citySlug });
  return request<WasteAdminDetectorRow[]>(
    `/api/admin/waste/detectors?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function listWasteAdminFindings(
  token: string,
  params: {
    city: string;
    period?: WasteAdminPeriod;
    filter?: WasteAdminSeverityFilter;
    limit?: number;
  }
): Promise<WasteAdminFindingRow[]> {
  const q = new URLSearchParams({ city: params.city });
  if (params.period) q.set("period", params.period);
  if (params.filter) q.set("filter", params.filter);
  if (params.limit != null) q.set("limit", String(params.limit));
  return request<WasteAdminFindingRow[]>(
    `/api/admin/waste/findings?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteAdminFinding(
  token: string,
  findingId: number,
  citySlug: string
): Promise<WasteAdminFindingDetail> {
  const q = new URLSearchParams({ city: citySlug });
  return request<WasteAdminFindingDetail>(
    `/api/admin/waste/findings/${findingId}?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteAdminReadout(
  token: string,
  citySlug: string
): Promise<WasteAdminReadoutResponse> {
  const q = new URLSearchParams({ city: citySlug });
  return request<WasteAdminReadoutResponse>(
    `/api/admin/waste/readout?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function listWasteAdminReports(
  token: string,
  citySlug: string
): Promise<WasteAdminReportRow[]> {
  const q = new URLSearchParams({ city: citySlug });
  return request<WasteAdminReportRow[]>(
    `/api/admin/waste/reports?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteAdminReport(
  token: string,
  slug: string,
  citySlug: string
): Promise<WasteAdminReportDetail> {
  const q = new URLSearchParams({ city: citySlug });
  return request<WasteAdminReportDetail>(
    `/api/admin/waste/reports/${encodeURIComponent(slug)}?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteAdminSeymourFeed(
  token: string,
  citySlug: string
): Promise<WasteAdminSeymourFeed> {
  const q = new URLSearchParams({ city: citySlug });
  return request<WasteAdminSeymourFeed>(
    `/api/admin/waste/seymour/feed?${q.toString()}`,
    "GET",
    undefined,
    token
  );
}
