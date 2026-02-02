"use client";

import { Auth0Provider, type AppState } from "@auth0/auth0-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Clear stale Auth0 transaction state from localStorage.
 * This prevents "Invalid state" errors when users click the back button
 * during or after an auth flow.
 */
function clearStaleAuth0State() {
  if (typeof window === "undefined") return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("a0.spajs.txs")) {
      // Check if the transaction is stale (older than 5 minutes)
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const parsed = JSON.parse(value);
          const createdAt = parsed?.created_at || 0;
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          if (createdAt < fiveMinutesAgo) {
            keysToRemove.push(key);
          }
        }
      } catch {
        // If we can't parse it, remove it
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * Check if URL has Auth0 callback params but we might have an invalid state.
 * Returns true if we should skip the redirect callback.
 */
function shouldSkipRedirectCallback(): boolean {
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
  // check if we have a matching transaction in localStorage
  if (hasCode && hasState) {
    const state = url.searchParams.get("state");
    let hasMatchingTransaction = false;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("a0.spajs.txs")) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed?.state === state) {
              hasMatchingTransaction = true;
              break;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

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

  // On mount, clear stale state and check if we should skip redirect
  useEffect(() => {
    clearStaleAuth0State();
    const shouldSkip = shouldSkipRedirectCallback();
    setSkipRedirect(shouldSkip);
  }, []);

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

  const onRedirectCallback = (appState?: AppState) => {
    // Clear any URL params left over from the callback
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      const cleanUrl = url.pathname + url.search;
      window.history.replaceState({}, "", cleanUrl || "/");
    }
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
