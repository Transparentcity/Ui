/**
 * Gift recipient onboarding context persisted across auth redirect.
 */

import type { GiftMetaResponse } from "@/lib/apiClient";

export const GIFT_ONBOARDING_STORAGE_KEY = "transparentcity.gift_onboard";

export type GiftOnboardingKind = "gift" | "substack_migration";

export interface GiftOnboardingContext {
  token: string;
  kind: GiftOnboardingKind;
  recipientEmail: string;
  recipientName: string | null;
  gifterDisplay: string;
  placeLabel: string | null;
  placeName: string | null;
  cityId: number | null;
  cityName: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  customPrompt: string | null;
}

export function giftMetaToOnboardingContext(
  token: string,
  meta: GiftMetaResponse
): GiftOnboardingContext {
  return {
    token,
    kind: meta.kind === "substack_migration" ? "substack_migration" : "gift",
    recipientEmail: meta.recipient_email,
    recipientName: meta.recipient_name,
    gifterDisplay: meta.gifter_display,
    placeLabel: meta.place_label,
    placeName: meta.place_name,
    cityId: meta.city_id,
    cityName: meta.city_name,
    district: meta.district,
    lat: meta.lat,
    lng: meta.lng,
    customPrompt: meta.custom_prompt,
  };
}

export function persistGiftOnboardingContext(ctx: GiftOnboardingContext): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GIFT_ONBOARDING_STORAGE_KEY, JSON.stringify(ctx));
}

export function readGiftOnboardingContext(): GiftOnboardingContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(GIFT_ONBOARDING_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GiftOnboardingContext;
  } catch {
    return null;
  }
}

export function clearGiftOnboardingContext(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GIFT_ONBOARDING_STORAGE_KEY);
}

/**
 * Default first name from the email local-part (before the @), dropping any
 * plus-alias suffix. Used for Substack-migration claims where the imported
 * name is unreliable.
 */
export function emailLocalPartFirstName(email: string | null | undefined): string {
  const local = (email || "").split("@")[0].split("+")[0].trim();
  return local;
}

/** Split "First Last" gift recipient name into profile fields. */
export function splitGiftRecipientName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name || "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
