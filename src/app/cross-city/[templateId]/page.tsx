"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import CrossCityComparisonChart from "@/components/CrossCityComparisonChart";
import Loader from "@/components/Loader";

function CrossCityPageContent() {
  const params = useParams();
  const templateIdRaw = params?.templateId;
  const templateId =
    typeof templateIdRaw === "string" ? parseInt(templateIdRaw, 10) : null;

  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((t) => { if (!cancelled) setToken(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, getAccessTokenSilently]);

  if (isLoading || !isAuthenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader size="md" color="dark" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!templateId || !Number.isFinite(templateId)) {
    return <div style={{ padding: 32 }}>Invalid template ID.</div>;
  }

  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader size="md" color="dark" />
        <span>Authenticating…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <CrossCityComparisonChart
        templateId={templateId}
        token={token}
        height={420}
        useUserEndpoint={true}
        fullPageHref={undefined}
      />
    </div>
  );
}

export default function CrossCityPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
          <Loader size="md" color="dark" />
          <span>Loading…</span>
        </div>
      }
    >
      <CrossCityPageContent />
    </Suspense>
  );
}
