import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, city, district, source } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // TODO: Integrate with Transparent City's email/CRM system.
    // For now, log the subscription and return success.
    console.log("[subscribe]", { email, city, district, source });

    return NextResponse.json({
      success: true,
      message: "You're in. We'll send your first update when new data publishes.",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
