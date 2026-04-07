"use client";

import { createContext, useContext, useMemo } from "react";

type MetricItem = { metric_name: string; metric_key: string };

type MetricKeyContextValue = {
  resolveMetricKey: (displayName: string) => string | null;
};

const MetricKeyContext = createContext<MetricKeyContextValue>({
  resolveMetricKey: () => null,
});

function buildLookup(metrics: MetricItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of metrics) {
    if (m.metric_name && m.metric_key) {
      map.set(m.metric_name.toLowerCase().trim(), m.metric_key);
    }
  }
  return map;
}

export function MetricKeyProvider({
  metrics,
  children,
}: {
  metrics: MetricItem[];
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const lookup = buildLookup(metrics);
    return {
      resolveMetricKey: (displayName: string) =>
        lookup.get(displayName.toLowerCase().trim()) ?? null,
    };
  }, [metrics]);

  return (
    <MetricKeyContext.Provider value={value}>
      {children}
    </MetricKeyContext.Provider>
  );
}

export function useMetricKey() {
  return useContext(MetricKeyContext);
}
