"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { getWasteCity, type WasteCity } from "./cities";
import {
  useWasteAdminCities,
  useWasteAdminReadout,
} from "@/lib/hooks/useWasteAdmin";
import type {
  WasteAdminCityRow,
  WasteAdminReadoutKPI,
} from "@/lib/api/wasteAdmin";

export type WasteHealth = "healthy" | "warn" | "down";
export type WasteSection = "feed" | "metrics" | "findings" | "reports" | "methodology";

export type WasteUIState = {
  city: WasteCity;
  section: WasteSection;
  sectionLabel: string;
  detectorsActive: number;
  findingsToday: number;
  findingsThisWeek: number;
  inReview: number;
  confirmed30d: number;
  lastRunAt: string;
  health: WasteHealth;
  healthLabel: string;
  failingCount: number;
  failingDetectorId: string | null;
  isLoading: boolean;
};

const SECTION_LABEL: Record<WasteSection, string> = {
  feed: "Feed",
  metrics: "Metrics",
  findings: "Findings",
  reports: "Reports",
  methodology: "Methodology",
};

function parseSection(pathname: string): WasteSection {
  // Order matters: /metric-values is the metrics page; /metrics is the detector
  // catalog (labeled "Methodology" in the nav).
  if (/\/admin\/waste\/metric-values/.test(pathname)) return "metrics";
  if (/\/admin\/waste\/metrics/.test(pathname)) return "methodology";
  const match = pathname.match(/\/admin\/waste\/(feed|findings|reports)/);
  return (match?.[1] as WasteSection) ?? "feed";
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function relativeRunLabel(iso: string | null | undefined): string {
  if (!iso) return "Last run —";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Last run —";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Last run just now";
  if (min < 60) return `Last run ${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Last run ${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `Last run ${day} day${day === 1 ? "" : "s"} ago`;
}

function deriveHealth(
  cityRow: WasteAdminCityRow | undefined
): { health: WasteHealth; healthLabel: string } {
  if (!cityRow) return { health: "healthy", healthLabel: "All systems normal" };
  const failing = cityRow.health?.failing_count ?? 0;
  if (failing <= 0) return { health: "healthy", healthLabel: "All systems normal" };
  return {
    health: failing > 3 ? "down" : "warn",
    healthLabel: cityRow.health?.message || "Pipeline degraded",
  };
}

function kpiValue(kpis: WasteAdminReadoutKPI[] | undefined, key: string): number {
  const m = kpis?.find(k => k.key === key);
  return m ? m.value : 0;
}

export function useWasteState(): WasteUIState {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const city = getWasteCity(params?.get("city"));
  const section = parseSection(pathname);

  const backendSlug = slugifyName(city.name);
  const citiesQ = useWasteAdminCities();
  const readoutQ = useWasteAdminReadout(backendSlug);

  const cityRow = citiesQ.data?.find(c => c.slug === backendSlug);
  const kpis = readoutQ.data?.kpis;
  const { health, healthLabel } = deriveHealth(cityRow);

  return {
    city,
    section,
    sectionLabel: SECTION_LABEL[section],
    detectorsActive: kpiValue(kpis, "detectors_active"),
    findingsToday: kpiValue(kpis, "findings_today"),
    findingsThisWeek: kpiValue(kpis, "findings_week"),
    inReview: kpiValue(kpis, "findings_in_review"),
    confirmed30d: kpiValue(kpis, "confirmed_30d"),
    lastRunAt: relativeRunLabel(cityRow?.last_run_at),
    health,
    healthLabel,
    failingCount: cityRow?.health?.failing_count ?? 0,
    failingDetectorId: cityRow?.health?.failing_detector_id ?? null,
    isLoading: citiesQ.isLoading || readoutQ.isLoading,
  };
}
