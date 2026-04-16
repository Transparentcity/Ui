"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import { startSignup } from "@/lib/signup";
import { getPublicRepresentativeFollowerCounts } from "@/lib/publicApiClient";
import FollowButton from "@/components/FollowButton";
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
  cityDisplayName?: string;
};

export default function DistrictFollowClaimBlock({
  cityId,
  district,
  slug,
  cityDisplayName,
}: Props) {
  const districtKey = String(district);
  const isCitywide = district === 0;
  const entityLabel = isCitywide
    ? (cityDisplayName || "this city")
    : `District ${district}`;
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
    if (loading) return; // guard against double-clicks
    if (!isAuthenticated) {
      const returnToParams: Record<string, string> = {
        follow_city_id: String(cityId),
        follow_city_slug: slug,
      };
      if (cityDisplayName) returnToParams.follow_city_name = cityDisplayName;
      void startSignup(loginWithRedirect, "resident", {
        source_surface: "district_follow",
        city_id: cityId,
        city_slug: slug,
        city_name: cityDisplayName ?? null,
        district,
        returnToParams,
      });
      return;
    }
    if (following) {
      unfollowMutation.mutate(districtKey, {
        onSuccess: () => toast.success(`Unfollowed ${entityLabel}`),
      });
    } else {
      followMutation.mutate(districtKey, {
        onSuccess: () =>
          toast.success(`Following ${entityLabel}`, {
            description: "You'll get weekly updates",
          }),
      });
    }
  };

  return (
    <div className="hero-official-buttons">
      <FollowButton
        following={following}
        loading={loading}
        count={count}
        onClick={handleFollowClick}
        entityLabel={entityLabel}
      />
    </div>
  );
}
