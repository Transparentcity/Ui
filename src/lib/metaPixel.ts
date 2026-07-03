/**
 * Meta (Facebook) Pixel integration for Transparent.city
 *
 * Mirrors the Google Analytics module (`src/lib/analytics.ts`) so the two
 * trackers stay in lock-step across the signup funnel:
 *
 *   PageView (every route)                          → Meta `PageView`
 *   signup_start   (CTA → Auth0 hosted login)       → Meta `InitiateCheckout`
 *   signup_complete (account created, back in app)  → Meta `CompleteRegistration`
 *   onboarding step viewed (WelcomeModal)           → custom `OnboardingStep`
 *   onboarding_complete                             → Meta `Subscribe`
 *
 * The base pixel code and PageView are injected once by the <MetaPixel />
 * client component (see `src/components/MetaPixel.tsx`). Every helper here is
 * a no-op when the pixel is unavailable, so tracking can never break the
 * signup flow.
 */

import type { SignupEventContext } from "./analytics";

type FbqParams = Record<string, unknown>;

/** Meta Pixel `fbq` stub — single call signature avoids TS overload/`never` issues. */
type FbqFn = ((command: string, ...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

/**
 * Pixel ID. Configurable via `NEXT_PUBLIC_META_PIXEL_ID`, with a fallback to
 * the production Transparent.city pixel so the base code works out of the box.
 */
export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || "2763485900673899";

/** True once the pixel base code has loaded and a pixel ID is configured. */
export function isMetaPixelEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.fbq === "function" &&
    !!META_PIXEL_ID
  );
}

/**
 * Inject the Meta Pixel base code and initialize the pixel.
 * Idempotent — safe to call on every mount. Fires the initial `PageView`.
 * Call this once when the app loads (from <MetaPixel />).
 */
export function initializeMetaPixel(): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;

  // Already initialized — the stub below sets window.fbq synchronously.
  if (window.fbq) return;

  /* eslint-disable */
  // Standard Meta Pixel bootstrap (from Meta's snippet), adapted to inject the
  // loader script only when it is not already present.
  (function (f: any, b: any, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  // Early `if (window.fbq) return` narrows fbq to undefined for the rest of the
  // function; the bootstrap assigns via `any`, so assert the post-init type.
  const fbq = window.fbq as unknown as FbqFn;
  fbq("init", META_PIXEL_ID);
  fbq("track", "PageView");
}

/**
 * Track a page view on client-side navigation (Next.js App Router).
 * The initial PageView is fired by initializeMetaPixel().
 */
export function trackMetaPageView(): void {
  if (!isMetaPixelEnabled()) return;
  window.fbq?.("track", "PageView");
}

/** Fire a Meta *standard* event (e.g. CompleteRegistration, Subscribe). */
export function trackMetaEvent(eventName: string, params?: FbqParams): void {
  if (!isMetaPixelEnabled()) return;
  window.fbq?.("track", eventName, params);
}

/** Fire a Meta *custom* event (arbitrary name, no standard schema). */
export function trackMetaCustomEvent(
  eventName: string,
  params?: FbqParams
): void {
  if (!isMetaPixelEnabled()) return;
  window.fbq?.("trackCustom", eventName, params);
}

// ============================================================================
// SIGNUP FUNNEL EVENTS
// ============================================================================

/** Flatten a SignupEventContext into pixel-friendly custom parameters. */
function metaCtxParams(ctx?: SignupEventContext): FbqParams {
  if (!ctx) return {};
  return {
    ...(ctx.city_id != null && { city_id: ctx.city_id }),
    ...(ctx.city_slug && { city_slug: ctx.city_slug }),
    ...(ctx.city_name && { city_name: ctx.city_name }),
    ...(ctx.district != null && { district: ctx.district }),
    ...(ctx.source_surface && { source_surface: ctx.source_surface }),
    ...(ctx.signup_intent && { signup_intent: ctx.signup_intent }),
  };
}

/**
 * User has begun signup (CTA clicked, about to redirect to Auth0 or send a
 * magic link). Top-of-funnel conversion → Meta `InitiateCheckout`.
 */
export function trackMetaSignupStart(
  intent: "resident" | "public-servant" | "subscriber",
  ctx?: SignupEventContext
): void {
  trackMetaEvent("InitiateCheckout", {
    content_category: "signup",
    signup_intent: intent,
    ...metaCtxParams(ctx),
  });
}

/**
 * Account created — the signup confirmation screen shown after the user
 * completes the first step (username + password on Auth0) and returns to the
 * app. Primary conversion → Meta `CompleteRegistration`.
 */
export function trackMetaSignupComplete(
  intent: "resident" | "public-servant" | "subscriber",
  ctx?: SignupEventContext
): void {
  trackMetaEvent("CompleteRegistration", {
    content_name: "signup",
    status: true,
    signup_intent: intent,
    ...metaCtxParams(ctx),
  });
}

/** A single onboarding step in the WelcomeModal became visible. */
export function trackMetaOnboardingStep(step: string): void {
  trackMetaCustomEvent("OnboardingStep", { step });
}

/**
 * User finished onboarding (WelcomeModal completed). Bottom-of-funnel
 * conversion → Meta `Subscribe`.
 */
export function trackMetaOnboardingComplete(ctx?: SignupEventContext): void {
  trackMetaEvent("Subscribe", {
    content_name: "onboarding",
    ...metaCtxParams(ctx),
  });
}
