"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { startSignup } from "@/lib/signup";

type FollowCityButtonProps = {
  cityId?: number | null;
  citySlug: string;
  cityDisplayName?: string | null;
  className?: string;
};

export default function FollowCityButton({
  cityId,
  citySlug,
  cityDisplayName,
  className,
}: FollowCityButtonProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();

  const handleFollow = async () => {
    const returnToParams: Record<string, string> = {
      follow_city_slug: citySlug,
    };
    if (typeof cityId === "number") returnToParams.follow_city_id = String(cityId);
    if (cityDisplayName) returnToParams.follow_city_name = cityDisplayName;

    if (isAuthenticated) {
      const params = new URLSearchParams({ signup: "resident", ...returnToParams });
      router.push(`/home?${params.toString()}`);
      return;
    }

    await startSignup(loginWithRedirect, "resident", {
      source_surface: "follow_city_button",
      city_slug: citySlug,
      city_name: cityDisplayName ?? null,
      city_id: typeof cityId === "number" ? cityId : null,
      returnToParams,
    });
  };

  return (
    <button className={className} onClick={handleFollow} disabled={isLoading}>
      Follow this city
    </button>
  );
}











