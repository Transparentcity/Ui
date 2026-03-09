import type { UserPreferences } from "@/lib/apiClient";

export type NewsletterFrequency = "weekly" | "monthly";

type UserPreferencesExtra = UserPreferences["extra"];

type CommunicationPreferences = Record<string, unknown> & {
  newsletter_description?: string | null;
  newsletter_frequency?: NewsletterFrequency | null;
};

export interface NewsletterPreferenceFields {
  newsletterDescription: string;
  newsletterFrequency: NewsletterFrequency;
}

export function normalizeNewsletterDescription(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getCommunicationPreferences(
  extra: UserPreferencesExtra
): CommunicationPreferences {
  const raw = extra?.communication_preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as CommunicationPreferences;
}

export function readNewsletterPreferenceFields(
  extra: UserPreferencesExtra
): NewsletterPreferenceFields {
  const communicationPreferences = getCommunicationPreferences(extra);

  return {
    newsletterDescription:
      typeof communicationPreferences.newsletter_description === "string"
        ? communicationPreferences.newsletter_description
        : "",
    newsletterFrequency:
      communicationPreferences.newsletter_frequency === "monthly"
        ? "monthly"
        : "weekly",
  };
}

export function mergeNewsletterPreferenceFields(
  extra: UserPreferencesExtra,
  fields: NewsletterPreferenceFields
): CommunicationPreferences {
  return {
    ...getCommunicationPreferences(extra),
    newsletter_description: normalizeNewsletterDescription(
      fields.newsletterDescription
    ),
    newsletter_frequency: fields.newsletterFrequency,
  };
}
