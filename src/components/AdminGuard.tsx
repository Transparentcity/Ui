"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMyPermissions, type UserPermissions } from "@/lib/apiClient";
import { setFoiaAuthToken } from "@/lib/foiaApiClient";
import { useImpersonationCacheKey } from "@/lib/impersonation";
import Loader from "@/components/Loader";

interface AdminGuardProps {
  children: React.ReactNode;
  fallbackUrl?: string;
}

/**
 * Protects CRM routes by checking if the user is an admin.
 * Redirects non-admins to the fallback URL (default: /home).
 *
 * The permissions lookup runs through React Query so that concurrent guards
 * and re-renders share a single cached request. Previously this lived in a
 * useEffect whose dependencies (Auth0's getAccessTokenSilently /
 * loginWithRedirect) change identity on every render, which refired the
 * /api/admin/me/permissions call several times per page load.
 *
 * While proxying, ``is_admin`` reflects the *target* user — so admin-only
 * routes are blocked unless you are proxying as another admin.
 */
export function AdminGuard({ children, fallbackUrl = "/home" }: AdminGuardProps) {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const identityKey = useImpersonationCacheKey();

  const permissionsQuery = useQuery<UserPermissions>({
    queryKey: ["admin", "me", "permissions", identityKey],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      setFoiaAuthToken(token);
      return getMyPermissions(token);
    },
    enabled: !authLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isAdmin = permissionsQuery.data ? permissionsQuery.data.is_admin : null;
  const error = permissionsQuery.isError
    ? "Unable to verify admin access. Please try again."
    : null;

  // Redirect unauthenticated users to login.
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    setFoiaAuthToken(null);
    void loginWithRedirect({
      appState: { returnTo: window.location.pathname },
    });
  }, [authLoading, isAuthenticated, loginWithRedirect]);

  // Redirect authenticated non-admins to the fallback.
  useEffect(() => {
    if (isAdmin === false) router.replace(fallbackUrl);
  }, [isAdmin, router, fallbackUrl]);

  // Clear the FOIA token if the permissions lookup fails.
  useEffect(() => {
    if (permissionsQuery.isError) {
      console.error("[AdminGuard] Error checking admin status:", permissionsQuery.error);
      setFoiaAuthToken(null);
    }
  }, [permissionsQuery.isError, permissionsQuery.error]);

  // Show loader while checking auth or admin status
  if (authLoading || !isAuthenticated || permissionsQuery.isPending || isAdmin === null) {
    return <Loader />;
  }

  // Show error if admin check failed
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push(fallbackUrl)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // If not admin, show access denied (should redirect, but just in case)
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You need admin access to view this page.</p>
          <button
            onClick={() => router.push(fallbackUrl)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // User is admin, render children
  return <>{children}</>;
}
