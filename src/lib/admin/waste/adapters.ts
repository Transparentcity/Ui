// Maps backend /api/admin/waste/* response shapes onto the legacy fixture
// types that the existing components were authored against. Keeping the
// component prop contracts unchanged lets us swap data sources without
// touching every render path.

import type {
  Detector,
  DetectorCategoryId,
  Finding,
  Report,
  ReportStatus,
  SeymourData,
} from "@/lib/wasteFixtures";
import type { SeverityLevel, FindingStatus } from "@/components/admin/waste/primitives";
import type {
  WasteAdminDetectorRow,
  WasteAdminFindingRow,
  WasteAdminReportDetail,
  WasteAdminReportRow,
  WasteAdminSeymourFeed,
} from "@/lib/api/wasteAdmin";

export function severityFromBackend(value: string | null | undefined): SeverityLevel {
  const v = (value || "").toLowerCase();
  if (v === "critical" || v === "high") return "high";
  if (v === "medium" || v === "med") return "med";
  return "low";
}

export function statusFromBackend(value: string | null | undefined): FindingStatus {
  const v = (value || "").toLowerCase();
  if (v === "in_review" || v === "in-review" || v === "review") return "in-review";
  if (v === "confirmed" || v === "resolved") return "confirmed";
  if (v === "dismissed" || v === "false_positive") return "dismissed";
  return "open";
}

const CATEGORY_KEYWORDS: ReadonlyArray<[RegExp, DetectorCategoryId]> = [
  [/(vendor|procurement|contract|invoice)/i, "vendor"],
  [/(payroll|pension|salary|overtime)/i, "payroll"],
  [/(benefit|claim|workers[\s-]?comp|\bwc\b)/i, "benefits"],
  [/(permit|inspection|inspector)/i, "permits"],
  [/(p.?card|expense|card)/i, "cards"],
  [/(benford|statistic|anomaly|convergence|integrity)/i, "stat"],
];

export function categoryFromBackend(
  detector: WasteAdminDetectorRow | { detector_key?: string; category?: string }
): DetectorCategoryId {
  const haystack = `${(detector as WasteAdminDetectorRow).id ?? ""} ${
    detector.category ?? ""
  } ${(detector as WasteAdminDetectorRow).name ?? ""} ${
    (detector as { detector_key?: string }).detector_key ?? ""
  }`;
  for (const [re, id] of CATEGORY_KEYWORDS) {
    if (re.test(haystack)) return id;
  }
  return "vendor";
}

function lastTunedLabel(): string {
  // Backend doesn't expose a per-detector tuning timestamp yet. Use a stable
  // current-quarter label so the row layout doesn't collapse.
  const d = new Date();
  return d.toLocaleString("default", { month: "short", year: "numeric" });
}

function detectorPlain(det: WasteAdminDetectorRow): string {
  return det.blurb || det.methodology_md || det.name;
}

function buildHistorical(det: WasteAdminDetectorRow): Detector["historical"] {
  const md = det.historical_anchor_md || "";
  const firstLine = md.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? "";
  return {
    case: firstLine || (det.standards_basis ?? "Standards-anchored detector"),
    summary: md || (det.methodology_md ?? det.name),
    lesson: det.standards_basis || "Confirmed by historical case anchoring.",
  };
}

export function adaptDetector(det: WasteAdminDetectorRow): Detector {
  return {
    id: det.id,
    name: det.name,
    category: categoryFromBackend(det),
    plain: detectorPlain(det),
    historical: buildHistorical(det),
    sources: det.standards_basis ? [det.standards_basis] : [],
    severity: severityFromBackend(det.severity),
    lastTuned: lastTunedLabel(),
    precision: 0,
  };
}

function formatAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function parseConfidence(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  // Accept either 0–1 or 0–100 inputs; normalize to 0–100.
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function adaptFinding(f: WasteAdminFindingRow): Finding {
  const subjectParts: string[] = [];
  if (f.entity_name) subjectParts.push(f.entity_name);
  if (f.subcategory) subjectParts.push(f.subcategory);
  const detailConfidence = (f as Partial<{ confidence_score: number | null }>).confidence_score;
  return {
    id: f.finding_id || String(f.id),
    detectorId: f.detector_key,
    headline: f.headline || f.description || f.detector_name || "Finding",
    subject: subjectParts.join(" · ") || (f.detector_name ?? f.detector_key),
    department: f.department || "—",
    amount: formatAmount(f.estimated_dollar_impact ?? f.amount),
    confidence: parseConfidence(detailConfidence ?? f.confidence),
    flagged: relativeTime(f.created_at),
    detail: f.description || f.detector_name || "",
    severity: severityFromBackend(f.severity),
    status: statusFromBackend(f.finding_status),
  };
}

const REPORT_STATUS_MAP: Record<string, ReportStatus> = {
  draft: "draft",
  under_review: "under-review",
  "under-review": "under-review",
  in_review: "under-review",
  final: "final",
  published: "final",
};

function reportStatusFromBackend(value: string | null | undefined): ReportStatus {
  if (!value) return "draft";
  return REPORT_STATUS_MAP[value.toLowerCase()] ?? "draft";
}

function formatExposure(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "—";
  return formatAmount(n);
}

function formatMateriality(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Risk-based";
  return formatAmount(n);
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function adaptReportRow(r: WasteAdminReportRow): Report {
  return {
    slug: r.slug,
    title: r.title,
    period: r.period,
    findings: r.findings_count,
    exposure: formatExposure(r.estimated_exposure),
    materiality: formatMateriality(r.materiality),
    priorPeriod: "—",
    updated: formatUpdated(r.updated_at),
    status: reportStatusFromBackend(r.status),
    detectors: [],
    standards: "",
    methodology: "",
    caveats: "",
  };
}

export function adaptReportDetail(r: WasteAdminReportDetail): Report {
  return {
    ...adaptReportRow(r),
    detectors: Array.from(new Set(r.findings.map(f => f.detector_key))),
    standards: r.standards_basis ?? "",
    methodology: r.methodology_md ?? r.blurb ?? "",
    caveats: r.caveats_md ?? "",
  };
}

export function adaptSeymour(feed: WasteAdminSeymourFeed): SeymourData {
  return {
    todaysRead: feed.read_of_the_day,
    generatedAt: new Date().toLocaleString("default", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    clusters: feed.clusters.map(c => ({
      id: c.id,
      entity: c.title,
      detectors: [],
      findings: c.finding_ids.length,
      exposure:
        c.composite_risk != null
          ? `risk ${c.composite_risk.toFixed(2)}`
          : c.department || "—",
      reasoning: c.department ? `Department: ${c.department}` : "",
      suggestion: "Open as investigation",
    })),
    suggested: feed.suggested_investigations.map((s, i) => ({
      id: `S-${i + 1}`,
      title: `${s.entity_name} (${s.entity_type})`,
      basis: `Score Δ ${s.score_delta.toFixed(2)}`,
      lift: s.last_scored_at ? `Updated ${relativeTime(s.last_scored_at)}` : "",
    })),
  };
}
