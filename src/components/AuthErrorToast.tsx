"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const FRIENDLY_MESSAGES: Record<string, string> = {
  "the connection was not found":
    "Email sign-in is not set up for this app yet. In Auth0, enable the Passwordless Email connection for your application (Applications → Connections).",
  "the connection is not enabled":
    "Email sign-in is not enabled for this app. In Auth0: Authentication → Passwordless → Email ON, then Applications → your app → Connections → enable Email.",
  "connection is disabled":
    "Email sign-in is not enabled for this app. In Auth0: Authentication → Passwordless → Email ON, then Applications → your app → Connections → enable Email.",
  "no connections enabled":
    "No sign-in methods are enabled for this app. In Auth0, open Applications → your app → Connections and turn on Email (passwordless) and/or Database.",
};

function getFriendlyMessage(description: string): string {
  const key = description.toLowerCase();
  for (const [pattern, message] of Object.entries(FRIENDLY_MESSAGES)) {
    if (key.includes(pattern)) return message;
  }
  return description;
}

export default function AuthErrorToast() {
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;

    const url = new URL(window.location.href);
    const error = url.searchParams.get("error");
    const description = url.searchParams.get("error_description");

    if (!error) return;
    shown.current = true;

    const message = description
      ? getFriendlyMessage(description)
      : "Something went wrong during sign-in. Please try again.";

    toast.error(message, { duration: 8000 });

    // Clean error params from URL
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("state");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  return null;
}
