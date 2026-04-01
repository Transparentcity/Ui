import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pageUrl, pageType, feedbackType, explanation, submitterName, submitterEmail } = body;

    if (!pageUrl || !feedbackType) {
      return NextResponse.json(
        { error: "pageUrl and feedbackType are required" },
        { status: 400 },
      );
    }

    if (!["accurate", "wrong"].includes(feedbackType)) {
      return NextResponse.json(
        { error: "feedbackType must be 'accurate' or 'wrong'" },
        { status: 400 },
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    const db = createClient();
    const { error } = await db.from("page_feedback").insert({
      page_url: pageUrl,
      page_type: pageType || null,
      feedback_type: feedbackType,
      explanation: (explanation || "").slice(0, 2000),
      ip_address: ip,
      submitter_name: (submitterName || "").slice(0, 200) || null,
      submitter_email: (submitterEmail || "").slice(0, 320) || null,
    });

    if (error) {
      console.error("[PageFeedback] DB insert error:", error);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[PageFeedback] Unexpected error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
