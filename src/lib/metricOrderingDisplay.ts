/**
 * Shared helpers for applying city/user metric ordering on dashboards.
 * Keep public (CityDashboardSection) and logged-in (CityView) behavior aligned.
 */

export type MetricOrderingLookup = {
  categoryOrder: number;
  metricOrder: number;
  categoryName: string;
  subcategoryName: string | null;
};

/** Non-empty subcategory override from ordering; otherwise null (use metric default). */
export function resolveOrderingSubcategory(
  orderingSubcategory: string | null | undefined
): string | null {
  if (orderingSubcategory != null && String(orderingSubcategory).trim()) {
    return String(orderingSubcategory).trim();
  }
  return null;
}

/** Display subcategory: ordering override when set, else metric fields. */
export function resolveDisplaySubcategory(
  orderingSubcategory: string | null | undefined,
  metricSubcategory?: string | null,
  metricSubCategoryAlt?: string | null
): string | null {
  const fromOrdering = resolveOrderingSubcategory(orderingSubcategory);
  if (fromOrdering) return fromOrdering;
  const fromMetric = metricSubcategory ?? metricSubCategoryAlt ?? null;
  return fromMetric != null && String(fromMetric).trim()
    ? String(fromMetric).trim()
    : null;
}

/** Display category: ordering rename when present, else metric category. */
export function resolveDisplayCategory(
  orderingCategoryName: string | null | undefined,
  metricCategory?: string | null
): string {
  if (orderingCategoryName != null && String(orderingCategoryName).trim()) {
    return String(orderingCategoryName).trim();
  }
  return metricCategory?.trim() || "Uncategorized";
}
