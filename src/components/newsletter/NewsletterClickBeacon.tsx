"use client";

/**
 * Records a newsletter click when a recipient lands on the site with
 * ``nl`` (signed token) or ``utm_source=newsletter``.
 *
 * Email clients often follow /e/c, cache the final URL, and send the human
 * there directly — so the redirect hop never sees the real click. This
 * beacon is the human signal for the admin Metrics tab.
 */

import { useEffect, useRef } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

function readParam(params: URLSearchParams, key: string): string {
  return (params.get(key) || "").trim();
}

export default function NewsletterClickBeacon() {
  const sent = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || sent.current) return;
    const params = new URLSearchParams(window.location.search);
    const nl = readParam(params, "nl");
    const utmSource = readParam(params, "utm_source");
    const campaign = readParam(params, "utm_campaign");
    if (!nl && utmSource !== "newsletter") return;
    if (!nl && !campaign) return;

    sent.current = true;
    const body = {
      nl: nl || undefined,
      campaign: campaign || undefined,
      slot: readParam(params, "utm_content") || undefined,
      destination_url: window.location.href,
    };
    try {
      void fetch(`${getApiBaseUrl()}/api/public/newsletter-click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch {
      /* non-fatal */
    }
  }, []);

  return null;
}
