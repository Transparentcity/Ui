"use client";

import { useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useSignupEmail } from "@/app/c/[slug]/SignupEmailContext";
import { startSignup } from "@/lib/signup";

export type GetLandingSignupOptions = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
  returnTo: string;
  sourceSurface: string;
};

export function useGetLandingSignup({
  citySlug,
  cityName,
  cityId,
  returnTo,
  sourceSurface,
}: GetLandingSignupOptions) {
  const { loginWithRedirect } = useAuth0();
  const { email } = useSignupEmail();

  const triggerSignup = useCallback(async () => {
    const trimmed = email.trim();
    await startSignup(loginWithRedirect, "resident", {
      source_surface: sourceSurface,
      city_slug: citySlug,
      city_name: cityName,
      city_id: typeof cityId === "number" ? cityId : null,
      returnTo,
      loginHint: trimmed.includes("@") ? trimmed : undefined,
    });
  }, [
    cityId,
    cityName,
    citySlug,
    email,
    loginWithRedirect,
    returnTo,
    sourceSurface,
  ]);

  return { triggerSignup };
}
