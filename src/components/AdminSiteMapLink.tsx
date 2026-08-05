"use client";

import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import { getMyPermissions, type UserPermissions } from "@/lib/apiClient";
import { useImpersonationCacheKey } from "@/lib/impersonation";

interface AdminSiteMapLinkProps {
  className?: string;
  children: React.ReactNode;
}

/** Sitemap is an admin-only destination in the logged-in product. */
export default function AdminSiteMapLink({ className, children }: AdminSiteMapLinkProps) {
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const identityKey = useImpersonationCacheKey();

  const permissionsQuery = useQuery<UserPermissions>({
    queryKey: ["admin", "me", "permissions", identityKey],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getMyPermissions(token);
    },
    enabled: !isLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (!permissionsQuery.data?.is_admin) return null;

  return (
    <Link href="/sitemap" className={className}>
      {children}
    </Link>
  );
}
