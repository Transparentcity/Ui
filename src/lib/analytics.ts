/**
 * Google Analytics 4 (GA4) integration for Transparent.city
 *
 * Tracks:
 * - Sign up funnel (signup_landing_view → signup_cta_click → signup_start →
 *     signup_auth_return → signup_complete → onboarding_complete)
 * - User growth rate (first_visit, user_activation)
 * - Traffic sources (automatic via GA4)
 * - SEO and crawler effectiveness (page views, search queries)
 * - Custom events for key user actions
 *
 * All signup events accept a `SignupEventContext` payload so that city, district,
 * source surface, and UTM parameters are attached to every event in the funnel.
 * This enables city-level drilldowns in the admin dashboard without relying only
 * on server-side GA4 reporting.
 */

declare global {
  interface Window {
    gtag?: (
      command: string,
      targetId: string | Date,
      config?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

// ============================================================================
// SHARED SIGNUP EVENT CONTEXT
// ============================================================================

/**
 * Canonical context attached to every signup funnel GA4 event.
 * All fields are optional so callers can provide only what they know.
 */
export interface SignupEventContext {
  /** Numeric city ID (db) when known */
  city_id?: number | null;
  /** URL slug of the city page the user was viewing */
  city_slug?: string | null;
  /** Human-readable city name */
  city_name?: string | null;
  /** District number when signup originated from a district CTA */
  district?: number | null;
  /** Which UI surface triggered the signup */
  source_surface?:
    | "city_header"
    | "city_nav_bar"
    | "auth_modal"
    | "add_your_city"
    | "claim_profile"
    | "nav_email"
    | "mobile_bar"
    | "customize_metrics"
    | string
    | null;
  /** signup_intent value (resident / public-servant / subscriber) */
  signup_intent?: "resident" | "public-servant" | "subscriber" | null;
  /** URL path where the funnel began */
  landing_path?: string | null;
  /** Anonymous session key for pre-auth stitching (set in localStorage) */
  funnel_session_id?: string | null;
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Check if Google Analytics is enabled and available
 */
export function isAnalyticsEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.gtag === "function" &&
    !!GA_MEASUREMENT_ID
  );
}

/**
 * Initialize Google Analytics
 * Call this once when the app loads
 */
export function initializeAnalytics(): void {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) {
    return;
  }

  // Initialize dataLayer if it doesn't exist
  window.dataLayer = window.dataLayer || [];

  // Load gtag script if not already loaded
  if (!document.querySelector(`script[src*="gtag"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialize gtag function
    window.gtag = function (
      command: string,
      targetId: string | Date,
      config?: Record<string, unknown>
    ) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(arguments);
    };

    // Configure GA
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      page_path: window.location.pathname,
      send_page_view: false, // We'll send page views manually for better control
    });
  }
}

/**
 * Track a page view
 * Use this for client-side navigation (Next.js App Router)
 */
export function trackPageView(path: string, title?: string): void {
  if (!isAnalyticsEnabled()) return;

  window.gtag?.("config", GA_MEASUREMENT_ID!, {
    page_path: path,
    page_title: title || document.title,
  });
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  parameters?: Record<string, unknown>
): void {
  if (!isAnalyticsEnabled()) return;

  window.gtag?.("event", eventName, {
    ...parameters,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// SIGNUP FUNNEL EVENTS
// ============================================================================

/** Build a shared parameter block from a SignupEventContext. */
function _signupCtxParams(ctx?: SignupEventContext): Record<string, unknown> {
  if (!ctx) return {};
  return {
    ...(ctx.city_id != null && { city_id: ctx.city_id }),
    ...(ctx.city_slug && { city_slug: ctx.city_slug }),
    ...(ctx.city_name && { city_name: ctx.city_name }),
    ...(ctx.district != null && { district: ctx.district }),
    ...(ctx.source_surface && { source_surface: ctx.source_surface }),
    ...(ctx.landing_path && { landing_path: ctx.landing_path }),
    ...(ctx.funnel_session_id && { funnel_session_id: ctx.funnel_session_id }),
  };
}

/**
 * Read or create a stable anonymous funnel session ID stored in sessionStorage.
 * Survives the Auth0 redirect round-trip because Auth0 returns to the same origin.
 */
export function getFunnelSessionId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "tc_funnel_session_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `fsid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Track when a landing / city page is viewed in the signup context.
 * This is the top of the funnel — fires once per meaningful page paint.
 */
export function trackSignupLandingView(ctx?: SignupEventContext): void {
  trackEvent("signup_landing_view", {
    ..._signupCtxParams(ctx),
    event_category: "signup",
    event_label: ctx?.city_slug
      ? `Landing: /c/${ctx.city_slug}`
      : "Landing: general",
  });
}

/**
 * Track when a user clicks a signup CTA button (before choosing intent).
 */
export function trackSignupCtaClick(ctx?: SignupEventContext): void {
  trackEvent("signup_cta_click", {
    ..._signupCtxParams(ctx),
    event_category: "signup",
    event_label: ctx?.source_surface
      ? `CTA clicked: ${ctx.source_surface}`
      : "CTA clicked",
  });
}

/**
 * Track when user starts signup process (intent chosen, about to redirect to Auth0).
 */
export function trackSignupStart(
  intent: "resident" | "public-servant" | "subscriber",
  ctx?: SignupEventContext
): void {
  trackEvent("signup_start", {
    signup_intent: intent,
    ..._signupCtxParams({ ...ctx, signup_intent: intent }),
    event_category: "signup",
    event_label: `Signup started - ${intent}`,
  });
}

/**
 * Track when user clicks signup button (before redirect to Auth0).
 * @deprecated Use trackSignupStart – kept for backwards compat.
 */
export function trackSignupClick(
  intent: "resident" | "public-servant" | "subscriber",
  ctx?: SignupEventContext
): void {
  trackEvent("signup_click", {
    signup_intent: intent,
    ..._signupCtxParams({ ...ctx, signup_intent: intent }),
    event_category: "signup",
    event_label: `Signup clicked - ${intent}`,
  });
}

/**
 * Track when Auth0 returns the user after the redirect (pre-onboarding).
 */
export function trackSignupAuthReturn(ctx?: SignupEventContext): void {
  trackEvent("signup_auth_return", {
    ..._signupCtxParams(ctx),
    event_category: "signup",
    event_label: "Auth0 return after signup",
  });
}

/**
 * Track when user completes signup (after Auth0 callback + user record confirmed).
 */
export function trackSignupComplete(
  intent: "resident" | "public-servant" | "subscriber",
  userId?: string,
  ctx?: SignupEventContext
): void {
  trackEvent("signup_complete", {
    signup_intent: intent,
    user_id: userId || "anonymous",
    ..._signupCtxParams({ ...ctx, signup_intent: intent }),
    event_category: "signup",
    event_label: `Signup completed - ${intent}`,
  });
}

/**
 * Track when user logs in (existing user).
 */
export function trackLogin(userId?: string): void {
  trackEvent("login", {
    user_id: userId || "anonymous",
    event_category: "authentication",
    event_label: "User logged in",
  });
}

/**
 * Track when user completes onboarding (WelcomeModal dismissed / city selected).
 */
export function trackOnboardingComplete(
  userId?: string,
  ctx?: SignupEventContext
): void {
  trackEvent("onboarding_complete", {
    user_id: userId || "anonymous",
    ..._signupCtxParams(ctx),
    event_category: "onboarding",
    event_label: "User completed onboarding",
  });
}

// ============================================================================
// USER GROWTH EVENTS
// ============================================================================

/**
 * Track first visit (new user)
 */
export function trackFirstVisit(): void {
  const hasVisited = sessionStorage.getItem("tc_has_visited");
  if (!hasVisited) {
    sessionStorage.setItem("tc_has_visited", "true");
    trackEvent("first_visit", {
      event_category: "engagement",
      event_label: "First visit to site",
    });
  }
}

/**
 * Track user activation (user completes key action)
 */
export function trackUserActivation(action: string): void {
  trackEvent("user_activation", {
    activation_action: action,
    event_category: "engagement",
    event_label: `User activated via ${action}`,
  });
}

/**
 * Track when user saves their first city
 */
export function trackCitySaved(cityId: number, cityName: string): void {
  trackEvent("city_saved", {
    city_id: cityId,
    city_name: cityName,
    event_category: "engagement",
    event_label: `City saved: ${cityName}`,
  });
}

/**
 * Track when user views a city page
 */
export function trackCityView(citySlug: string, cityId?: number): void {
  trackEvent("city_view", {
    city_slug: citySlug,
    city_id: cityId,
    event_category: "content",
    event_label: `City viewed: ${citySlug}`,
  });
}

/**
 * Track when user views a metric page
 */
export function trackMetricView(
  metricKey: string,
  citySlug: string,
  districtId?: number
): void {
  trackEvent("metric_view", {
    metric_key: metricKey,
    city_slug: citySlug,
    district_id: districtId,
    event_category: "content",
    event_label: `Metric viewed: ${metricKey}`,
  });
}

// ============================================================================
// SEO & CRAWLER TRACKING
// ============================================================================

/**
 * Track search engine referrer
 */
export function trackSearchReferrer(searchQuery?: string): void {
  const referrer = document.referrer;
  const isSearchEngine =
    referrer.includes("google.com") ||
    referrer.includes("bing.com") ||
    referrer.includes("yahoo.com") ||
    referrer.includes("duckduckgo.com");

  if (isSearchEngine && searchQuery) {
    trackEvent("search_referral", {
      search_query: searchQuery,
      referrer: referrer,
      event_category: "seo",
      event_label: `Search referral: ${searchQuery}`,
    });
  }
}

/**
 * Track when user arrives from external link
 */
export function trackExternalReferrer(referrer: string): void {
  trackEvent("external_referral", {
    referrer: referrer,
    event_category: "traffic",
    event_label: `External referral from ${referrer}`,
  });
}

// ============================================================================
// CONTENT ENGAGEMENT
// ============================================================================

/**
 * Track when user clicks on research/article
 */
export function trackResearchClick(researchId: number, title: string): void {
  trackEvent("research_click", {
    research_id: researchId,
    research_title: title,
    event_category: "content",
    event_label: `Research clicked: ${title}`,
  });
}

/**
 * Track when user starts a chat session
 */
export function trackChatStart(sessionId?: string): void {
  trackEvent("chat_start", {
    session_id: sessionId,
    event_category: "engagement",
    event_label: "Chat session started",
  });
}

/**
 * Track when user sends a chat message
 */
export function trackChatMessage(messageLength: number): void {
  trackEvent("chat_message", {
    message_length: messageLength,
    event_category: "engagement",
    event_label: "Chat message sent",
  });
}

/**
 * Track when user views dashboard
 */
export function trackDashboardView(): void {
  trackEvent("dashboard_view", {
    event_category: "engagement",
    event_label: "Dashboard viewed",
  });
}

// ============================================================================
// CONVERSION TRACKING
// ============================================================================

// ============================================================================
// FIRST-PARTY BACKEND EVENT RECORDING
// ============================================================================

/**
 * Fire-and-forget helper: send a signup funnel event to the first-party
 * backend endpoint (/api/public/signup-funnel-event).
 *
 * Accepts an optional Auth0 access token for post-auth events.
 * Failures are swallowed — analytics must never break the signup flow.
 */
export function recordFunnelEventBackend(
  eventName: string,
  ctx?: SignupEventContext,
  token?: string
): void {
  if (typeof window === "undefined") return;

  // Import lazily to avoid circular dependency issues; this module must remain
  // side-effect-free at import time.
  Promise.all([import("@/lib/apiClient"), import("@/lib/productAnalytics")])
    .then(([{ recordSignupFunnelEvent }, { getCapturedUtm }]) => {
      // Reuse the session's captured attribution (incl. fbclid/gclid synthesis)
      // so funnel events don't lose their source and drift into "Direct".
      const utm = getCapturedUtm();
      void recordSignupFunnelEvent(
        {
          event_name: eventName,
          funnel_session_id: ctx?.funnel_session_id ?? null,
          city_id: ctx?.city_id ?? null,
          city_slug: ctx?.city_slug ?? null,
          city_name: ctx?.city_name ?? null,
          district: ctx?.district ?? null,
          signup_intent: ctx?.signup_intent ?? null,
          source_surface: ctx?.source_surface ?? null,
          landing_path: ctx?.landing_path ?? null,
          referrer:
            typeof document !== "undefined" ? document.referrer || null : null,
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
        },
        token
      ).catch(() => {
        // silently swallow
      });
    })
    .catch(() => {
      // silently swallow
    });
}

// ============================================================================
// CONVERSION TRACKING
// ============================================================================

/**
 * Track conversion events (key actions that indicate value)
 */
export function trackConversion(
  conversionType: string,
  value?: number,
  currency?: string
): void {
  trackEvent("conversion", {
    conversion_type: conversionType,
    value: value,
    currency: currency || "USD",
    event_category: "conversion",
    event_label: `Conversion: ${conversionType}`,
  });
}

// ============================================================================
// ERROR TRACKING
// ============================================================================

/**
 * Track errors for debugging
 */
export function trackError(
  errorMessage: string,
  errorLocation?: string,
  errorStack?: string
): void {
  trackEvent("error", {
    error_message: errorMessage,
    error_location: errorLocation,
    error_stack: errorStack?.substring(0, 500), // Limit stack trace length
    event_category: "error",
    event_label: `Error: ${errorMessage}`,
  });
}

// ============================================================================
// INBOX TRACKING
// ============================================================================

export function trackInboxView(props: {
  surface: string;
  unread_count: number;
  total_count: number;
  place_count?: number;
  district_count?: number;
  city_count?: number;
}): void {
  trackEvent("inbox_view", { event_category: "inbox", ...props });
}

export function trackInboxItemOpened(props: {
  item_id: string;
  item_type: string;
  scope: string;
  is_private: boolean;
  city_slug: string | null;
  was_unread: boolean;
  position?: number;
}): void {
  trackEvent("inbox_item_opened", { event_category: "inbox", ...props });
}

export function trackInboxItemBack(props: {
  item_id: string;
  item_type: string;
  time_in_detail_ms?: number;
}): void {
  trackEvent("inbox_item_back", { event_category: "inbox", ...props });
}

export function trackInboxNavClicked(props: {
  surface: string;
  unread_count: number;
}): void {
  trackEvent("inbox_nav_clicked", { event_category: "inbox", ...props });
}
