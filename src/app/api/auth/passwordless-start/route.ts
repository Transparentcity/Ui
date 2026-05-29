import { NextResponse } from "next/server";

/**
 * Same-origin proxy for Auth0 /passwordless/start.
 * Avoids browser CORS failures when the marketing site calls Auth0 directly.
 * Note: Auth0's passwordless session cookie is only set on credentialed
 * browser→Auth0 requests; magic links still require opening the email in the
 * same browser used to sign up (see docs/PASSWORDLESS_EMAIL_SETUP.md).
 */
export async function POST(request: Request) {
  const domain = (process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "").trim();
  if (!domain) {
    return NextResponse.json(
      { error: "missing_config", error_description: "Auth0 domain is not configured." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", error_description: "Request body must be JSON." },
      { status: 400 }
    );
  }

  try {
    const auth0Response = await fetch(`https://${domain}/passwordless/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await auth0Response.text();
    return new NextResponse(raw, {
      status: auth0Response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "auth0_unreachable",
        error_description: `Could not reach Auth0: ${detail}`,
      },
      { status: 502 }
    );
  }
}
