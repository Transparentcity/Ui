/**
 * GovernmentOnboardingModal onboarding tests.
 * Verifies each step (confirm-profile, government-email, enter-code, success)
 * renders fast and handles verification flow without blocking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GovernmentOnboardingModal from "./GovernmentOnboardingModal";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token");

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessTokenSilently: mockGetAccessTokenSilently,
  }),
}));

const mockSendGovernmentVerificationCode = vi.fn().mockResolvedValue({});
const mockVerifyGovernmentCode = vi.fn().mockResolvedValue({});
const mockUpdateUserPreferences = vi.fn().mockResolvedValue(undefined);
const mockListLeadersForClaim = vi.fn().mockResolvedValue([]);
const mockCreateClaim = vi.fn().mockResolvedValue(undefined);
const mockFollowRepresentative = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/apiClient", () => ({
  getGovernmentVerificationStatus: vi.fn().mockResolvedValue({}),
  sendGovernmentVerificationCode: (...args: unknown[]) => mockSendGovernmentVerificationCode(...args),
  verifyGovernmentCode: (...args: unknown[]) => mockVerifyGovernmentCode(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  listLeadersForClaim: (...args: unknown[]) => mockListLeadersForClaim(...args),
  createClaim: (...args: unknown[]) => mockCreateClaim(...args),
  followRepresentative: (...args: unknown[]) => mockFollowRepresentative(...args),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("GovernmentOnboardingModal", () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onComplete: vi.fn(),
    claimContext: null as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Without claim context (email-first flow) ─────────────────────────

  describe("Email-first flow (no claim context)", () => {
    it("renders government email step instantly", () => {
      const start = performance.now();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );
      const elapsed = performance.now() - start;

      expect(screen.getByText(/verify your government email/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      expect(elapsed).toBeLessThan(100);
    });

    it("send button is disabled until email is entered", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      const sendBtn = screen.getByText(/send verification code/i).closest("button")!;
      expect(sendBtn).toBeDisabled();

      await user.type(screen.getByPlaceholderText(/you@example.com/i), "official@city.gov");
      expect(sendBtn).not.toBeDisabled();
    });

    it("transitions to enter-code step after sending code", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      await user.type(screen.getByPlaceholderText(/you@example.com/i), "official@city.gov");
      await user.click(screen.getByText(/send verification code/i));

      await waitFor(() => {
        expect(screen.getByText(/enter verification code/i)).toBeInTheDocument();
      });
      expect(mockSendGovernmentVerificationCode).toHaveBeenCalledWith("official@city.gov", "test-token");
    });

    it("shows dev code when returned by API", async () => {
      mockSendGovernmentVerificationCode.mockResolvedValue({ dev_code: "123456" });

      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      await user.type(screen.getByPlaceholderText(/you@example.com/i), "test@city.gov");
      await user.click(screen.getByText(/send verification code/i));

      await waitFor(() => {
        expect(screen.getByText(/your code: 123456/i)).toBeInTheDocument();
      });
    });

    it("transitions to success step after code verification", async () => {
      mockSendGovernmentVerificationCode.mockResolvedValue({});
      mockVerifyGovernmentCode.mockResolvedValue({});

      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      await user.type(screen.getByPlaceholderText(/you@example.com/i), "official@city.gov");
      await user.click(screen.getByText(/send verification code/i));

      await waitFor(() => {
        expect(screen.getByText(/enter verification code/i)).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText("000000");
      await user.type(codeInput, "654321");
      await user.click(screen.getByText(/^verify$/i));

      await waitFor(() => {
        expect(screen.getByText(/submitted for verification/i)).toBeInTheDocument();
      });
      expect(mockVerifyGovernmentCode).toHaveBeenCalledWith("654321", "test-token");
    });

    it("success step 'Continue to dashboard' completes onboarding", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      // Go through the full flow
      await user.type(screen.getByPlaceholderText(/you@example.com/i), "official@city.gov");
      await user.click(screen.getByText(/send verification code/i));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText("000000"), "654321");
      await user.click(screen.getByText(/^verify$/i));

      await waitFor(() => {
        expect(screen.getByText(/continue to dashboard/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/continue to dashboard/i));

      await waitFor(() => {
        expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
          { has_completed_onboarding: true },
          "test-token"
        );
        expect(baseProps.onComplete).toHaveBeenCalled();
        expect(baseProps.onClose).toHaveBeenCalled();
      });
    });
  });

  // ── With claim context (confirm-profile first) ───────────────────────

  describe("Claim flow (with claim context)", () => {
    const claimContext = { city_id: 42, district: 3 };

    it("renders confirm-profile step instantly when claim context present", async () => {
      mockListLeadersForClaim.mockResolvedValue([
        { id: 10, name: "Jane Mayor", title: "Council Member", district: 3 },
      ]);

      const start = performance.now();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={claimContext} />
      );
      const elapsed = performance.now() - start;

      expect(screen.getByText(/confirm your profile/i)).toBeInTheDocument();
      expect(elapsed).toBeLessThan(100);

      // Leader loads asynchronously
      await waitFor(() => {
        expect(screen.getByText("Jane Mayor")).toBeInTheDocument();
      });
    });

    it("shows loader while leader is loading, not a blank screen", async () => {
      // Delay the leader fetch
      mockListLeadersForClaim.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([
          { id: 10, name: "Jane Mayor", title: "Council Member", district: 3 },
        ]), 100))
      );

      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={claimContext} />
      );

      // Step title should be visible immediately
      expect(screen.getByText(/confirm your profile/i)).toBeInTheDocument();

      // Leader loads after delay
      await waitFor(() => {
        expect(screen.getByText("Jane Mayor")).toBeInTheDocument();
      });
    });

    it("'Yes, that's me' advances to email step", async () => {
      mockListLeadersForClaim.mockResolvedValue([
        { id: 10, name: "Jane Mayor", title: "Council Member", district: 3 },
      ]);

      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={claimContext} />
      );

      await waitFor(() => {
        expect(screen.getByText("Jane Mayor")).toBeInTheDocument();
      });

      await user.click(screen.getByText(/yes, that.s me/i));

      expect(screen.getByText(/verify your government email/i)).toBeInTheDocument();
    });

    it("step dots render correct count for claim flow (4 steps)", async () => {
      mockListLeadersForClaim.mockResolvedValue([]);

      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={claimContext} />
      );

      // 4 step dots for claim flow
      const dots = document.querySelectorAll("[class*='stepDot']");
      expect(dots.length).toBe(4);
    });
  });

  // ── Error handling ───────────────────────────────────────────────────

  describe("Error handling", () => {
    it("shows error when email send fails", async () => {
      mockSendGovernmentVerificationCode.mockRejectedValue(
        new Error("Network error")
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      await user.type(screen.getByPlaceholderText(/you@example.com/i), "bad@email.gov");
      await user.click(screen.getByText(/send verification code/i));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Should stay on the email step (not stuck loading)
      expect(screen.getByText(/verify your government email/i)).toBeInTheDocument();
    });

    it("shows error when code verification fails", async () => {
      mockSendGovernmentVerificationCode.mockResolvedValue({});
      mockVerifyGovernmentCode.mockRejectedValue(
        new Error("Invalid or expired code. Please try again.")
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      await user.type(screen.getByPlaceholderText(/you@example.com/i), "test@city.gov");
      await user.click(screen.getByText(/send verification code/i));

      await waitFor(() => {
        expect(screen.getByText(/enter verification code/i)).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText("000000");
      await user.type(codeInput, "000000");
      await user.click(screen.getByText(/^verify$/i));

      await waitFor(() => {
        expect(screen.getByText(/invalid or expired code/i)).toBeInTheDocument();
      });
    });
  });

  // ── Modal behavior ───────────────────────────────────────────────────

  describe("Modal behavior", () => {
    it("does not render when isOpen is false", () => {
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} isOpen={false} claimContext={null} />
      );
      expect(screen.queryByText(/verify your government email/i)).not.toBeInTheDocument();
    });

    it("skip button calls onClose without marking onboarding complete", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <GovernmentOnboardingModal {...baseProps} claimContext={null} />
      );

      await user.click(screen.getByTitle("Close"));

      expect(baseProps.onClose).toHaveBeenCalled();
      expect(mockUpdateUserPreferences).not.toHaveBeenCalled();
    });
  });
});
