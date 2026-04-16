/**
 * Shared signup entry-point helper.
 *
 * Every surface that can kick off a signup should call `startSignup()` instead
 * of calling `loginWithRedirect` directly. This ensures:
 *  1. GA4 signup_start event fires with correct context.
 *  2. First-party signup_start is written to signup_funnel_events via the backend.
 *  3. The source surface and intent are persisted in localStorage so the
 *     post-auth return in home/page.tsx can correctly attribute the completion.
 *
 * Usage:
 *   const { loginWithRedirect } = useAuth0();
 *   await startSignup(loginWithRedirect, "resident", { source_surface: "city_header", city_slug });
 */

import {
  trackSignupStart,
  trackSignupClick,
  getFunnelSessionId,
  recordFunnelEventBackend,
  type SignupEventContext,
} from "./analytics";

interface StartSignupOptions {
  /** Which UI surface is triggering the signup — shown in the dashboard. */
  source_surface: string;
  city_slug?: string | null;
  city_name?: string | null;
  city_id?: number | null;
  district?: number | null;
  /** Custom Auth0 returnTo URL. Defaults to /home?signup=<intent> */
  returnTo?: string;
  /** Extra query params appended to the default returnTo (e.g. follow_city_slug) */
  returnToParams?: Record<string, string>;
}

export async function startSignup(
  loginWithRedirect: (opts: object) => Promise<void>,
  intent: "resident" | "public-servant",
  options: StartSignupOptions
): Promise<void> {
  const ctx: SignupEventContext = {
    source_surface: options.source_surface,
    signup_intent: intent,
    city_slug: options.city_slug ?? null,
    city_name: options.city_name ?? null,
    city_id: options.city_id ?? null,
    district: options.district ?? null,
    landing_path: typeof window !== "undefined" ? window.location.pathname : null,
    funnel_session_id: getFunnelSessionId(),
  };

  // Fire analytics events before the redirect
  trackSignupStart(intent, ctx);
  trackSignupClick(intent, ctx);
  recordFunnelEventBackend("signup_start", ctx);

  // Persist intent + surface so the post-auth return can attribute correctly
  if (typeof window !== "undefined") {
    window.localStorage.setItem("transparentcity.signup_intent", intent);
    window.localStorage.setItem("transparentcity.signup_surface", options.source_surface);

    // City context for follow-city flows
    if (options.city_slug) {
      window.localStorage.setItem("transparentcity.follow_city_slug", options.city_slug);
    }
    if (options.city_name) {
      window.localStorage.setItem("transparentcity.follow_city_name", options.city_name);
    }
    if (options.city_id != null) {
      window.localStorage.setItem("transparentcity.follow_city_id", String(options.city_id));
    }
  }

  // Build the returnTo URL
  let returnTo = options.returnTo;
  if (!returnTo) {
    const params = new URLSearchParams({ signup: intent });
    if (options.returnToParams) {
      Object.entries(options.returnToParams).forEach(([k, v]) => params.set(k, v));
    }
    returnTo = `/home?${params.toString()}`;
  }

  await loginWithRedirect({
    authorizationParams: { screen_hint: "signup" },
    appState: { returnTo },
  });
}
