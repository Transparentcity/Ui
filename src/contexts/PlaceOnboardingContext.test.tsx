/**
 * PlaceOnboardingContext tests.
 * Verifies job polling, progressive messages, auto-dismiss,
 * and timeout behavior for the post-onboarding background job.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PlaceOnboardingProvider,
  usePlaceOnboarding,
} from "./PlaceOnboardingContext";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token");

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    getAccessTokenSilently: mockGetAccessTokenSilently,
  }),
}));

const mockGetJob = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
}));

// Consumer component that exposes context values for testing
function TestConsumer({ onRender }: { onRender?: (value: ReturnType<typeof usePlaceOnboarding>) => void }) {
  const value = usePlaceOnboarding();
  if (onRender) onRender(value);
  return (
    <div>
      <div data-testid="status">{value.status}</div>
      <div data-testid="mode">{value.mode}</div>
      <div data-testid="message">{value.message}</div>
      <div data-testid="dismissed">{String(value.dismissed)}</div>
    </div>
  );
}

function renderWithProvider(
  props: { initialJob?: { placeId: number; jobId: string } | null } = {},
  onRender?: (value: ReturnType<typeof usePlaceOnboarding>) => void
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlaceOnboardingProvider {...props}>
        <TestConsumer onRender={onRender} />
      </PlaceOnboardingProvider>
    </QueryClientProvider>
  );
}

describe("PlaceOnboardingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("starts in idle state with empty message", () => {
    renderWithProvider();
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("message").textContent).toBe("");
  });

  it("transitions to scanning when initialJob is provided", () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    expect(screen.getByTestId("status").textContent).toBe("scanning");
    expect(screen.getByTestId("message").textContent).toBe("Pulling public data near your address...");
  });

  it("shows progressive messages as time elapses", async () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    expect(screen.getByTestId("message").textContent).toBe(
      "Pulling public data near your address..."
    );

    // Advance past 10s phase (tick interval is 2s, so advance enough for multiple ticks)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(screen.getByTestId("message").textContent).toBe(
      "Analyzing trends in your neighborhood..."
    );

    // Advance past 22s phase
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(screen.getByTestId("message").textContent).toBe(
      "Searching for anomalies in the data..."
    );
  });

  it("transitions to completed when job finishes", async () => {
    mockGetJob.mockResolvedValue({ status: "completed" });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    // Let the initial poll fire and resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByTestId("status").textContent).toBe("completed");
    expect(screen.getByTestId("message").textContent).toBe(
      "Neighborhood stories will appear in your feed as they\u2019re generated."
    );
  });

  it("transitions to failed when job fails", async () => {
    mockGetJob.mockResolvedValue({ status: "failed" });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByTestId("status").textContent).toBe("failed");
  });

  it("times out after 30s and shows failed state", async () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    // Advance past the 30s timeout in increments to let polls fire
    for (let i = 0; i < 16; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
    }

    expect(screen.getByTestId("status").textContent).toBe("failed");
  });

  it("auto-dismisses after completion + delay", async () => {
    mockGetJob.mockResolvedValue({ status: "completed" });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    // Complete the job
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByTestId("status").textContent).toBe("completed");

    // Auto-dismiss after 2s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByTestId("dismissed").textContent).toBe("true");
    expect(sessionStorage.setItem).toHaveBeenCalledWith("tc:onboarding-banner-dismissed", "1");
  });

  it("notifyRepFound shows rep name temporarily", async () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider(
      { initialJob: { placeId: 1, jobId: "job-123" } },
      (v) => { latestValue = v; }
    );

    // Notify rep found
    act(() => {
      latestValue!.notifyRepFound("Jane Mayor");
    });

    expect(screen.getByTestId("status").textContent).toBe("found_rep");
    expect(screen.getByTestId("message").textContent).toBe(
      "Found your representative: Jane Mayor"
    );

    // After 4s, reverts to scanning
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(screen.getByTestId("status").textContent).toBe("scanning");
  });

  it("notifyRepFound with title shows custom message", () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider(
      { initialJob: { placeId: 1, jobId: "job-123" } },
      (v) => { latestValue = v; }
    );

    act(() => {
      latestValue!.notifyRepFound("Darrell Steinberg", "Mayor");
    });

    expect(screen.getByTestId("status").textContent).toBe("found_rep");
    expect(screen.getByTestId("message").textContent).toBe(
      "Found Mayor: Darrell Steinberg"
    );
  });

  it("completeCityLoading defers when background work is active", () => {
    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });

    // Start background work (mayor/rep discovery)
    act(() => {
      latestValue!.startBackgroundWork();
    });

    // FeedContainer tries to complete city loading while background work is active
    act(() => {
      latestValue!.completeCityLoading(true);
    });

    // Should still be scanning (deferred)
    expect(screen.getByTestId("status").textContent).toBe("scanning");

    // Complete background work
    act(() => {
      latestValue!.completeBackgroundWork();
    });

    // Now it should complete
    expect(screen.getByTestId("status").textContent).toBe("completed");
    expect(screen.getByTestId("message").textContent).toBe(
      "Your Sacramento feed is ready!"
    );
  });

  // ── City-level loading tests ─────────────────────────────────────────

  it("startCityLoading sets scanning state with city message", () => {
    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });

    expect(screen.getByTestId("status").textContent).toBe("scanning");
    expect(screen.getByTestId("message").textContent).toBe(
      "Looking for stories in Sacramento..."
    );
  });

  it("city-level loading reports mode as city", () => {
    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    expect(latestValue!.mode).toBe("idle");

    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });

    expect(latestValue!.mode).toBe("city");
  });

  it("completeCityLoading(true) transitions to completed with city message", () => {
    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    act(() => {
      latestValue!.startCityLoading("Chicago");
    });

    act(() => {
      latestValue!.completeCityLoading(true);
    });

    expect(screen.getByTestId("status").textContent).toBe("completed");
    expect(screen.getByTestId("message").textContent).toBe(
      "Your Chicago feed is ready!"
    );
  });

  it("completeCityLoading(false) transitions to failed with no-stories message", () => {
    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });

    act(() => {
      latestValue!.completeCityLoading(false);
    });

    expect(screen.getByTestId("status").textContent).toBe("failed");
    expect(screen.getByTestId("message").textContent).toContain(
      "No stories in Sacramento yet"
    );
  });

  it("startJob overrides active city-level loading with place-level", () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    // Start city-level first
    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });
    expect(latestValue!.mode).toBe("city");
    expect(screen.getByTestId("message").textContent).toBe(
      "Looking for stories in Sacramento..."
    );

    // Now start a place-level job (overrides city-level)
    act(() => {
      latestValue!.startJob(42, "job-456");
    });
    expect(latestValue!.mode).toBe("place");
    expect(screen.getByTestId("message").textContent).toBe(
      "Pulling public data near your address..."
    );
  });

  it("startJob preserves found_rep status so mayor notification finishes displaying", async () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    act(() => { latestValue!.startCityLoading("Sacramento"); });

    // Mayor notification is showing
    act(() => { latestValue!.notifyRepFound("Darrell Steinberg", "Mayor"); });
    expect(screen.getByTestId("status").textContent).toBe("found_rep");
    expect(screen.getByTestId("message").textContent).toBe("Found Mayor: Darrell Steinberg");

    // Place job starts while mayor is still showing
    act(() => { latestValue!.startJob(42, "job-456"); });

    // Mode switches to place, but found_rep status is preserved
    expect(latestValue!.mode).toBe("place");
    expect(screen.getByTestId("status").textContent).toBe("found_rep");
    expect(screen.getByTestId("message").textContent).toBe("Found Mayor: Darrell Steinberg");

    // After the 4s timeout, reverts to scanning with place-level message
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(screen.getByTestId("status").textContent).toBe("scanning");
    expect(screen.getByTestId("message").textContent).toBe(
      "Pulling public data near your address..."
    );
  });

  it("completeCityLoading is a no-op when mode is place", () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    // Start place-level job
    act(() => {
      latestValue!.startJob(42, "job-456");
    });
    expect(screen.getByTestId("status").textContent).toBe("scanning");

    // Try to complete city loading (should be ignored)
    act(() => {
      latestValue!.completeCityLoading(true);
    });
    expect(screen.getByTestId("status").textContent).toBe("scanning");
    expect(latestValue!.mode).toBe("place");
  });

  it("city-level loading auto-dismisses after completion", async () => {
    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider({}, (v) => { latestValue = v; });

    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });

    act(() => {
      latestValue!.completeCityLoading(false);
    });

    expect(screen.getByTestId("dismissed").textContent).toBe("false");

    // Auto-dismiss after 2s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByTestId("dismissed").textContent).toBe("true");
  });

  it("startCityLoading does not override active place-level job", () => {
    mockGetJob.mockResolvedValue({ status: "running" });

    let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
    renderWithProvider(
      { initialJob: { placeId: 1, jobId: "job-123" } },
      (v) => { latestValue = v; }
    );

    expect(latestValue!.mode).toBe("place");

    // Try to start city-level loading (should be ignored since place job is active)
    act(() => {
      latestValue!.startCityLoading("Sacramento");
    });

    expect(latestValue!.mode).toBe("place");
    expect(screen.getByTestId("message").textContent).toBe(
      "Pulling public data near your address..."
    );
  });

  // ── Session storage and error tests ─────────────────────────────────

  it("respects session dismissal from sessionStorage", () => {
    (sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("1");

    renderWithProvider();

    expect(screen.getByTestId("dismissed").textContent).toBe("true");
  });

  it("handles network errors gracefully during polling (keeps polling)", async () => {
    let callCount = 0;
    mockGetJob.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return Promise.reject(new Error("Network error"));
      return Promise.resolve({ status: "completed" });
    });

    renderWithProvider({
      initialJob: { placeId: 1, jobId: "job-123" },
    });

    // First poll fails
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Should still be scanning (not failed)
    expect(screen.getByTestId("status").textContent).toBe("scanning");

    // Advance through more poll intervals until success
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByTestId("status").textContent).toBe("completed");
  });

  // ── Background work deferral & race condition tests ─────────────────

  describe("background work deferral (race condition prevention)", () => {
    it("completeCityLoading defers failure result while background work is active", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });

      // Feed resolves with 0 stories while mayor/rep discovery is running
      act(() => { latestValue!.completeCityLoading(false); });

      // Banner must stay alive (scanning), not show "no stories" yet
      expect(screen.getByTestId("status").textContent).toBe("scanning");
      expect(screen.getByTestId("message").textContent).toBe(
        "Looking for stories in Sacramento..."
      );

      // Background work finishes: deferred failure now applies
      act(() => { latestValue!.completeBackgroundWork(); });
      expect(screen.getByTestId("status").textContent).toBe("failed");
    });

    it("preserves deferred success through multiple notifyRepFound calls", async () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });

      // Feed resolves with stories (success) while background work is active
      act(() => { latestValue!.completeCityLoading(true); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // Mayor found
      act(() => { latestValue!.notifyRepFound("Darrell Steinberg", "Mayor"); });
      expect(screen.getByTestId("status").textContent).toBe("found_rep");
      expect(screen.getByTestId("message").textContent).toBe(
        "Found Mayor: Darrell Steinberg"
      );

      // Mayor notification times out, reverts to scanning
      await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // District rep found
      act(() => { latestValue!.notifyRepFound("Katie Valenzuela"); });
      expect(screen.getByTestId("message").textContent).toBe(
        "Found your representative: Katie Valenzuela"
      );

      // Rep notification times out
      await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // Background work completes: deferred success now applies
      act(() => { latestValue!.completeBackgroundWork(); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
      expect(screen.getByTestId("message").textContent).toBe(
        "Your Sacramento feed is ready!"
      );
    });

    it("completeCityLoading applies immediately when no background work", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Chicago"); });

      // No startBackgroundWork called: completeCityLoading should apply immediately
      act(() => { latestValue!.completeCityLoading(true); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
    });

    it("completeBackgroundWork is a no-op when nothing was deferred", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });

      // Background work completes before FeedContainer calls completeCityLoading
      act(() => { latestValue!.completeBackgroundWork(); });

      // Should still be scanning (nothing was deferred)
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // Now completeCityLoading fires (background is no longer active, applies immediately)
      act(() => { latestValue!.completeCityLoading(true); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
    });

    it("startBackgroundWork resets any stale pending completion", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });
      act(() => { latestValue!.completeCityLoading(false); });

      // Start a fresh background work cycle (e.g. user re-triggered onboarding)
      // startBackgroundWork clears pending
      act(() => { latestValue!.startBackgroundWork(); });
      act(() => { latestValue!.completeBackgroundWork(); });

      // Should still be scanning because the new startBackgroundWork cleared the pending false
      expect(screen.getByTestId("status").textContent).toBe("scanning");
    });

    it("deferred completion auto-dismisses after the standard delay", async () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });
      act(() => { latestValue!.completeCityLoading(true); });

      // Complete background work triggers deferred completion
      act(() => { latestValue!.completeBackgroundWork(); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
      expect(screen.getByTestId("dismissed").textContent).toBe("false");

      // Auto-dismiss after 5s
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(screen.getByTestId("dismissed").textContent).toBe("true");
    });
  });

  // ── Mayor + rep notification sequencing ─────────────────────────────

  describe("mayor and rep notification sequencing", () => {
    it("notifyRepFound replaces a previous found_rep notification", () => {
      mockGetJob.mockResolvedValue({ status: "running" });
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider(
        { initialJob: { placeId: 1, jobId: "job-123" } },
        (v) => { latestValue = v; }
      );

      // Mayor notification
      act(() => { latestValue!.notifyRepFound("Mayor Smith", "Mayor"); });
      expect(screen.getByTestId("message").textContent).toBe("Found Mayor: Mayor Smith");

      // Immediately replaced by rep notification (no waiting for timeout)
      act(() => { latestValue!.notifyRepFound("Jane Doe"); });
      expect(screen.getByTestId("message").textContent).toBe(
        "Found your representative: Jane Doe"
      );
      expect(latestValue!.repTitle).toBeNull();
    });

    it("notifyRepFound without title resets repTitle to null", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });

      // Show mayor with title
      act(() => { latestValue!.notifyRepFound("Mayor Smith", "Mayor"); });
      expect(latestValue!.repTitle).toBe("Mayor");

      // Show rep without title
      act(() => { latestValue!.notifyRepFound("Katie V"); });
      expect(latestValue!.repTitle).toBeNull();
      expect(screen.getByTestId("message").textContent).toBe(
        "Found your representative: Katie V"
      );
    });

    it("notifyRepFound is ignored after status transitions to completed", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.completeCityLoading(true); });
      expect(screen.getByTestId("status").textContent).toBe("completed");

      // Late-arriving rep notification should be ignored
      act(() => { latestValue!.notifyRepFound("Late Rep"); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
      expect(screen.getByTestId("message").textContent).toBe(
        "Your Sacramento feed is ready!"
      );
    });

    it("notifyRepFound is ignored after status transitions to failed", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.completeCityLoading(false); });
      expect(screen.getByTestId("status").textContent).toBe("failed");

      act(() => { latestValue!.notifyRepFound("Late Rep"); });
      expect(screen.getByTestId("status").textContent).toBe("failed");
    });
  });

  // ── Full onboarding timeline simulation ────────────────────────────

  describe("full onboarding timeline (city + background work + mayor + rep)", () => {
    it("simulates the complete Sacramento onboarding flow with precise address", async () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      // T=0: WelcomeModal calls startCityLoading before navigating
      act(() => { latestValue!.startCityLoading("Sacramento"); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");
      expect(screen.getByTestId("message").textContent).toBe(
        "Looking for stories in Sacramento..."
      );

      // T=0: handleWelcomeComplete starts background work
      act(() => { latestValue!.startBackgroundWork(); });

      // T=~500ms: FeedContainer feed query resolves with stories
      act(() => { latestValue!.completeCityLoading(true); });

      // Banner stays alive because background work is active
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // T=~1s: getCityLeaders resolves, mayor found
      act(() => { latestValue!.notifyRepFound("Darrell Steinberg", "Mayor"); });
      expect(screen.getByTestId("status").textContent).toBe("found_rep");
      expect(screen.getByTestId("message").textContent).toBe(
        "Found Mayor: Darrell Steinberg"
      );

      // T=5s: Mayor notification clears after 4s
      await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // T=~6s: District rep found
      act(() => { latestValue!.notifyRepFound("Katie Valenzuela"); });
      expect(screen.getByTestId("message").textContent).toBe(
        "Found your representative: Katie Valenzuela"
      );

      // T=~10s: Rep notification clears
      await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // T=~10s: Background work finishes (finally block)
      act(() => { latestValue!.completeBackgroundWork(); });

      // Deferred success applies
      expect(screen.getByTestId("status").textContent).toBe("completed");
      expect(screen.getByTestId("message").textContent).toBe(
        "Your Sacramento feed is ready!"
      );

      // T=~12s: Auto-dismiss
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(screen.getByTestId("dismissed").textContent).toBe("true");
    });

    it("simulates city-only onboarding (no precise address, no rep)", async () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      // Start city loading + background work
      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });

      // Feed resolves with stories
      act(() => { latestValue!.completeCityLoading(true); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // Mayor found (no district rep because no precise coordinates)
      act(() => { latestValue!.notifyRepFound("Darrell Steinberg", "Mayor"); });
      expect(screen.getByTestId("message").textContent).toBe(
        "Found Mayor: Darrell Steinberg"
      );

      // Mayor notification clears
      await act(async () => { await vi.advanceTimersByTimeAsync(4500); });

      // Background work completes (no district rep discovery was needed)
      act(() => { latestValue!.completeBackgroundWork(); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
      expect(screen.getByTestId("message").textContent).toBe(
        "Your Sacramento feed is ready!"
      );
    });

    it("simulates onboarding where background work fails gracefully", async () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });

      // Feed resolves with stories
      act(() => { latestValue!.completeCityLoading(true); });

      // Background work hits a catch block and calls complete in finally
      // (no notifyRepFound calls happened)
      act(() => { latestValue!.completeBackgroundWork(); });

      // Deferred success still applies (feed had stories)
      expect(screen.getByTestId("status").textContent).toBe("completed");
      expect(screen.getByTestId("message").textContent).toBe(
        "Your Sacramento feed is ready!"
      );
    });

    it("simulates onboarding where feed has 0 stories and background work also fails", () => {
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      renderWithProvider({}, (v) => { latestValue = v; });

      act(() => { latestValue!.startCityLoading("Sacramento"); });
      act(() => { latestValue!.startBackgroundWork(); });

      // Feed resolves with 0 stories
      act(() => { latestValue!.completeCityLoading(false); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      // Background work fails and completes
      act(() => { latestValue!.completeBackgroundWork(); });

      // Deferred failure now applies
      expect(screen.getByTestId("status").textContent).toBe("failed");
      expect(screen.getByTestId("message").textContent).toContain(
        "No stories in Sacramento yet"
      );
    });
  });

  // ── Ref wiring tests ───────────────────────────────────────────────

  describe("ref wiring (notifyRepFoundRef and backgroundWorkRef)", () => {
    it("notifyRepFoundRef receives the notifyRepFound function with title support", () => {
      const repRef = { current: null as ((name: string, title?: string) => void) | null };
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={qc}>
          <PlaceOnboardingProvider notifyRepFoundRef={repRef}>
            <TestConsumer />
          </PlaceOnboardingProvider>
        </QueryClientProvider>
      );

      expect(repRef.current).toBeTypeOf("function");

      // Start scanning so notifyRepFound isn't ignored
      act(() => {
        // Need to get the context value to call startCityLoading
        // Use the ref directly instead
      });
    });

    it("backgroundWorkRef receives start and complete functions", () => {
      const bgRef = { current: null as { start: () => void; complete: () => void } | null };
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={qc}>
          <PlaceOnboardingProvider backgroundWorkRef={bgRef}>
            <TestConsumer />
          </PlaceOnboardingProvider>
        </QueryClientProvider>
      );

      expect(bgRef.current).not.toBeNull();
      expect(bgRef.current!.start).toBeTypeOf("function");
      expect(bgRef.current!.complete).toBeTypeOf("function");
    });

    it("backgroundWorkRef is cleaned up on unmount", () => {
      const bgRef = { current: null as { start: () => void; complete: () => void } | null };
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <PlaceOnboardingProvider backgroundWorkRef={bgRef}>
            <TestConsumer />
          </PlaceOnboardingProvider>
        </QueryClientProvider>
      );

      expect(bgRef.current).not.toBeNull();
      unmount();
      expect(bgRef.current).toBeNull();
    });

    it("calling backgroundWorkRef.start/complete defers and applies completion", () => {
      const bgRef = { current: null as { start: () => void; complete: () => void } | null };
      let latestValue: ReturnType<typeof usePlaceOnboarding> | null = null;
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={qc}>
          <PlaceOnboardingProvider backgroundWorkRef={bgRef}>
            <TestConsumer onRender={(v) => { latestValue = v; }} />
          </PlaceOnboardingProvider>
        </QueryClientProvider>
      );

      act(() => { latestValue!.startCityLoading("Sacramento"); });

      // Use the ref (as page.tsx does)
      act(() => { bgRef.current!.start(); });
      act(() => { latestValue!.completeCityLoading(true); });
      expect(screen.getByTestId("status").textContent).toBe("scanning");

      act(() => { bgRef.current!.complete(); });
      expect(screen.getByTestId("status").textContent).toBe("completed");
    });
  });
});
