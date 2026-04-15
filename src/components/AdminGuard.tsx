"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyPermissions, type UserPermissions } from "@/lib/apiClient";
import { setFoiaAuthToken } from "@/lib/foiaApiClient";
import Loader from "@/components/Loader";

interface AdminGuardProps {
  children: React.ReactNode;
  fallbackUrl?: string;
}

/**
 * Protects CRM routes by checking if the user is an admin.
 * Redirects non-admins to the fallback URL (default: /home).
 */
export function AdminGuard({ children, fallbackUrl = "/home" }: AdminGuardProps) {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAdminStatus() {
      // Wait for auth to finish loading
      if (authLoading) return;

      // If not authenticated, redirect to login
      if (!isAuthenticated) {
        setFoiaAuthToken(null);
        await loginWithRedirect({
          appState: { returnTo: window.location.pathname },
        });
        return;
      }

      try {
        setIsCheckingAdmin(true);
        const token = await getAccessTokenSilently();
        setFoiaAuthToken(token);
        const permissions: UserPermissions = await getMyPermissions(token);
        
        if (permissions.is_admin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          // Redirect non-admins
          router.replace(fallbackUrl);
        }
      } catch (err) {
        console.error("[AdminGuard] Error checking admin status:", err);
        setFoiaAuthToken(null);
        setError("Unable to verify admin access. Please try again.");
        setIsAdmin(false);
      } finally {
        setIsCheckingAdmin(false);
      }
    }

    checkAdminStatus();
  }, [isAuthenticated, authLoading, getAccessTokenSilently, loginWithRedirect, router, fallbackUrl]);

  // Show loader while checking auth or admin status
  if (authLoading || isCheckingAdmin || isAdmin === null) {
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
