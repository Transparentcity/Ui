"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { getPublicRepresentativeFollowerCounts } from "@/lib/publicApiClient";
import {
  useRepresentativeFollowerCounts,
  useRepresentativeFollows,
  useFollowRepresentative,
  useUnfollowRepresentative,
} from "@/lib/hooks/useCities";

type Props = {
  cityId: number;
  district: number;
  slug: string;
};

export default function DistrictFollowClaimBlock({
  cityId,
  district,
  slug,
}: Props) {
  const districtKey = String(district);
  const { isAuthenticated, loginWithRedirect } = useAuth0();

  const { data: publicCounts = [] } = useQuery({
    queryKey: ["publicRepresentativeFollowerCounts", cityId],
    queryFn: () => getPublicRepresentativeFollowerCounts(cityId),
    enabled: !!cityId,
    staleTime: 5 * 60 * 1000,
  });
  const publicCount =
    publicCounts.find((c) => (c.district || "0") === districtKey)?.follower_count ?? 0;

  const { data: authCounts } = useRepresentativeFollowerCounts(
    isAuthenticated ? cityId : null
  );
  const { data: myFollows = {} } = useRepresentativeFollows(
    isAuthenticated ? cityId : null
  );
  const followMutation = useFollowRepresentative(cityId);
  const unfollowMutation = useUnfollowRepresentative(cityId);

  const count =
    isAuthenticated && authCounts != null && authCounts[districtKey] !== undefined
      ? authCounts[districtKey]
      : publicCount;
  const following = !!myFollows[districtKey];
  const loading = followMutation.isPending || unfollowMutation.isPending;

  const handleFollowClick = () => {
    if (!isAuthenticated) {
      const returnTo =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : `/c/${slug}/district/${district}`;
      loginWithRedirect({
        authorizationParams: { screen_hint: "signup", prompt: "login" },
        appState: { returnTo },
      });
      return;
    }
    if (following) {
      unfollowMutation.mutate(districtKey);
    } else {
      followMutation.mutate(districtKey);
    }
  };

  return (
    <div className="hero-official-buttons">
      <button
        type="button"
        onClick={handleFollowClick}
        disabled={loading}
        className="hero-official-btn hero-official-btn-follow"
        style={{
          color: following ? "var(--brand-primary, #ad35fa)" : "var(--text-on-brand, #ffffff)",
          background: following ? "transparent" : "var(--brand-primary, #ad35fa)",
        }}
      >
        {following ? "Unfollow" : "Follow"}
        {count >= 0 && ` · ${count}`}
      </button>
    </div>
  );
}
