/**
 * Google Analytics 4 (GA4) integration for Transparent.city
 * 
 * Tracks:
 * - Sign up funnel (signup_start, signup_complete, etc.)
 * - User growth rate (first_visit, user_activation)
 * - Traffic sources (automatic via GA4)
 * - SEO and crawler effectiveness (page views, search queries)
 * - Custom events for key user actions
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

/**
 * Track when user starts signup process
 */
export function trackSignupStart(intent: "resident" | "public-servant"): void {
  trackEvent("signup_start", {
    signup_intent: intent,
    event_category: "signup",
    event_label: `Signup started - ${intent}`,
  });
}

/**
 * Track when user clicks signup button (before redirect to Auth0)
 */
export function trackSignupClick(intent: "resident" | "public-servant"): void {
  trackEvent("signup_click", {
    signup_intent: intent,
    event_category: "signup",
    event_label: `Signup clicked - ${intent}`,
  });
}

/**
 * Track when user completes signup (after Auth0 callback)
 */
export function trackSignupComplete(
  intent: "resident" | "public-servant",
  userId?: string
): void {
  trackEvent("signup_complete", {
    signup_intent: intent,
    user_id: userId || "anonymous",
    event_category: "signup",
    event_label: `Signup completed - ${intent}`,
  });
}

/**
 * Track when user logs in (existing user)
 */
export function trackLogin(userId?: string): void {
  trackEvent("login", {
    user_id: userId || "anonymous",
    event_category: "authentication",
    event_label: "User logged in",
  });
}

/**
 * Track when user completes onboarding
 */
export function trackOnboardingComplete(userId?: string): void {
  trackEvent("onboarding_complete", {
    user_id: userId || "anonymous",
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
