"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { getWasteCity, type WasteCity } from "./cities";

export type WasteDemoState = "rich" | "quiet" | "degraded";
export type WasteHealth = "healthy" | "warn" | "down";
export type WasteSection = "feed" | "metrics" | "findings" | "reports";

export type WasteUIState = {
  state: WasteDemoState;
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
};

const SECTION_LABEL: Record<WasteSection, string> = {
  feed: "Feed",
  metrics: "Metrics",
  findings: "Findings",
  reports: "Reports",
};

function parseSection(pathname: string): WasteSection {
  const match = pathname.match(/\/admin\/waste\/(feed|metrics|findings|reports)/);
  return (match?.[1] as WasteSection) ?? "feed";
}

function parseState(value: string | null | undefined): WasteDemoState {
  if (value === "quiet" || value === "degraded") return value;
  return "rich";
}

// Per-state multipliers applied to the city's baseline detector/findings counts.
// Rich = the live design-handoff numbers. Quiet = a slow news week. Degraded =
// fewer detectors reporting because something upstream is broken.
function deriveCounts(city: WasteCity, state: WasteDemoState) {
  const baseDetectors = city.detectors ?? 0;
  const baseToday = city.findingsToday ?? 0;

  if (state === "quiet") {
    return {
      detectorsActive: baseDetectors,
      findingsToday: 0,
      findingsThisWeek: Math.max(1, Math.round(baseToday * 1.2)),
      inReview: Math.max(1, Math.round(baseToday * 0.6)),
      confirmed30d: Math.max(2, Math.round(baseToday * 2.4)),
    };
  }

  if (state === "degraded") {
    return {
      detectorsActive: Math.max(0, Math.round(baseDetectors * 0.45)),
      findingsToday: Math.max(0, Math.round(baseToday * 0.4)),
      findingsThisWeek: Math.max(0, Math.round(baseToday * 2)),
      inReview: Math.max(0, Math.round(baseToday * 1.5)),
      confirmed30d: Math.max(0, Math.round(baseToday * 4)),
    };
  }

  return {
    detectorsActive: baseDetectors,
    findingsToday: baseToday,
    findingsThisWeek: baseToday * 4 + 3,
    inReview: Math.max(2, Math.round(baseToday * 1.8)),
    confirmed30d: baseToday * 9 + 4,
  };
}

function deriveHealth(state: WasteDemoState): { health: WasteHealth; healthLabel: string } {
  if (state === "degraded") return { health: "warn", healthLabel: "Pipeline degraded" };
  if (state === "quiet") return { health: "healthy", healthLabel: "All systems normal" };
  return { health: "healthy", healthLabel: "All systems normal" };
}

function deriveLastRunAt(state: WasteDemoState): string {
  if (state === "degraded") return "Last run 47 min ago";
  if (state === "quiet") return "Last run 6 min ago";
  return "Last run 2 min ago";
}

export function useWasteState(): WasteUIState {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const city = getWasteCity(params?.get("city"));
  const state = parseState(params?.get("state"));
  const section = parseSection(pathname);
  const counts = deriveCounts(city, state);
  const { health, healthLabel } = deriveHealth(state);

  return {
    state,
    city,
    section,
    sectionLabel: SECTION_LABEL[section],
    ...counts,
    lastRunAt: deriveLastRunAt(state),
    health,
    healthLabel,
  };
}
