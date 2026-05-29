"use client";

import { Auth0Provider, type AppState } from "@auth0/auth0-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getAuth0ApiAudience } from "@/lib/auth0ApiAudience";
import {
  clearStaleAuth0Transactions,
  findAuth0TransactionByState,
  getAuth0CookieDomain,
} from "@/lib/auth0TransactionStorage";
import { queryClient } from "@/lib/queryClient";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Check if URL has Auth0 callback params but we might have an invalid state.
 * Returns true if we should skip the redirect callback.
 */
function shouldSkipRedirectCallback(clientId?: string): boolean {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  const hasCode = url.searchParams.has("code");
  const hasState = url.searchParams.has("state");
  const hasError = url.searchParams.has("error");

  // If there's an error param from Auth0, we should let Auth0Provider handle it
  if (hasError) {
    return false;
  }

  // If we have code and state params (callback from Auth0),
  // check if we have a matching transaction (localStorage, sessionStorage, or cookie)
  if (hasCode && hasState) {
    const state = url.searchParams.get("state");
    const hasMatchingTransaction =
      !!state && findAuth0TransactionByState(state, clientId);

    // If no matching transaction, skip the callback to prevent errors
    if (!hasMatchingTransaction) {
      // Clean up the URL params
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, "", url.pathname + url.search);
      return true;
    }
  }

  return false;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [skipRedirect, setSkipRedirect] = useState(false);
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
  const audience = getAuth0ApiAudience();

  // On mount, clear stale state and check if we should skip redirect
  useEffect(() => {
    clearStaleAuth0Transactions();
    const shouldSkip = shouldSkipRedirectCallback(clientId);
    setSkipRedirect(shouldSkip);
  }, [clientId]);

  if (!domain || !clientId) {
    if (typeof window !== "undefined") {
      console.warn(
        "Auth0 environment variables are not fully configured. " +
          "Set NEXT_PUBLIC_AUTH0_DOMAIN and NEXT_PUBLIC_AUTH0_CLIENT_ID in .env.local. " +
          "Optional: NEXT_PUBLIC_AUTH0_AUDIENCE must match the platform AUTH0_AUDIENCE.",
      );
    }
  }

  const onRedirectCallback = (appState?: AppState) => {
    // Clear any URL params left over from the callback
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      const cleanUrl = url.pathname + url.search;
      window.history.replaceState({}, "", cleanUrl || "/");
    }
    router.push(appState?.returnTo || "/home");
  };

  const cookieDomain =
    typeof window !== "undefined" ? getAuth0CookieDomain() : undefined;

  return (
    <Auth0Provider
      domain={domain || "auth.transparent.city"}
      clientId={clientId || "example-client-id"}
      authorizationParams={{
        redirect_uri:
          typeof window !== "undefined" ? window.location.origin : undefined,
        audience,
        scope: "openid profile email offline_access",
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      useCookiesForTransactions
      {...(cookieDomain ? { cookieDomain } : {})}
      onRedirectCallback={onRedirectCallback}
      skipRedirectCallback={skipRedirect}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </Auth0Provider>
  );
}
