"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getPublicRepresentativeFollowerCounts,
  type PublicLeader,
} from "@/lib/publicApiClient";
import {
  useRepresentativeFollowerCounts,
  useRepresentativeFollows,
  useFollowRepresentative,
  useUnfollowRepresentative,
} from "@/lib/hooks/useCities";
import ClaimMyPageButton from "@/components/ClaimMyPageButton";

type Props = {
  cityId: number;
  slug: string;
  cityDisplayName: string;
  districts: number[];
  leaders?: PublicLeader[] | null;
};

export default function DistrictListWithFollow({
  cityId,
  slug,
  cityDisplayName,
  districts,
  leaders = [],
}: Props) {
  const base = `/c/${slug}`;
  const { isAuthenticated, loginWithRedirect } = useAuth0();

  // Public counts (work when logged out)
  const { data: publicCounts = [] } = useQuery({
    queryKey: ["publicRepresentativeFollowerCounts", cityId],
    queryFn: () => getPublicRepresentativeFollowerCounts(cityId),
    enabled: !!cityId,
    staleTime: 5 * 60 * 1000,
  });
  const countByDistrict: Record<string, number> = {};
  for (const c of publicCounts) {
    countByDistrict[c.district || "0"] = c.follower_count;
  }

  // When authenticated: follow state and mutations
  const { data: authCounts } = useRepresentativeFollowerCounts(
    isAuthenticated ? cityId : null
  );
  const { data: myFollows = {} } = useRepresentativeFollows(
    isAuthenticated ? cityId : null
  );
  const followMutation = useFollowRepresentative(cityId);
  const unfollowMutation = useUnfollowRepresentative(cityId);

  const getCount = (district: number): number => {
    const key = String(district);
    if (isAuthenticated && authCounts != null && authCounts[key] !== undefined) {
      return authCounts[key];
    }
    return countByDistrict[key] ?? 0;
  };

  const isFollowing = (district: number): boolean =>
    !!myFollows[String(district)];

  const handleFollowClick = (district: number) => {
    const d = String(district);
    if (!isAuthenticated) {
      const returnTo =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : base;
      loginWithRedirect({
        authorizationParams: { screen_hint: "signup", prompt: "login" },
        appState: { returnTo },
      });
      return;
    }
    if (isFollowing(district)) {
      unfollowMutation.mutate(d);
    } else {
      followMutation.mutate(d);
    }
  };

  const leadersByDistrict = ((): Record<number, PublicLeader[]> => {
    const map: Record<number, PublicLeader[]> = {};
    for (const l of leaders ?? []) {
      const d = l.district ?? 0;
      if (d > 0) {
        if (!map[d]) map[d] = [];
        map[d].push(l);
      }
    }
    return map;
  })();

  if (districts.length === 0) return null;

  return (
    <div className="metrics-category-section" style={{ marginTop: 24 }}>
      <div
        className="metrics-category-title"
        style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}
      >
        By district
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {districts.map((d) => {
          const repList = leadersByDistrict[d] ?? [];
          const primaryRep = repList[0];
          const repLabel =
            primaryRep != null
              ? `${primaryRep.title || ""} ${primaryRep.name}`.trim() || primaryRep.name
              : null;
          const count = getCount(d);
          const following = isFollowing(d);
          const loading =
            followMutation.isPending || unfollowMutation.isPending;
          return (
            <div
              key={d}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Link
                href={`${base}/district/${d}`}
                className="nav-link"
                style={{ fontSize: 14, fontWeight: 600, textDecoration: "none" }}
              >
                {cityDisplayName} District {d}
                {repLabel ? ` – ${repLabel}` : ""}
              </Link>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
                ({count} {count === 1 ? "follower" : "followers"})
              </span>
              <button
                type="button"
                onClick={() => handleFollowClick(d)}
                disabled={loading}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: following
                    ? "var(--brand-primary, #ad35fa)"
                    : "var(--text-on-brand, #ffffff)",
                  background: following
                    ? "transparent"
                    : "var(--brand-primary, #ad35fa)",
                  border: "1px solid var(--brand-primary, #ad35fa)",
                  borderRadius: 6,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {following ? "Unfollow" : "Follow"}
              </button>
              <ClaimMyPageButton size="compact" cityId={cityId} district={d} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
