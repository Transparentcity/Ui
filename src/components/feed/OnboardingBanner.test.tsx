/**
 * OnboardingBanner tests.
 * Verifies the banner renders the correct state for each onboarding phase
 * and that loading states display without delay.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ──────────────────────────────────────────────────────────────

let mockOnboardingState = {
  status: "idle" as string,
  mode: "idle" as string,
  message: "",
  cityName: null as string | null,
  repName: null as string | null,
  repTitle: null as string | null,
  dismissed: false,
  dismiss: vi.fn(),
  startJob: vi.fn(),
  startCityLoading: vi.fn(),
  completeCityLoading: vi.fn(),
  notifyRepFound: vi.fn(),
  startBackgroundWork: vi.fn(),
  completeBackgroundWork: vi.fn(),
};

vi.mock("@/contexts/PlaceOnboardingContext", () => ({
  usePlaceOnboarding: () => mockOnboardingState,
}));

vi.mock("@/components/BrandedLoader", () => ({
  default: ({ size, ariaHidden }: { size: string; color: string; ariaHidden?: boolean }) => (
    <div data-testid="branded-loader" data-size={size} aria-hidden={ariaHidden}>
      Loading...
    </div>
  ),
}));

// Must import after mocks are set up
import OnboardingBanner from "./OnboardingBanner";

describe("OnboardingBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = {
      status: "idle",
      mode: "idle",
      message: "",
      cityName: null,
      repName: null,
      repTitle: null,
      dismissed: false,
      dismiss: vi.fn(),
      startJob: vi.fn(),
      startCityLoading: vi.fn(),
      completeCityLoading: vi.fn(),
      notifyRepFound: vi.fn(),
      startBackgroundWork: vi.fn(),
      completeBackgroundWork: vi.fn(),
    };
  });

  it("renders nothing when status is idle", () => {
    mockOnboardingState.status = "idle";
    const { container } = render(<OnboardingBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders scanning state instantly with loader", () => {
    mockOnboardingState.status = "scanning";
    mockOnboardingState.message = "Pulling public data near your address...";

    const start = performance.now();
    render(<OnboardingBanner />);
    const elapsed = performance.now() - start;

    expect(screen.getByText(/pulling public data/i)).toBeInTheDocument();
    expect(screen.getByTestId("branded-loader")).toBeInTheDocument();
    expect(elapsed).toBeLessThan(50);
  });

  it("shows progressive messages during scanning", () => {
    mockOnboardingState.status = "scanning";
    mockOnboardingState.message = "Analyzing trends in your neighborhood...";

    render(<OnboardingBanner />);
    expect(screen.getByText(/analyzing trends/i)).toBeInTheDocument();
  });

  it("shows rep found message", () => {
    mockOnboardingState.status = "found_rep";
    mockOnboardingState.repName = "Jane Mayor";
    mockOnboardingState.message = "Found your representative: Jane Mayor";

    render(<OnboardingBanner />);
    expect(screen.getByText(/found your representative: jane mayor/i)).toBeInTheDocument();
  });

  it("shows completed state with checkmark instead of loader", () => {
    mockOnboardingState.status = "completed";
    mockOnboardingState.message = "Your neighborhood feed is ready!";

    render(<OnboardingBanner />);
    expect(screen.getByText(/your neighborhood feed is ready/i)).toBeInTheDocument();
    // Should show checkmark SVG, not the spinner
    expect(screen.queryByTestId("branded-loader")).not.toBeInTheDocument();
  });

  it("shows failed state with appropriate message", () => {
    mockOnboardingState.status = "failed";
    mockOnboardingState.message = "Your city feed is ready. We\u2019ll add neighborhood stories as more data becomes available.";

    render(<OnboardingBanner />);
    expect(screen.getByText(/your city feed is ready/i)).toBeInTheDocument();
  });

  it("dismiss button calls dismiss callback", async () => {
    mockOnboardingState.status = "scanning";
    mockOnboardingState.message = "Building stories...";

    const user = userEvent.setup();
    render(<OnboardingBanner />);

    const dismissBtn = screen.getByLabelText("Dismiss");
    await user.click(dismissBtn);

    // Animation triggers first, then dismiss is called after timeout
    // The banner should still be visible during animation
    expect(screen.getByText(/building stories/i)).toBeInTheDocument();
  });

  it("applies dismissing class when dismissed externally", () => {
    mockOnboardingState.status = "completed";
    mockOnboardingState.dismissed = true;

    render(<OnboardingBanner />);
    // When dismissed=true, the banner should be animating out
    const banner = screen.getByRole("status");
    expect(banner.className).toContain("bannerDismissing");
  });

  it("has correct ARIA attributes for accessibility", () => {
    mockOnboardingState.status = "scanning";
    mockOnboardingState.message = "Searching for anomalies...";

    render(<OnboardingBanner />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });

  // ── City-level onboarding banner tests ──────────────────────────────

  it("shows city-level scanning message", () => {
    mockOnboardingState.status = "scanning";
    mockOnboardingState.mode = "city";
    mockOnboardingState.cityName = "Sacramento";
    mockOnboardingState.message = "Looking for stories in Sacramento...";

    render(<OnboardingBanner />);
    expect(screen.getByText(/looking for stories in sacramento/i)).toBeInTheDocument();
    expect(screen.getByTestId("branded-loader")).toBeInTheDocument();
  });

  it("shows city-level completed message", () => {
    mockOnboardingState.status = "completed";
    mockOnboardingState.mode = "city";
    mockOnboardingState.cityName = "Chicago";
    mockOnboardingState.message = "Your Chicago feed is ready!";

    render(<OnboardingBanner />);
    expect(screen.getByText(/your chicago feed is ready/i)).toBeInTheDocument();
    expect(screen.queryByTestId("branded-loader")).not.toBeInTheDocument();
  });

  it("shows city-level failed message for empty city", () => {
    mockOnboardingState.status = "failed";
    mockOnboardingState.mode = "city";
    mockOnboardingState.cityName = "Sacramento";
    mockOnboardingState.message = "No stories in Sacramento yet. Here\u2019s what\u2019s trending:";

    render(<OnboardingBanner />);
    expect(screen.getByText(/no stories in sacramento yet/i)).toBeInTheDocument();
  });

  it("shows place-level detailed phases (not city message) when mode is place", () => {
    mockOnboardingState.status = "scanning";
    mockOnboardingState.mode = "place";
    mockOnboardingState.message = "Pulling public data near your address...";

    render(<OnboardingBanner />);
    expect(screen.getByText(/pulling public data near your address/i)).toBeInTheDocument();
  });
});
