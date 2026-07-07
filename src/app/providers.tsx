"use client";

import { Auth0Provider, type AppState } from "@auth0/auth0-react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Auth0RecoveryProvider } from "@/components/Auth0RecoveryProvider";
import ProductAnalyticsTracker from "@/components/ProductAnalyticsTracker";
import { getAuth0ApiAudience } from "@/lib/auth0ApiAudience";
import { queryClient } from "@/lib/queryClient";
import {
  wastePersister,
  shouldPersistQuery,
  WASTE_CACHE_BUSTER,
  WASTE_CACHE_MAX_AGE,
} from "@/lib/wasteQueryPersister";

interface AuthProviderProps {
  children: ReactNode;
}

const AUTH0_TXN_KEY_PREFIX = "a0.spajs.txs";

function getAuth0TransactionStorages(): Storage[] {
  if (typeof window === "undefined") return [];
  const storages: Storage[] = [];
  try {
    storages.push(sessionStorage);
  } catch {
    /* ignore */
  }
  try {
    storages.push(localStorage);
  } catch {
    /* ignore */
  }
  return storages;
}

/**
 * Clear stale Auth0 transaction state from browser storage.
 * This prevents "Invalid state" errors when users click the back button
 * during or after an auth flow.
 */
function clearStaleAuth0State() {
  if (typeof window === "undefined") return;

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  getAuth0TransactionStorages().forEach((storage) => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(AUTH0_TXN_KEY_PREFIX)) {
        // Check if the transaction is stale (older than 5 minutes)
        try {
          const value = storage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            const createdAt = parsed?.created_at || 0;
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
    keysToRemove.forEach((key) => storage.removeItem(key));
  });
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

    getAuth0TransactionStorages().forEach((storage) => {
      if (hasMatchingTransaction) return;

      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(AUTH0_TXN_KEY_PREFIX)) {
          try {
            const value = storage.getItem(key);
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
    });

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
  const audience = getAuth0ApiAudience();

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
      onRedirectCallback={onRedirectCallback}
      skipRedirectCallback={skipRedirect}
    >
      <Auth0RecoveryProvider>
        {/* PersistQueryClientProvider = QueryClientProvider + cross-visit
            persistence. Only waste-module queries are persisted (see
            shouldPersistQuery); everything else behaves exactly as before. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: wastePersister,
            buster: WASTE_CACHE_BUSTER,
            maxAge: WASTE_CACHE_MAX_AGE,
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
            // Restored queries must outlive the client's default 10-min
            // gcTime: the persister rewrites the whole entry on every cache
            // change, so a query GC'd from memory before its hook mounts
            // would be dropped from disk on the next write.
            hydrateOptions: {
              defaultOptions: { queries: { gcTime: WASTE_CACHE_MAX_AGE } },
            },
          }}
        >
          <ProductAnalyticsTracker />
          {children}
          {process.env.NODE_ENV === "development" && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </PersistQueryClientProvider>
      </Auth0RecoveryProvider>
    </Auth0Provider>
  );
}
