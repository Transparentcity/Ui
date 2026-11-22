import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = {
  isAuthenticated: true,
  isLoading: false,
  loginWithRedirect: vi.fn(),
  getAccessTokenSilently: vi.fn(async () => "tok"),
};
vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));

const requestMock = vi.fn();
vi.mock("@/lib/api/request", () => ({
  request: (...args: unknown[]) => requestMock(...args),
}));

import ReportBackForm from "./ReportBackForm";

afterEach(() => {
  requestMock.mockReset();
  auth.isAuthenticated = true;
});

function renderForm(pathKeys = ["report"]) {
  return render(<ReportBackForm city="oakland" activity="potholes" areaSlug="clinton" pathKeys={pathKeys} />);
}

describe("ReportBackForm", () => {
  it("asks a signed-out reader to sign in and makes no request", () => {
    auth.isAuthenticated = false;
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to log what you did" }));
    expect(auth.loginWithRedirect).toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("lists the reader's own reports and posts a new one with their token", async () => {
    requestMock.mockImplementation(async (path: string, method: string, body?: Record<string, unknown>) => {
      if (method === "GET") {
        return { reports: [{ id: 1, action_date: "2026-11-01", action: "filed_new_request", request_id: "111", note: null }] };
      }
      return { id: 2, created_at: null, ...body };
    });
    renderForm();
    await screen.findByText(/Nov 1, 2026: Filed a new request, request 111/);
    expect(requestMock).toHaveBeenCalledWith("/api/activities/oakland/potholes/reports", "GET", undefined, "tok");

    fireEvent.change(screen.getByLabelText("Request number"), { target: { value: "1312894" } });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await screen.findByText("Saved.");
    const [, method, body, token] = requestMock.mock.calls.at(-1)!;
    expect(method).toBe("POST");
    expect(token).toBe("tok");
    expect(body).toMatchObject({ path_key: "report", area_slug: "clinton", request_id: "1312894", action: "added_to_request" });
    await waitFor(() => expect(screen.getByText(/request 1312894/)).toBeTruthy());
  });

  it("hides the repair action unless the repair day path is offered", () => {
    requestMock.mockResolvedValue({ reports: [] });
    renderForm(["report"]);
    expect(screen.queryByRole("option", { name: "Repaired the hole" })).toBeNull();
  });

  it("shows the platform's reason for a rejected report, not the raw body", async () => {
    requestMock.mockImplementation(async (_p: string, method: string) => {
      if (method === "GET") return { reports: [] };
      throw Object.assign(new Error('422 {"detail":"the date cannot be in the future"}'), { status: 422 });
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The date cannot be in the future");
  });

  it("shows a plain line when the server fails", async () => {
    requestMock.mockImplementation(async (_p: string, method: string) => {
      if (method === "GET") return { reports: [] };
      throw Object.assign(new Error("500 <html>Internal Server Error</html>"), { status: 500 });
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not save. Try again.");
  });

  it("logs a repair on the repair day path", async () => {
    requestMock.mockImplementation(async (_p: string, method: string, body?: Record<string, unknown>) =>
      method === "GET" ? { reports: [] } : { id: 3, created_at: null, ...body }
    );
    renderForm(["report", "repair_day"]);
    fireEvent.change(screen.getByLabelText("What you did"), { target: { value: "repaired" } });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await screen.findByText("Saved.");
    expect(requestMock.mock.calls.at(-1)![2]).toMatchObject({ action: "repaired", path_key: "repair_day" });
  });
});
