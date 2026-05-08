import { NextRequest, NextResponse } from "next/server";
import { sendEmail, isSendGridConfigured } from "@/lib/email-sender";
import { getSiteOrigin } from "@/lib/siteUrl";

const NOTIFY_EMAIL =
  process.env.CITY_SUGGESTION_NOTIFY_EMAIL || "seymour@transparent.city";

type SubmissionKind = "add" | "improve";

interface SubmissionBody {
  kind?: SubmissionKind;
  city?: string;
  dataPortalUrl?: string;
  name?: string;
  email?: string;
  title?: string;
  hasDataExperience?: boolean;
  isCityGovernment?: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clip(value: string | undefined, max: number): string {
  const v = (value ?? "").trim();
  return v.length > max ? v.slice(0, max) : v;
}

function normalizeOrigin(value: string): { protocol: string; host: string } | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return {
      protocol: u.protocol,
      host: u.hostname.replace(/^www\./i, "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

function isAllowedOrigin(rawOrigin: string, siteOrigin: string): boolean {
  if (!rawOrigin) return true;
  const o = normalizeOrigin(rawOrigin);
  if (!o) return false;
  if (o.host === "localhost" || o.host.endsWith(".vercel.app")) return true;
  const s = normalizeOrigin(siteOrigin);
  if (!s) return false;
  return o.protocol === s.protocol && o.host === s.host;
}

function row(label: string, value: string | undefined): string {
  const display = value && value.trim() ? escapeHtml(value) : "<em>(not provided)</em>";
  return `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap;"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 0;">${display}</td></tr>`;
}

export async function POST(req: NextRequest): Promise<Response> {
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const siteOrigin = getSiteOrigin();
  if (!isAllowedOrigin(origin, siteOrigin)) {
    console.warn("[city-suggestion] Blocked origin:", { origin, siteOrigin });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: SubmissionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind: SubmissionKind = body.kind === "improve" ? "improve" : "add";
  const city = clip(body.city, 200);
  const dataPortalUrl = clip(body.dataPortalUrl, 500);
  const name = clip(body.name, 200);
  const email = clip(body.email, 320);
  const title = clip(body.title, 200);
  const hasDataExperience = !!body.hasDataExperience;
  const isCityGovernment = !!body.isCityGovernment;

  if (!city) {
    return NextResponse.json(
      { error: "city is required" },
      { status: 400 },
    );
  }
  if (kind === "improve" && !email) {
    return NextResponse.json(
      { error: "email is required for improve submissions" },
      { status: 400 },
    );
  }

  if (!isSendGridConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[city-suggestion] SendGrid not configured; logging submission:", {
        kind,
        city,
        dataPortalUrl,
        name,
        email,
        title,
        hasDataExperience,
        isCityGovernment,
      });
      return NextResponse.json({ sent: false, reason: "email_not_configured" });
    }
    return NextResponse.json(
      { error: "Email sending not configured" },
      { status: 503 },
    );
  }

  const subjectPrefix = kind === "add" ? "ADD MY CITY" : "IMPROVE MY CITY'S DATA";
  const subject = `[${subjectPrefix}] ${city}`;

  const heading =
    kind === "add"
      ? "New city suggestion"
      : "City data improvement request";

  const rows: string[] = [
    row("Type", subjectPrefix),
    row("City", city),
  ];
  if (kind === "add") {
    rows.push(row("Data portal URL", dataPortalUrl));
  }
  rows.push(row("Name", name));
  rows.push(row("Email", email));
  rows.push(row("Title", title));
  rows.push(row("Has data experience", hasDataExperience ? "Yes" : "No"));
  rows.push(row("Works with city gov", isCityGovernment ? "Yes" : "No"));

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:24px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 24px 8px;">
          <div style="font-size:12px;color:#888;font-weight:600;letter-spacing:0.5px;margin-bottom:8px;">TRANSPARENT.CITY</div>
          <h1 style="margin:0 0 4px;font-size:18px;color:#1a1a1a;font-weight:700;">${escapeHtml(heading)}</h1>
          <p style="margin:0;color:#555;font-size:13px;">Submitted via /add-your-city</p>
        </td></tr>
        <tr><td style="padding:8px 24px 24px;">
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#1a1a1a;">
            ${rows.join("\n")}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const replyTo = looksLikeEmail ? email : undefined;

  let result;
  try {
    result = await sendEmail({
      to: NOTIFY_EMAIL,
      subject,
      body: html,
      replyTo,
    });
  } catch (err) {
    console.error("[city-suggestion] sendEmail threw:", err);
    return NextResponse.json(
      { error: "Could not send your submission. Please try again or email seymour@transparent.city." },
      { status: 502 },
    );
  }

  if (!result.success) {
    console.error("[city-suggestion] SendGrid error:", result.error);
    return NextResponse.json(
      { error: "Could not send your submission. Please try again or email seymour@transparent.city." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true, messageId: result.messageId });
}
