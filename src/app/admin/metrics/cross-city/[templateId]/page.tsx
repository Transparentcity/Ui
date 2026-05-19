"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import CrossCityComparisonChart from "@/components/CrossCityComparisonChart";
import "@/components/CrossCityComparisonChart.css";

export default function CrossCityMetricComparisonPage() {
  const params = useParams<{ templateId: string }>();
  const { getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect } =
    useAuth0();
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const templateId = useMemo(() => {
    const parsed = parseInt(params.templateId, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.templateId]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    setTokenError(null);
    getAccessTokenSilently()
      .then((nextToken) => {
        if (!cancelled) setToken(nextToken);
      })
      .catch((err) => {
        if (!cancelled) {
          setToken(null);
          setTokenError(err instanceof Error ? err.message : "Unable to load session token.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently, isAuthenticated, isLoading]);

  return (
    <main className="cross-city-chart-page">
      <div className="cross-city-chart-page-inner">
        <Link href="/admin?tab=metrics" className="cross-city-chart-page-back">
          ← Back to Metrics Admin
        </Link>
        <h1 className="cross-city-chart-page-title">Cross-City Metric Comparison</h1>
        <p className="cross-city-chart-page-subtitle">
          Compare every city metric instantiated from the same template.
        </p>

        {templateId == null ? (
          <section className="cross-city-chart-card">
            <div className="cross-city-chart-empty">Invalid template id.</div>
          </section>
        ) : isLoading ? (
          <section className="cross-city-chart-card">
            <div className="cross-city-chart-empty">Checking your session...</div>
          </section>
        ) : !isAuthenticated ? (
          <section className="cross-city-chart-card">
            <div className="cross-city-chart-empty">
              <button
                type="button"
                className="cross-city-chart-page-login"
                onClick={() => loginWithRedirect()}
              >
                Log in to view this comparison
              </button>
            </div>
          </section>
        ) : tokenError ? (
          <section className="cross-city-chart-card">
            <div className="cross-city-chart-empty">{tokenError}</div>
          </section>
        ) : token ? (
          <CrossCityComparisonChart templateId={templateId} token={token} height={520} />
        ) : (
          <section className="cross-city-chart-card">
            <div className="cross-city-chart-empty">Loading cross-city comparison...</div>
          </section>
        )}
      </div>
    </main>
  );
}
