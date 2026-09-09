"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import AdminGuide from "@/components/admin/AdminGuide";
import {
  CITY_GUIDES,
  DEFAULT_GUIDE,
  guideForCityIds,
  guideForSlug,
} from "@/components/admin/guideContent";
import { getMyPermissions, type UserPermissions } from "@/lib/apiClient";
import { useImpersonationCacheKey } from "@/lib/impersonation";
import Loader from "@/components/Loader";

/**
 * In-app home for the city admin field guide, linked from the admin menu.
 *
 * Access: global admins and city leads. Unlike the other admin routes this is
 * documentation, not a control surface, and a city lead who is not a global
 * admin is exactly its audience — so it does not use AdminGuard.
 *
 * Which city's guide you see: `?city=<slug>` wins, so one link can be sent to
 * anyone; otherwise it follows your own city-lead assignment, so a city
 * manager sent to the bare /admin/guide lands on their own city.
 */
function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>{children}</div>;
}

function GuideResolver() {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const identityKey = useImpersonationCacheKey();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedSlug = searchParams.get("city") ?? undefined;

  const permissionsQuery = useQuery<UserPermissions>({
    queryKey: ["admin", "me", "permissions", identityKey],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getMyPermissions(token);
    },
    enabled: !authLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      void loginWithRedirect({ appState: { returnTo: "/admin/guide" } });
    }
  }, [authLoading, isAuthenticated, loginWithRedirect]);

  const permissions = permissionsQuery.data;
  const mayView = !!permissions && (permissions.is_admin || !!permissions.is_city_lead);

  useEffect(() => {
    if (permissions && !mayView) router.replace("/home");
  }, [permissions, mayView, router]);

  if (authLoading || !isAuthenticated || permissionsQuery.isPending) {
    return (
      <Centered>
        <Loader size="md" />
      </Centered>
    );
  }

  if (permissionsQuery.isError) {
    return (
      <Centered>
        <p style={{ color: "var(--text-secondary)" }}>
          Could not check your access. <Link href="/home">Back to Transparent City</Link>
        </p>
      </Centered>
    );
  }

  if (!mayView) {
    return (
      <Centered>
        <Loader size="md" />
      </Centered>
    );
  }

  const requested = guideForSlug(requestedSlug);
  const assigned = guideForCityIds(permissions?.city_lead_city_ids);
  const guide = requested ?? assigned ?? DEFAULT_GUIDE;

  // Global admins with no single city get a switcher; city managers do not
  // need one and should not be nudged toward other cities.
  const showSwitcher = !!permissions?.is_admin && !assigned;

  return (
    <>
      {showSwitcher && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <span>Viewing as a platform admin. Guides:</span>
          {CITY_GUIDES.map((c) => (
            <Link
              key={c.citySlug}
              href={`/admin/guide?city=${c.citySlug}`}
              style={{
                color: "var(--brand-primary-hover)",
                fontWeight: 600,
                textDecoration: c.citySlug === guide.citySlug ? "underline" : "none",
              }}
            >
              {c.cityEmoji} {c.cityName}
            </Link>
          ))}
        </div>
      )}
      <AdminGuide guide={guide} />
    </>
  );
}

export default function AdminGuidePage() {
  return (
    <Suspense fallback={null}>
      <GuideResolver />
    </Suspense>
  );
}
