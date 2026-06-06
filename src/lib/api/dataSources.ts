// Admin-scoped waste data-source (federal adapter) endpoints.
// Backend: /api/admin/waste/data-sources* in
// src/transparentcity/api/routes/waste_admin.py. Continuous adapter health
// state lives in the backend `adapter_health` table. This module mirrors the
// pydantic response models so the UI can fetch live data without parsing.

import { request } from "./request";

export interface WasteAdminDataSource {
  adapter_key: string;
  display_name: string;
  adapter_type: "api" | "pdf";
  default_refresh_interval_hours: number;
  circuit_state: string;
  last_check_at: string | null;
  last_good_at: string | null;
  last_failure_at?: string | null;
  last_latency_ms?: number | null;
  last_error?: string | null;
  consecutive_failures?: number;
  total_checks?: number;
  total_failures?: number;
}

export interface WasteAdminDataSourceList {
  items: WasteAdminDataSource[];
  total: number;
}

export function listWasteAdminDataSources(
  token: string
): Promise<WasteAdminDataSourceList> {
  return request<WasteAdminDataSourceList>(
    "/api/admin/waste/data-sources",
    "GET",
    undefined,
    token
  );
}

export function refreshWasteAdminDataSource(
  token: string,
  adapterKey: string
): Promise<WasteAdminDataSource> {
  return request<WasteAdminDataSource>(
    `/api/admin/waste/data-sources/${adapterKey}/refresh`,
    "POST",
    {},
    token
  );
}

export function resetWasteAdminDataSource(
  token: string,
  adapterKey: string
): Promise<WasteAdminDataSource> {
  return request<WasteAdminDataSource>(
    `/api/admin/waste/data-sources/${adapterKey}/reset`,
    "POST",
    {},
    token
  );
}

export function runWasteAdminDataSourceHealthCheck(
  token: string
): Promise<WasteAdminDataSourceList> {
  return request<WasteAdminDataSourceList>(
    "/api/admin/waste/data-sources/health-check",
    "POST",
    {},
    token
  );
}
