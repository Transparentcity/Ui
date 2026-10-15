import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCityMandates } from "./useCityMandates";

const auth = {
  isAuthenticated: false,
  isLoading: false,
  getAccessTokenSilently: vi.fn(async () => "tok-123"),
};

vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCityMandates", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    auth.isAuthenticated = false;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a 403 to forbidden", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "forbidden" }), { status: 403 })
    );
    const { result } = renderHook(() => useCityMandates(1), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("forbidden"));
  });

  it("sends the bearer token when signed in and returns mandates", async () => {
    auth.isAuthenticated = true;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ city_id: 1, mandates: [] }), { status: 200 })
    );
    const { result } = renderHook(() => useCityMandates(1), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/public/cities/1/mandates");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-123" });
  });

  it("stays idle when disabled", () => {
    const { result } = renderHook(() => useCityMandates(1, { enabled: false }), { wrapper });
    expect(result.current.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
