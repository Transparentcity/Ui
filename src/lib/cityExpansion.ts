export const GATE_CHECKS: { key: string; label: string }[] = [
  { key: "has_portal", label: "Portal" },
  { key: "catalog_indexed", label: "Catalog" },
  { key: "has_leaders", label: "Leaders" },
  { key: "has_shape_layers", label: "Shapes" },
  { key: "shapes_from_templates", label: "Shape templates" },
  { key: "official_district_layer", label: "Official district" },
  { key: "district_fields", label: "District fields" },
  { key: "dashboard_metrics", label: "Dash metrics" },
  { key: "metrics_from_templates", label: "Metric templates" },
  { key: "metrics_executed", label: "Executed" },
  { key: "no_failed_executions", label: "No failures" },
];

export const QUEUE_REASON_LABEL: Record<string, string> = {
  user_demand_unstructured: "User demand",
  user_requested_unsupported_home: "Unsupported home search",
  dark_launch_gates_failing: "Dark launch failing",
  in_db_not_launched: "In progress",
  catalog_new_city: "Catalog prospect",
  manual: "Manual",
};

const DEMAND_SOURCE_LABEL: Record<string, string> = {
  homes: "homes",
  saved: "saved",
  subscribers: "subscribers",
  places: "places",
  follows: "follows",
  unsupported_home: "searches",
};

export const PORTAL_SUPPORT_LABEL: Record<string, string> = {
  supported: "Supported portal",
  partial: "CKAN",
  unknown: "Unknown portal",
};

export function formatPopulation(n?: number | null): string {
  if (n == null || n <= 0) return "";
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

export function formatDemandSources(
  sources?: Record<string, number> | null
): string {
  if (!sources) return "";
  return Object.entries(sources)
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `${count} ${DEMAND_SOURCE_LABEL[key] ?? key}`)
    .join(" · ");
}

export function cityResultLabel(city: {
  promoted?: boolean;
  passed?: boolean;
  result?: string | null;
  status?: string;
}): string {
  if (city.promoted || city.result === "promoted") return "Dark launched";
  if (city.result === "learned") return "Learned";
  if (city.result === "skipped" || city.status === "skipped") return "Skipped";
  if (city.result === "blocked" || city.status === "failed" || city.passed === false) {
    return "Blocked";
  }
  if (city.passed) return "Passed";
  return city.status || "Done";
}
