import { NextResponse } from "next/server";

/**
 * DEPRECATED: This endpoint is not used by any frontend code.
 * All user signups go through Auth0 (OAuth or passwordless email).
 * Newsletter subscriptions are managed via the platform backend after Auth0 signup.
 *
 * Kept as a placeholder in case a lightweight pre-auth email capture is needed later.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    // Not connected to any backend. All signups go through Auth0.
    return NextResponse.json({
      success: true,
      message: "You're in. We'll send your first update when new data publishes.",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
