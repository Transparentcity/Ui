"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { getMyPermissions } from "@/lib/apiClient";

interface AdminSiteMapLinkProps {
  className?: string;
  children: React.ReactNode;
}

/** Sitemap is an admin-only destination in the logged-in product. */
export default function AdminSiteMapLink({ className, children }: AdminSiteMapLinkProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const permissions = await getMyPermissions(token);
        if (!cancelled) {
          setIsAdmin(Boolean(permissions.is_admin));
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  if (!isAdmin) return null;

  return (
    <Link href="/sitemap" className={className}>
      {children}
    </Link>
  );
}
