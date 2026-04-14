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
      "Your neighborhood feed is ready!"
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

    // Auto-dismiss after 5s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
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

    // Auto-dismiss after 5s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
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
});
