import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient, executeRawQuery } from "@/lib/db"

const VALID_TYPES = ["accurate", "wrong"] as const
const VALID_PAGE_TYPES = ["story", "city", "metric", "category", "district"] as const

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim() : ""
  const feedbackType = typeof body.feedbackType === "string" ? body.feedbackType : ""
  const pageType = typeof body.pageType === "string" ? body.pageType : null
  const explanation = typeof body.explanation === "string" ? body.explanation.trim().slice(0, 2000) : ""

  if (!pageUrl || !pageUrl.startsWith("/") || pageUrl.length > 500) {
    return NextResponse.json({ error: "Invalid pageUrl" }, { status: 400 })
  }
  if (!VALID_TYPES.includes(feedbackType as (typeof VALID_TYPES)[number])) {
    return NextResponse.json({ error: "feedbackType must be 'accurate' or 'wrong'" }, { status: 400 })
  }
  if (pageType && !VALID_PAGE_TYPES.includes(pageType as (typeof VALID_PAGE_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid pageType" }, { status: 400 })
  }
  if (feedbackType === "wrong" && !explanation) {
    return NextResponse.json({ error: "Explanation required when reporting a problem" }, { status: 400 })
  }

  // Hash IP for rate limiting (daily salt so hashes can't be correlated across days)
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown"
  const salt = process.env.FEEDBACK_SALT || "tc-feedback-salt"
  const dateKey = new Date().toISOString().slice(0, 10)
  const ipHash = crypto.createHash("sha256").update(`${ip}:${dateKey}:${salt}`).digest("hex")

  // Server-side rate limit: 1 submission per page per 5 minutes per IP
  try {
    const { data: existing } = await executeRawQuery<{ n: number }>(
      `SELECT 1 AS n FROM page_feedback WHERE ip_hash = $1 AND page_url = $2 AND created_at > NOW() - INTERVAL '5 minutes' LIMIT 1`,
      [ipHash, pageUrl]
    )
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Please wait before submitting again" }, { status: 429 })
    }
  } catch {
    // If rate-limit check fails (e.g. table doesn't exist yet), proceed anyway
  }

  // Insert feedback
  try {
    const db = createClient()
    const { error } = await db.from("page_feedback").insert({
      page_url: pageUrl,
      page_type: pageType,
      feedback_type: feedbackType,
      explanation: explanation || null,
      ip_hash: ipHash,
    })
    if (error) throw error
  } catch (e) {
    console.error("[PageFeedback] DB insert failed:", e)
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
  }

  // Send email notification for "wrong" feedback
  if (feedbackType === "wrong" && process.env.RESEND_API_KEY) {
    const recipient = process.env.FEEDBACK_NOTIFY_EMAIL || "seymour@transparent.city"
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Transparent.city Feedback <feedback@transparent.city>",
          to: recipient,
          subject: `[Page Feedback] Flagged: ${pageUrl}`,
          text: [
            `A visitor flagged a page as inaccurate.`,
            ``,
            `Page: ${pageUrl}`,
            `Type: ${pageType || "unknown"}`,
            ``,
            `What they said:`,
            explanation,
            ``,
            `Time: ${new Date().toISOString()}`,
          ].join("\n"),
        }),
      })
    } catch (e) {
      console.error("[PageFeedback] Email send failed:", e)
      // Non-fatal: feedback is already in the database
    }
  }

  return NextResponse.json({ ok: true })
}
