"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";

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

  const persistFollowIntent = () => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
    if (cityDisplayName) {
      window.localStorage.setItem(
        "transparentcity.follow_city_name",
        cityDisplayName,
      );
    }
    if (typeof cityId === "number") {
      window.localStorage.setItem(
        "transparentcity.follow_city_id",
        String(cityId),
      );
    }
  };

  const handleFollow = async () => {
    persistFollowIntent();

    const returnTo = `/dashboard?follow_city_slug=${encodeURIComponent(citySlug)}${
      typeof cityId === "number" ? `&follow_city_id=${cityId}` : ""
    }${
      cityDisplayName
        ? `&follow_city_name=${encodeURIComponent(cityDisplayName)}`
        : ""
    }`;

    if (isAuthenticated) {
      router.push(returnTo);
      return;
    }

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo },
    });
  };

  return (
    <button className={className} onClick={handleFollow} disabled={isLoading}>
      Follow this city
    </button>
  );
}


