/**
 * Tests for the /add-your-city page.
 *
 * Covers behavior added in fc47f96 (the catch block used to swallow the
 * server response and always show "Something went wrong"):
 * - Server error message is surfaced to the user when the API responds non-OK
 * - Generic fallback (with status code) is shown when the server returns no body
 * - Network-failure message is shown only when fetch itself rejects
 * - Whitespace is trimmed before submission and whitespace-only city blocks submit
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

// ---- Mocks ----------------------------------------------------------------

// Header pulls in Auth0 and a lot of context. Stub it out — these tests are
// about the form, not the chrome.
vi.mock("@/components/Header", () => ({
  default: () => null,
}));
vi.mock("@/components/PublicFooter", () => ({
  default: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

import AddYourCityPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AddYourCityPage form error handling", () => {
  it("surfaces the server-supplied error message instead of a generic one", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(400, { error: "city is required" }),
    );
    const user = userEvent.setup();

    render(<AddYourCityPage />);

    await user.type(screen.getByLabelText(/city and state/i), "Oakland, CA");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByText("city is required")).toBeInTheDocument();
    });

    // The pre-fix generic copy must not appear.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("falls back to a status-bearing message when the server returns no error body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("", { status: 500 }),
    );
    const user = userEvent.setup();

    render(<AddYourCityPage />);

    await user.type(screen.getByLabelText(/city and state/i), "Oakland, CA");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByText(/submission failed \(500\)/i)).toBeInTheDocument();
    });
  });

  it("shows a network-level message when fetch itself rejects", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();

    render(<AddYourCityPage />);

    await user.type(screen.getByLabelText(/city and state/i), "Oakland, CA");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("blocks submission when the city field is only whitespace", async () => {
    const user = userEvent.setup();

    render(<AddYourCityPage />);

    // Use fireEvent-style typing of spaces — the input has type=text so it accepts them.
    await user.type(screen.getByLabelText(/city and state/i), "   ");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByText(/please enter a city name/i)).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("trims whitespace from form fields before submitting", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { sent: true, messageId: "m-1" }),
    );
    const user = userEvent.setup();

    render(<AddYourCityPage />);

    await user.type(screen.getByLabelText(/city and state/i), "  Oakland, CA  ");
    await user.type(screen.getByLabelText(/email/i), "  user@example.com  ");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.city).toBe("Oakland, CA");
    expect(body.email).toBe("user@example.com");
  });
});
