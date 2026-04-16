/**
 * Onboarding banner lifecycle tests.
 *
 * Verifies three things end-to-end:
 *   1. The banner appears when onboarding starts
 *   2. The mayor's name is displayed in the banner
 *   3. The banner is dismissed after completion
 *
 * Tests the full stack: PlaceOnboardingContext state machine drives the
 * OnboardingBanner component rendering. No mocks on the context, so we
 * exercise the real provider + real banner together.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PlaceOnboardingProvider,
  usePlaceOnboarding,
} from "@/contexts/PlaceOnboardingContext";
import OnboardingBanner from "./OnboardingBanner";

// ── Mocks (only external deps, not the context) ─────────────────────

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    getAccessTokenSilently: vi.fn().mockResolvedValue("test-token"),
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  getJob: vi.fn().mockResolvedValue({ status: "running" }),
}));

vi.mock("@/components/BrandedLoader", () => ({
  default: ({ ariaHidden }: { size: string; color: string; ariaHidden?: boolean }) => (
    <div data-testid="branded-loader" aria-hidden={ariaHidden}>Loading...</div>
  ),
}));

// ── Test harness: wires real provider + real banner + exposes controls ──

function TestHarness({ onReady }: {
  onReady: (ctx: ReturnType<typeof usePlaceOnboarding>) => void;
}) {
  const ctx = usePlaceOnboarding();
  onReady(ctx);
  return <OnboardingBanner />;
}

function renderBannerWithProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let ctx: ReturnType<typeof usePlaceOnboarding> | null = null;

  const result = render(
    <QueryClientProvider client={qc}>
      <PlaceOnboardingProvider>
        <TestHarness onReady={(c) => { ctx = c; }} />
      </PlaceOnboardingProvider>
    </QueryClientProvider>
  );

  return { ...result, getCtx: () => ctx! };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Onboarding banner lifecycle: show, find mayor, dismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("banner is hidden before onboarding starts", () => {
    const { container } = renderBannerWithProvider();
    // idle status: banner renders nothing
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  it("banner appears when city loading starts", () => {
    const { getCtx } = renderBannerWithProvider();

    act(() => {
      getCtx().startCityLoading("Sacramento");
    });

    // Banner is now visible with scanning message
    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/looking for stories in sacramento/i)).toBeInTheDocument();
    expect(screen.getByTestId("branded-loader")).toBeInTheDocument();
  });

  it("banner shows mayor name when notifyRepFound is called with title", () => {
    const { getCtx } = renderBannerWithProvider();

    act(() => {
      getCtx().startCityLoading("Sacramento");
    });

    act(() => {
      getCtx().notifyRepFound("Darrell Steinberg", "Mayor");
    });

    // Banner shows the mayor's name with their title
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Found Mayor: Darrell Steinberg")).toBeInTheDocument();
  });

  it("banner is dismissed after city loading completes", async () => {
    const { getCtx } = renderBannerWithProvider();

    act(() => { getCtx().startCityLoading("Sacramento"); });

    // Banner is visible
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => { getCtx().completeCityLoading(true); });

    // Shows completion message
    expect(screen.getByText(/your sacramento feed is ready/i)).toBeInTheDocument();

    // Wait for auto-dismiss (2s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Banner is dismissed (animating out via CSS collapse)
    const banner = screen.getByRole("status");
    expect(banner.className).toContain("bannerDismissing");
  });

  it("full flow: banner shows, displays mayor, then dismisses", async () => {
    const { getCtx, container } = renderBannerWithProvider();

    // 1) Banner is hidden initially
    expect(container.querySelector("[role=status]")).toBeNull();

    // 2) Onboarding starts: banner appears with scanning message
    act(() => { getCtx().startCityLoading("Sacramento"); });
    act(() => { getCtx().startBackgroundWork(); });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/looking for stories in sacramento/i)).toBeInTheDocument();

    // 3) Feed resolves (deferred because background work is active)
    act(() => { getCtx().completeCityLoading(true); });
    // Still scanning (deferred)
    expect(screen.getByText(/looking for stories in sacramento/i)).toBeInTheDocument();

    // 4) Mayor found: banner shows the mayor's name
    act(() => { getCtx().notifyRepFound("Darrell Steinberg", "Mayor"); });
    expect(screen.getByText("Found Mayor: Darrell Steinberg")).toBeInTheDocument();

    // 5) Mayor notification clears after 4s
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(screen.getByText(/looking for stories in sacramento/i)).toBeInTheDocument();

    // 6) Background work finishes: deferred completion applies
    act(() => { getCtx().completeBackgroundWork(); });
    expect(screen.getByText(/your sacramento feed is ready/i)).toBeInTheDocument();

    // 7) Banner auto-dismisses after 2s (CSS collapse animation)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const banner = screen.getByRole("status");
    expect(banner.className).toContain("bannerDismissing");
  });
});
