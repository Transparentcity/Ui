"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();

  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;

  if (!domain || !clientId || !audience) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "Auth0 environment variables are not fully configured. " +
          "Set NEXT_PUBLIC_AUTH0_DOMAIN, NEXT_PUBLIC_AUTH0_CLIENT_ID, " +
          "and NEXT_PUBLIC_AUTH0_AUDIENCE in .env.local.",
      );
    }
  }

  const onRedirectCallback = (appState?: { returnTo?: string }) => {
    router.push(appState?.returnTo || "/dashboard");
  };

  return (
    <Auth0Provider
      domain={domain || "example.us.auth0.com"}
      clientId={clientId || "example-client-id"}
      authorizationParams={{
        redirect_uri:
          typeof window !== "undefined" ? window.location.origin : undefined,
        audience: audience || "https://api.transparentcity.app",
        scope: "openid profile email offline_access",
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
}




