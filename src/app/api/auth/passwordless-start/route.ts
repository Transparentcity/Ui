import { NextResponse } from "next/server";
import { getPasswordlessServerCredentials } from "@/lib/auth0PasswordlessServer";

/**
 * Server-side proxy for Auth0 /passwordless/start.
 *
 * Auth0's passwordless/start endpoint blocks cross-origin requests from
 * browser SPAs, so we forward through this same-origin route.
 *
 * Magic-link requests (send=link) use the SPA client_id from the browser.
 * OTP code requests (send=code) use a Regular Web Application on the server
 * so the same client can complete the passwordless-OTP grant at /oauth/token.
 */
export async function POST(request: Request) {
  const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  if (!auth0Domain) {
    return NextResponse.json(
      { error: "server_misconfigured", error_description: "Auth0 domain is not set." },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Request body must be JSON." },
      { status: 400 }
    );
  }

  if (body.send === "code") {
    const credentials = getPasswordlessServerCredentials();
    if ("error" in credentials) {
      return NextResponse.json(
        { error: "server_misconfigured", error_description: credentials.error },
        { status: 500 }
      );
    }
    body = {
      ...body,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    };
  }

  const url = `https://${auth0Domain}/passwordless/start`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let auth0Response: Response;
  try {
    auth0Response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: isTimeout ? "timeout" : "network_error",
        error_description: isTimeout
          ? "Auth0 did not respond in time. Please try again."
          : err instanceof Error
          ? err.message
          : "Could not reach Auth0.",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await auth0Response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    /* non-JSON body forwarded as-is */
  }

  return NextResponse.json(parsed ?? rawBody, { status: auth0Response.status });
}
