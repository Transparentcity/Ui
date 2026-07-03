import { NextResponse } from "next/server";

/**
 * Server-side proxy for Auth0 /passwordless/start.
 *
 * Auth0's passwordless/start endpoint blocks cross-origin requests from
 * browser SPAs, so we forward through this same-origin route. No client
 * secret is needed — passwordless/start is a public endpoint for SPA
 * clients (public clients don't use client_secret).
 */
export async function POST(request: Request) {
  const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  if (!auth0Domain) {
    return NextResponse.json(
      { error: "server_misconfigured", error_description: "Auth0 domain is not set." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Request body must be JSON." },
      { status: 400 }
    );
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
