import type { UserPreferences } from "@/lib/apiClient";

/**
 * Whether the user should see the WelcomeModal onboarding flow.
 * Only `has_completed_onboarding` gates onboarding — not saved-city count.
 * Get-page and city-page signups auto-follow the city before onboarding runs,
 * so checking saved cities would incorrectly skip the welcome flow.
 */
export function userNeedsOnboardingWelcome(
  prefs: Pick<UserPreferences, "has_completed_onboarding">,
): boolean {
  return !prefs.has_completed_onboarding;
}
