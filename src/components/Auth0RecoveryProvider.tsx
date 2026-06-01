"use client";

import {
  Auth0Context,
  type Auth0ContextInterface,
  type GetTokenSilentlyOptions,
  useAuth0,
} from "@auth0/auth0-react";
import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { getApiAccessTokenSilently } from "@/lib/auth0AccessToken";

/**
 * Re-provides Auth0 context with `getAccessTokenSilently` that renews the session
 * on missing refresh tokens or consent errors. Mount inside `Auth0Provider`.
 */
export function Auth0RecoveryProvider({ children }: { children: ReactNode }) {
  const auth = useAuth0();
  const authRef = useRef(auth);
  authRef.current = auth;

  const getAccessTokenSilently = useCallback(
    (options?: GetTokenSilentlyOptions) =>
      getApiAccessTokenSilently(
        (opts) => authRef.current.getAccessTokenSilently(opts),
        (opts) => authRef.current.loginWithRedirect(opts),
        {
          ...options,
          shouldRenewSession: () => authRef.current.isAuthenticated,
        }
      ),
    []
  );

  const value = useMemo<Auth0ContextInterface>(
    () => ({
      ...auth,
      getAccessTokenSilently:
        getAccessTokenSilently as Auth0ContextInterface["getAccessTokenSilently"],
    }),
    [auth, getAccessTokenSilently]
  );

  return (
    <Auth0Context.Provider value={value}>{children}</Auth0Context.Provider>
  );
}
