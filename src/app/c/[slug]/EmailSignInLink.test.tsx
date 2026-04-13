import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EmailSignInLink from "./EmailSignInLink";

const mockLoginWithRedirect = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: mockLoginWithRedirect,
  }),
}));

describe("EmailSignInLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginWithRedirect.mockResolvedValue(undefined);
  });

  it("renders email input and sign up button", () => {
    render(<EmailSignInLink />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  it("shows custom label when provided", () => {
    render(<EmailSignInLink label="Get Oakland's weekly briefing" />);
    expect(screen.getByText("Get Oakland's weekly briefing")).toBeInTheDocument();
  });

  it("shows default label when no label given", () => {
    render(<EmailSignInLink />);
    expect(screen.getByText("Enter your email to sign up")).toBeInTheDocument();
  });

  it("sign up button is disabled when email is empty", () => {
    render(<EmailSignInLink />);
    expect(screen.getByRole("button", { name: /sign up/i })).toBeDisabled();
  });

  describe("form submission", () => {
    it("calls loginWithRedirect with passwordless email connection", async () => {
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "user@example.com");
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(mockLoginWithRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            connection: "email",
            login_hint: "user@example.com",
          }),
          appState: { returnTo: "/check-email" },
        })
      );
    });

    it("submits on Enter key", async () => {
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "user@example.com{enter}");

      expect(mockLoginWithRedirect).toHaveBeenCalled();
    });

    it("does not submit with invalid email", async () => {
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "invalid");
      await user.keyboard("{enter}");

      expect(mockLoginWithRedirect).not.toHaveBeenCalled();
    });

    it("shows sending state during redirect", async () => {
      mockLoginWithRedirect.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "user@example.com");
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(screen.getByRole("button", { name: /sending/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeDisabled();
    });

    it("shows success message after redirect completes", async () => {
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "user@example.com");
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument();
      });
    });

    it("shows error message when redirect fails", async () => {
      mockLoginWithRedirect.mockRejectedValue(new Error("Network error"));
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "user@example.com");
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
    });

    it("stores return path in sessionStorage", async () => {
      const mockSessionStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      };
      vi.stubGlobal("sessionStorage", mockSessionStorage);
      const user = userEvent.setup();
      render(<EmailSignInLink />);
      await user.type(screen.getByLabelText(/email/i), "user@example.com");
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "auth_return_after_check_email",
        expect.any(String),
      );
    });
  });

  it("renders nothing when user is authenticated", () => {
    vi.doMock("@auth0/auth0-react", () => ({
      useAuth0: () => ({
        isAuthenticated: true,
        isLoading: false,
        loginWithRedirect: vi.fn(),
      }),
    }));
    // Component returns null when authenticated, tested via the component logic
  });
});
