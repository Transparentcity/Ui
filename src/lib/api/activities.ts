import type { ActivityReport } from "../activities";
import { request } from "./request";

// Activities report-back: the signed-in resident's own log of what they did.
// Platform: api/routes/activities.py. Stored privately; each person sees only theirs.

function reportsPath(city: string, activity: string): string {
  return `/api/activities/${encodeURIComponent(city)}/${encodeURIComponent(activity)}/reports`;
}

export type NewActivityReport = {
  path_key: string;
  action: string;
  request_id: string;
  action_date: string;
  area_slug: string;
  note: string;
};

export async function listMyActivityReports(
  city: string,
  activity: string,
  token: string
): Promise<ActivityReport[]> {
  const out = await request<{ reports: ActivityReport[] }>(reportsPath(city, activity), "GET", undefined, token);
  return out.reports;
}

export function createActivityReport(
  city: string,
  activity: string,
  report: NewActivityReport,
  token: string
): Promise<ActivityReport> {
  return request<ActivityReport>(reportsPath(city, activity), "POST", report, token);
}

/**
 * A plain sentence for a failed report call. For 4xx the platform's own
 * `detail` (e.g. "the date cannot be in the future"); otherwise a fixed line,
 * never the raw response body.
 */
export function reportErrorMessage(err: unknown): string {
  const e = err as { status?: number; message?: string } | null;
  const status = e?.status ?? 0;
  if (status >= 400 && status < 500) {
    const body = (e?.message ?? "").replace(/^\d{3}\s+/, "");
    try {
      const detail = (JSON.parse(body) as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail) return detail.charAt(0).toUpperCase() + detail.slice(1);
    } catch {
      // not JSON: fall through
    }
  }
  return "Could not save. Try again.";
}
