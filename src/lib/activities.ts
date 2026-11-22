import { getApiBaseUrl } from "./apiBase";

/**
 * Activities ("what you can do about it") are dark until launch.
 * Pairs with ACTIVITIES_ENABLED on the platform. Spec: platform docs/activities/SPEC.md.
 */
export function activitiesEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_ACTIVITIES_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export const ACTIVITIES_LABEL = "Activities";

// Mirrors platform services/activities/service.py build_payload().
export type ActivitySource = { title: string; url: string; checked: string; publisher: string };
export type ActivityRuleStatement = { text: string; source: ActivitySource };
export type ActivityStep = { text: string; link_label: string; link_url: string };
export type ActivityCostLine = { label: string; value: string; source: string; reverified: boolean };
export type ActivityPath = {
  key: "report" | "repair_day";
  title: string;
  who: string;
  legal_note: string;
  steps: ActivityStep[];
  cost_time: ActivityCostLine[];
};
export type ActivityTarget = {
  rank: number;
  address: string;
  lat: number | null;
  lon: number | null;
  requests: number;
  request_ids: string[];
  statuses: string[];
  first_reported: string;
  days_open: number;
};
export type ActivityShare = { count: number; of: number; pct: number | null };
export type ActivityMedian = { days: number | null; closed_requests: number };
export type ActivityPayload = {
  city: string;
  activity: string;
  title: string;
  area: { kind: "city" | "district" | "neighborhood"; slug: string; label: string; district_label?: string };
  areas: {
    neighborhoods: { slug: string; label: string }[];
    districts: { slug: string; label: string }[];
  };
  data_source: {
    name: string;
    dataset_id: string;
    url: string;
    categories: string[];
    unresolved_statuses: string[];
    portal_updated: string | null;
  };
  figures: {
    as_of: string;
    data_through: string | null;
    data_from: string | null;
    unresolved: { total: number; by_status: Record<string, number> };
    locations: number;
    group_radius_m: number;
    open_over_one_year: { area: ActivityShare; city: ActivityShare };
    median_days_to_close: {
      area: ActivityMedian;
      city: ActivityMedian;
      bulk_closed_excluded_city: number;
      note: string;
    };
    oldest_unresolved: {
      request_id: string;
      address: string;
      status: string;
      opened: string;
      days_open: number;
    } | null;
    most_reported_location: { address: string; unresolved_requests: number; oldest_opened: string } | null;
    targets: ActivityTarget[];
  };
  what_happened: string[];
  why_it_matters: string;
  paths: ActivityPath[];
  withheld_paths: string[];
  rules: {
    who_fixes: string;
    resident_repair_verified: boolean;
    unverified_note: string | null;
    statements: ActivityRuleStatement[];
    background: ActivityRuleStatement[];
    safety: string[];
  };
  email_draft: { subject: string; body: string };
  report_back: { summary: string; fields: string[]; watch: string; enabled: boolean };
  sources: ActivitySource[];
  only_path_a: boolean;
};

export type ActivityListItem = { slug: string; title: string; short_title: string; example_area: string };

export class ActivityFetchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
    // The platform caches portal data for 6 hours; 10 minutes here is plenty.
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new ActivityFetchError(`API GET ${path} failed: ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Area value: neighborhood slug (clinton), council district (d2), or empty for citywide. */
export function normalizeArea(raw: string | string[] | undefined): string {
  const v = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(v) ? v : "";
}

export function getPublicActivity(city: string, activity: string, area: string): Promise<ActivityPayload> {
  const q = area ? `?area=${encodeURIComponent(area)}` : "";
  return getJson<ActivityPayload>(
    `/api/activities/public/${encodeURIComponent(city)}/${encodeURIComponent(activity)}${q}`
  );
}

export function listPublicActivities(city: string): Promise<{ city: string; activities: ActivityListItem[] }> {
  return getJson(`/api/activities/public/${encodeURIComponent(city)}`);
}

/** mailto: with no recipient. The resident picks who to send it to; we send nothing. */
export function buildMailto(draft: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ranked target list as CSV (the spec's block 4 download). */
export function targetsCsv(targets: ActivityTarget[]): string {
  const head = ["rank", "address", "requests", "request_ids", "statuses", "first_reported", "days_open", "lat", "lon"];
  const rows = targets.map((t) =>
    [
      t.rank,
      t.address,
      t.requests,
      t.request_ids.join(" "),
      t.statuses.join(" "),
      t.first_reported,
      t.days_open,
      t.lat,
      t.lon,
    ]
      .map(csvCell)
      .join(",")
  );
  return [head.join(","), ...rows].join("\n") + "\n";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDays(v: number | null): string {
  if (v == null) return "no data";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
