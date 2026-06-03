/**
 * DEPRECATED — superseded by the backend /api/user/me/send-onboarding-welcome endpoint.
 *
 * CityNotFoundModal and WelcomeModal now call the backend directly via
 * sendOnboardingWelcomeEmail() in apiClient.ts.  This route is kept as a
 * 410 stub so any stale client calls fail loudly during the transition rather
 * than silently.  Remove this file once no references remain.
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use POST /api/user/me/send-onboarding-welcome instead." },
    { status: 410 },
  );
}
