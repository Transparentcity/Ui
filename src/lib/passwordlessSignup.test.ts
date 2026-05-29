import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  persistPasswordlessSignupContext,
  PasswordlessSendError,
  sendPasswordlessEmailLink,
  startPasswordlessEmailSignup,
} from "./passwordlessSignup";

const mockLoginWithRedirect = vi.fn();

describe("passwordlessSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("rejects invalid email", async () => {
    await expect(
      startPasswordlessEmailSignup(mockLoginWithRedirect, {
        email: "not-an-email",
        sourceSurface: "test",
      })
    ).rejects.toThrow(/valid email/i);
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
  });

  it("calls loginWithRedirect with email connection and narrowed scope", async () => {
    await startPasswordlessEmailSignup(mockLoginWithRedirect, {
      email: "user@example.com",
      sourceSurface: "city_get_landing",
      citySlug: "cincinnati",
      cityName: "Cincinnati",
      cityId: 42,
      returnAfterCheckEmail: "/home?signup=resident",
    });

    expect(mockLoginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: {
        connection: "email",
        login_hint: "user@example.com",
        scope: "openid profile email",
      },
      appState: { returnTo: "/check-email" },
    });
    expect(localStorage.getItem("transparentcity.signup_intent")).toBe("resident");
    expect(localStorage.getItem("transparentcity.follow_city_slug")).toBe("cincinnati");
    expect(sessionStorage.getItem("auth_return_after_check_email")).toBe(
      "/home?signup=resident"
    );
  });

  it("persistPasswordlessSignupContext stores city follow keys", () => {
    persistPasswordlessSignupContext({
      email: "a@b.co",
      sourceSurface: "nav",
      citySlug: "sf",
      cityName: "San Francisco",
    });
    expect(localStorage.getItem("transparentcity.follow_city_name")).toBe(
      "San Francisco"
    );
  });
});

describe("sendPasswordlessEmailLink", () => {
  const ORIGINAL_DOMAIN = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const ORIGINAL_CLIENT = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    process.env.NEXT_PUBLIC_AUTH0_DOMAIN = "auth.test.example";
    process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTH0_DOMAIN = ORIGINAL_DOMAIN;
    process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID = ORIGINAL_CLIENT;
    global.fetch = ORIGINAL_FETCH;
  });

  it("rejects invalid email without contacting Auth0", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(
      sendPasswordlessEmailLink({
        email: "no-at-sign",
        sourceSurface: "city_get_landing",
      })
    ).rejects.toBeInstanceOf(PasswordlessSendError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to /passwordless/start and stores a matching auth0-spa-js transaction", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendPasswordlessEmailLink({
      email: "user@example.com",
      sourceSurface: "city_get_landing",
      citySlug: "cincinnati",
      cityName: "Cincinnati",
      cityId: 42,
      returnAfterCheckEmail: "/home?signup=resident",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://auth.test.example/passwordless/start");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.client_id).toBe("test-client-id");
    expect(body.connection).toBe("email");
    expect(body.email).toBe("user@example.com");
    expect(body.send).toBe("link");
    expect(body.authParams.response_type).toBe("code");
    expect(body.authParams.code_challenge_method).toBe("S256");
    expect(body.authParams.scope).toBe("openid profile email");
    expect(typeof body.authParams.state).toBe("string");
    expect(typeof body.authParams.nonce).toBe("string");
    expect(typeof body.authParams.code_challenge).toBe("string");
    expect(body.authParams.redirect_uri).toBe(window.location.origin);

    const stored = sessionStorage.getItem("a0.spajs.txs.test-client-id");
    expect(stored).not.toBeNull();
    const transaction = JSON.parse(stored as string);
    expect(transaction.response_type).toBe("code");
    expect(transaction.state).toBe(body.authParams.state);
    expect(transaction.nonce).toBe(body.authParams.nonce);
    expect(typeof transaction.code_verifier).toBe("string");
    expect(transaction.code_verifier.length).toBeGreaterThanOrEqual(43);
    expect(transaction.scope).toBe("openid profile email");
    expect(transaction.audience).toBe(body.authParams.audience);
    expect(transaction.redirect_uri).toBe(window.location.origin);
    expect(transaction.appState).toEqual({ returnTo: "/home?signup=resident" });
  });

  it("surfaces Auth0 error descriptions", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "bad_email", error_description: "Email invalid" }),
        { status: 400 }
      )
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      sendPasswordlessEmailLink({
        email: "user@example.com",
        sourceSurface: "city_get_landing",
      })
    ).rejects.toMatchObject({
      name: "PasswordlessSendError",
      code: "auth0_error",
      message: "Email invalid",
    });
  });
});
