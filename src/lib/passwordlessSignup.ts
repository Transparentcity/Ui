/**
 * Passwordless (magic link) signup via Auth0 `connection: "email"`.
 *
 * Do not pass `redirect_uri` here — Auth0Provider sets it from `window.location.origin`.
 * Use a narrower scope than the default provider (omit `offline_access`), which can
 * break passwordless authorize requests when refresh tokens are not enabled for email.
 */

import {
  getFunnelSessionId,
  recordFunnelEventBackend,
  trackSignupClick,
  trackSignupStart,
  type SignupEventContext,
} from "./analytics";

const POST_LOGIN_RETURN_KEY = "auth_return_after_check_email";

export type PasswordlessSignupOptions = {
  email: string;
  sourceSurface: string;
  signupIntent?: "resident" | "public-servant";
  citySlug?: string;
  cityName?: string;
  cityId?: number | null;
  /** Stored for /check-email → post-auth redirect (defaults to current path). */
  returnAfterCheckEmail?: string;
};

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.includes("@");
}

export function persistPasswordlessSignupContext(
  options: PasswordlessSignupOptions
): SignupEventContext {
  const intent = options.signupIntent ?? "resident";
  const ctx: SignupEventContext = {
    source_surface: options.sourceSurface,
    signup_intent: intent,
    city_slug: options.citySlug ?? null,
    city_name: options.cityName ?? null,
    city_id: options.cityId ?? null,
    district: null,
    landing_path:
      typeof window !== "undefined" ? window.location.pathname : null,
    funnel_session_id: getFunnelSessionId(),
  };

  if (typeof window === "undefined") return ctx;

  window.localStorage.setItem("transparentcity.signup_intent", intent);
  window.localStorage.setItem("transparentcity.signup_surface", options.sourceSurface);
  if (options.citySlug) {
    window.localStorage.setItem("transparentcity.follow_city_slug", options.citySlug);
  }
  if (options.cityName) {
    window.localStorage.setItem("transparentcity.follow_city_name", options.cityName);
  }
  if (options.cityId != null) {
    window.localStorage.setItem("transparentcity.follow_city_id", String(options.cityId));
  }

  const returnPath =
    options.returnAfterCheckEmail ??
    window.location.pathname + window.location.search;
  if (returnPath && returnPath !== "/check-email") {
    try {
      sessionStorage.setItem(POST_LOGIN_RETURN_KEY, returnPath);
    } catch {
      /* ignore */
    }
  }

  trackSignupStart(intent, ctx);
  trackSignupClick(intent, ctx);
  recordFunnelEventBackend("signup_start", ctx);

  return ctx;
}

export async function startPasswordlessEmailSignup(
  loginWithRedirect: (opts: object) => Promise<void>,
  options: PasswordlessSignupOptions
): Promise<void> {
  const email = options.email.trim();
  if (!isValidEmail(email)) {
    throw new Error("A valid email address is required.");
  }

  persistPasswordlessSignupContext(options);

  await loginWithRedirect({
    authorizationParams: {
      connection: "email",
      login_hint: email,
      scope: "openid profile email",
    },
    appState: { returnTo: "/check-email" },
  });
}

/** Scroll to the get-landing hero email field and focus it. */
export function focusGetLandingHeroSignup(): void {
  if (typeof window === "undefined") return;
  const anchor = document.getElementById("get-hero-signup");
  if (!anchor) return;
  anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = anchor.querySelector('input[type="email"]');
  if (input instanceof HTMLInputElement) {
    window.setTimeout(() => input.focus(), 300);
  }
}
