import type { UserPreferences } from "@/lib/apiClient";
import {
  normalizePersonaSelections,
  type PersonaSelection,
} from "@/lib/newsletterPersonaPresets";

export type NewsletterFrequency = "weekly" | "monthly";

type UserPreferencesExtra = UserPreferences["extra"];

type CommunicationPreferences = Record<string, unknown> & {
  newsletter_description?: string | null;
  newsletter_frequency?: NewsletterFrequency | null;
  newsletter_persona_selections?: PersonaSelection[] | null;
};

export interface NewsletterPreferenceFields {
  newsletterDescription: string;
  newsletterFrequency: NewsletterFrequency;
  newsletterPersonaSelections: PersonaSelection[];
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

function isPersonaSelectionsArray(value: unknown): value is PersonaSelection[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).detail === "string"
  );
}

export function readNewsletterPreferenceFields(
  extra: UserPreferencesExtra
): NewsletterPreferenceFields {
  const communicationPreferences = getCommunicationPreferences(extra);

  const rawSelections = communicationPreferences.newsletter_persona_selections;

  return {
    newsletterDescription:
      typeof communicationPreferences.newsletter_description === "string"
        ? communicationPreferences.newsletter_description
        : "",
    newsletterFrequency:
      communicationPreferences.newsletter_frequency === "monthly"
        ? "monthly"
        : "weekly",
    newsletterPersonaSelections: isPersonaSelectionsArray(rawSelections)
      ? normalizePersonaSelections(rawSelections)
      : [],
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
    newsletter_persona_selections:
      fields.newsletterPersonaSelections.length > 0
        ? fields.newsletterPersonaSelections
        : null,
  };
}
