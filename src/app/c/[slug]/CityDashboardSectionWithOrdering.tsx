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
}: Props) {
  const { isAuthenticated } = useAuth0();
  const { data: userOrdering } = useUserMetricOrdering(isAuthenticated ? cityId : null);

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
    return undefined;
  }, [isAuthenticated, userOrdering, cityId]);

  const metricsToShow = useMemo(() => {
    if (!orderings?.length) return metrics;
    const ids = new Set(orderings.map((o) => o.metric_id));
    return metrics.filter((m) => ids.has(m.id));
  }, [metrics, orderings]);

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
