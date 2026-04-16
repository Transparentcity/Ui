/**
 * First-party product analytics — the generalizable way to log any product event.
 *
 * Usage patterns:
 *
 *   // 1. React hook — fires once when a component mounts (page views, etc.)
 *   useProductEvent("city_page_view", { city_slug: "san-francisco", city_id: 42 })
 *
 *   // 2. Imperative — fire anywhere in response to user actions
 *   recordProductEvent("signup_cta_click", { source_surface: "city_header" })
 *
 *   // 3. With an auth token (post-auth events)
 *   recordProductEvent("signup_complete", { city_slug }, token)
 *
 * Every event automatically picks up:
 *   - session_id   from sessionStorage (stable across the Auth0 redirect)
 *   - path         from window.location.pathname
 *   - referrer     from document.referrer
 *   - utm_*        parsed from sessionStorage (set on first landing)
 *
 * The backend endpoint is POST /api/public/event (no auth required for most events).
 * Failures are silently swallowed — analytics must never break the user flow.
 */

"use client";

import { useEffect, useRef } from "react";
import { API_BASE } from "./apiBase";

// ---------------------------------------------------------------------------
// Session ID (stable across Auth0 redirect)
// ---------------------------------------------------------------------------

export function getProductSessionId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "tc_product_session_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// UTM persistence — capture on first landing, reuse throughout the session
// ---------------------------------------------------------------------------

function captureUtm(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const store = (key: string) => {
    const val = params.get(key);
    if (val) sessionStorage.setItem(`tc_utm_${key}`, val);
  };
  ["utm_source", "utm_medium", "utm_campaign"].forEach(store);
  return {
    utm_source: sessionStorage.getItem("tc_utm_utm_source"),
    utm_medium: sessionStorage.getItem("tc_utm_utm_medium"),
    utm_campaign: sessionStorage.getItem("tc_utm_utm_campaign"),
  };
}

// ---------------------------------------------------------------------------
// Core context type
// ---------------------------------------------------------------------------

export interface ProductEventContext {
  city_id?: number | null;
  city_slug?: string | null;
  /** Any extra event-specific fields go into properties */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal send function
// ---------------------------------------------------------------------------

function _send(
  eventName: string,
  ctx: ProductEventContext = {},
  token?: string
): void {
  if (typeof window === "undefined") return;

  const { city_id, city_slug, ...rest } = ctx;
  const utm = captureUtm();

  const payload = {
    event_name: eventName,
    session_id: getProductSessionId(),
    path: window.location.pathname,
    referrer: document.referrer || null,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    city_id: city_id ?? null,
    city_slug: city_slug ?? null,
    // Everything else goes into properties
    properties: Object.keys(rest).length > 0 ? rest : undefined,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  fetch(`${API_BASE}/api/public/event`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    // keepalive so the request survives page unloads
    keepalive: true,
  }).catch(() => {
    // silently swallow
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Imperative event recording — use anywhere (event handlers, effects, etc.).
 */
export function recordProductEvent(
  eventName: string,
  ctx: ProductEventContext = {},
  token?: string
): void {
  _send(eventName, ctx, token);
}

/**
 * React hook — fires `eventName` once when the component mounts.
 *
 * Safe to call in server components (no-ops) because it uses `useEffect`.
 * Safe to call multiple times — the `once` guarantee is enforced via a ref.
 *
 * @example
 *   useProductEvent("city_page_view", { city_slug: "san-francisco", city_id: 42 })
 */
export function useProductEvent(
  eventName: string,
  ctx: ProductEventContext = {},
  token?: string
): void {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    _send(eventName, ctx, token);
    // We intentionally don't include ctx/token in the deps array — this hook
    // is designed to fire once on mount with the values available at that time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName]);
}
