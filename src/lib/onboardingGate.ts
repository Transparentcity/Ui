import type { UserPreferences } from "@/lib/apiClient";

/**
 * Whether the user should see the WelcomeModal onboarding flow.
 * Matches the guard in home/page.tsx effect 2: completed flag or any saved city
 * means onboarding is done.
 */
export function userNeedsOnboardingWelcome(
  prefs: Pick<UserPreferences, "has_completed_onboarding">,
  savedCitiesCount: number,
): boolean {
  if (prefs.has_completed_onboarding) return false;
  return savedCitiesCount === 0;
}
