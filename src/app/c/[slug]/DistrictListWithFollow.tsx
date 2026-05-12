"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import { startSignup } from "@/lib/signup";
import {
  getPublicRepresentativeFollowerCounts,
  type PublicLeader,
} from "@/lib/publicApiClient";
import { formatLeaderName } from "@/lib/utils";
import FollowButton from "@/components/FollowButton";
import {
  useRepresentativeFollowerCounts,
  useRepresentativeFollows,
  useFollowRepresentative,
  useUnfollowRepresentative,
} from "@/lib/hooks/useCities";

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
    if (followMutation.isPending || unfollowMutation.isPending) return; // guard against double-clicks
    if (!isAuthenticated) {
      void startSignup(loginWithRedirect, "resident", {
        source_surface: "district_list_follow",
        city_id: cityId,
        city_slug: slug,
        city_name: cityDisplayName,
        district,
        returnToParams: {
          follow_city_id: String(cityId),
          follow_city_name: cityDisplayName,
          follow_city_slug: slug,
        },
      });
      return;
    }
    const label = district === 0 ? cityDisplayName : `District ${district}`;
    if (isFollowing(district)) {
      unfollowMutation.mutate(d, {
        onSuccess: () => toast.success(`Unfollowed ${label}`),
      });
    } else {
      followMutation.mutate(d, {
        onSuccess: () =>
          toast.success(`Following ${label}`, {
            description: "You'll get weekly updates",
          }),
      });
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "10px 24px",
        }}
      >
        {districts.map((d) => {
          const repList = leadersByDistrict[d] ?? [];
          const primaryRep = repList[0];
          const repLabel =
            primaryRep != null
              ? (primaryRep.name ? formatLeaderName(primaryRep.name) : null)
              : null;
          const count = getCount(d);
          const following = isFollowing(d);
          const loading =
            (followMutation.isPending &&
              followMutation.variables === String(d)) ||
            (unfollowMutation.isPending &&
              unfollowMutation.variables === String(d));
          return (
            <div
              key={d}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <Link
                  href={`${base}/district/${d}`}
                  className="nav-link"
                  style={{ fontSize: 14, fontWeight: 600, textDecoration: "none" }}
                >
                  District {d}
                  {repLabel ? ` – ${repLabel}` : ""}
                </Link>
                {count > 0 && (
                  <span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 6 }}>
                    ({count})
                  </span>
                )}
              </div>
              <FollowButton
                following={following}
                loading={loading}
                size="compact"
                onClick={() => handleFollowClick(d)}
                entityLabel={`District ${d}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
