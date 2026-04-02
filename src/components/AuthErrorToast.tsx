"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const FRIENDLY_MESSAGES: Record<string, string> = {
  "the connection was not found":
    "Email sign-in is temporarily unavailable. Please try again later.",
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
