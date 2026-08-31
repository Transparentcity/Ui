"use client";

/**
 * NeedsAttentionPanel — self-loading wrapper around CityHealthAttentionDashboard
 * for use outside the City Health tab (e.g. the admin Dashboards hub).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import CityHealthAttentionDashboard from "./CityHealthAttentionDashboard";
import MetricEditModal from "./MetricEditModal";
import Loader from "./Loader";
import {
  getCityScheduleHealth,
  type CityHealthAttentionSummary,
  type CityScheduleHealth,
} from "@/lib/apiClient";
import { ensureCitiesAttention } from "@/lib/cityHealthAttention";

export default function NeedsAttentionPanel() {
  const { getAccessTokenSilently } = useAuth0();
  const [cities, setCities] = useState<CityScheduleHealth[]>([]);
  const [summary, setSummary] = useState<CityHealthAttentionSummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingMetricId, setEditingMetricId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const res = await getCityScheduleHealth(token, { daysBack: 14 });
      const enriched = ensureCitiesAttention(
        res.cities || [],
        res.attention_summary ?? null
      );
      setCities(enriched.cities);
      setSummary(enriched.summary);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Failed to load city health"
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && cities.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "1.5rem 0",
        }}
      >
        <Loader size="sm" color="dark" />
        <span>Loading city health…</span>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ color: "var(--error)", marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      <CityHealthAttentionDashboard
        cities={cities}
        summary={summary}
        getAccessTokenSilently={getAccessTokenSilently}
        onEditMetric={setEditingMetricId}
        onRefresh={() => void load()}
      />

      {editingMetricId != null && (
        <MetricEditModal
          metricId={editingMetricId}
          isOpen
          onClose={() => setEditingMetricId(null)}
        />
      )}
    </div>
  );
}
