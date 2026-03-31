"use client";

import { useState } from "react";
import { conversionConfig } from "@/config/conversionConfig";
import { trackEvent } from "@/lib/analytics";

interface EmailCaptureProps {
  headline: string;
  subheadline: string;
  citySlug: string;
  districtSlug?: string;
  pageType: string;
  variant: string;
}

export default function EmailCapture({
  headline,
  subheadline,
  citySlug,
  districtSlug,
  pageType,
  variant,
}: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const config = conversionConfig.emailCapture;

  if (!config.enabled) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setStatus("loading");
    trackEvent("email_captured", {
      page_type: pageType,
      variant,
      city: citySlug,
      district: districtSlug,
    });

    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          city: citySlug,
          district: districtSlug,
          source: `${pageType}_${variant}`,
        }),
      });

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center">
        <p className="text-emerald-800 font-medium">{config.successMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900">{headline}</h3>
      <p className="mt-1 text-sm text-gray-600">{subheadline}</p>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={config.placeholder}
          required
          disabled={status === "loading"}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading" || !email}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? "..." : config.buttonText}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-2 text-sm text-red-600">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
