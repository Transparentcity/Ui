"use client";

import { useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useUserMetricOrdering } from "@/lib/hooks/useCityAdmin";
import { PENDING_ORDER_STORAGE_KEY_PREFIX } from "@/components/MetricOrderEditor";
import UserMetricOrderDialog from "@/components/UserMetricOrderDialog";
import CityDashboardSection, {
  type MetricOrderingEntry,
} from "./CityDashboardSection";
import SignUpToCustomizeMetricsButton from "./SignUpToCustomizeMetricsButton";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicMapListItem,
  PublicLeader,
  PublicMetricOrderingItem,
} from "@/lib/publicApiClient";

type Props = {
  cityId: number;
  cityDisplayName: string;
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
  leaders?: PublicLeader[] | null;
  /** Admin-defined default ordering for the city (used when user has no custom ordering). */
  cityOrdering?: PublicMetricOrderingItem[];
};

export default function CityDashboardSectionWithOrdering({
  cityId,
  cityDisplayName,
  slug,
  metrics,
  comparisonsMap,
  districts,
  maps,
  leaders = null,
  cityOrdering,
}: Props) {
  const { isAuthenticated } = useAuth0();
  const { data: userOrdering } = useUserMetricOrdering(isAuthenticated ? cityId : null);

  // Convert city-level default ordering to MetricOrderingEntry format
  const cityOrderingEntries = useMemo((): MetricOrderingEntry[] | undefined => {
    if (!cityOrdering?.length) return undefined;
    return cityOrdering
      .filter((o) => o.metric_id != null)
      .map((o) => ({
        metric_id: o.metric_id!,
        category_order: o.category_order,
        metric_order: o.metric_order,
        category_name: o.category_name,
        subcategory_name: o.subcategory_name ?? null,
      }));
  }, [cityOrdering]);

  const orderings = useMemo((): MetricOrderingEntry[] | undefined => {
    if (isAuthenticated && userOrdering?.orderings?.length) {
      return userOrdering.orderings
        .filter((o) => o.metric_id != null)
        .map((o) => ({
          metric_id: o.metric_id!,
          category_order: o.category_order,
          metric_order: o.metric_order,
          category_name: o.category_name,
          subcategory_name: o.subcategory_name ?? null,
        }));
    }
    if (!isAuthenticated && typeof window !== "undefined") {
      try {
        const key = `${PENDING_ORDER_STORAGE_KEY_PREFIX}${cityId}`;
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { city_id: number; orderings: Array<{ metric_id: number; category_order: number; metric_order: number; category_name: string; subcategory_name?: string | null }> };
          if (parsed?.city_id === cityId && Array.isArray(parsed.orderings) && parsed.orderings.length > 0) {
            return parsed.orderings
              .filter((o) => o.metric_id != null)
              .map((o) => ({
                metric_id: o.metric_id,
                category_order: o.category_order,
                metric_order: o.metric_order,
                category_name: o.category_name,
                subcategory_name: o.subcategory_name ?? null,
              }));
          }
        }
      } catch {
        // ignore
      }
    }
    // Fall back to admin-defined city ordering when no user-specific ordering exists
    return cityOrderingEntries;
  }, [isAuthenticated, userOrdering, cityId, cityOrderingEntries]);

  // Whether orderings came from a user-specific selection (should filter metrics to chosen set)
  // vs. city-level default (just sort, show all metrics including any not in the ordering)
  const isUserOrdering = useMemo(() => {
    if (!orderings?.length) return false;
    // User ordering: either from server (userOrdering) or localStorage
    if (isAuthenticated && userOrdering?.orderings?.length) return true;
    if (!isAuthenticated && typeof window !== "undefined") {
      try {
        const key = `${PENDING_ORDER_STORAGE_KEY_PREFIX}${cityId}`;
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { city_id: number; orderings: unknown[] };
          if (parsed?.city_id === cityId && Array.isArray(parsed.orderings) && parsed.orderings.length > 0) {
            return true;
          }
        }
      } catch {
        // ignore
      }
    }
    return false;
  }, [isAuthenticated, userOrdering, cityId, orderings]);

  const metricsToShow = useMemo(() => {
    // Only filter the metric set when a user has explicitly selected which metrics to show.
    // For the city-level default ordering, show all metrics (unselected ones sort to the end).
    if (!orderings?.length || !isUserOrdering) return metrics;
    const ids = new Set(orderings.map((o) => o.metric_id));
    return metrics.filter((m) => ids.has(m.id));
  }, [metrics, orderings, isUserOrdering]);

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <UserMetricOrderDialog
        cityId={cityId}
        cityName={cityDisplayName}
        metrics={metrics.map((m) => ({
          id: m.id,
          metric_name: m.metric_name,
          category: m.category,
          subcategory: m.subcategory ?? null,
          sub_category: m.subcategory ?? null,
          show_on_dash: m.show_on_dash,
        }))}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <CityDashboardSection
        cityDisplayName={cityDisplayName}
        slug={slug}
        metrics={metricsToShow}
        comparisonsMap={comparisonsMap}
        districts={districts}
        maps={maps}
        orderings={orderings}
        onCustomizeMetricsClick={
          isAuthenticated ? () => setDialogOpen(true) : undefined
        }
        signUpToCustomizeMetricsNode={
          !isAuthenticated ? <SignUpToCustomizeMetricsButton /> : undefined
        }
        cityId={cityId}
        leaders={leaders}
      />
    </>
  );
}
