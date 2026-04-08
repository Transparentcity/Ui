"use client";

import { useAuth0 } from "@auth0/auth0-react";

/**
 * Renders children only when the user is NOT authenticated.
 * Use to wrap signup CTAs and other logged-out-only sections.
 */
export default function LoggedOutOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth0();
  if (isAuthenticated) return null;
  return <>{children}</>;
}
