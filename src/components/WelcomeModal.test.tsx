/**
 * WelcomeModal onboarding tests.
 * Verifies each step (welcome, preferences)
 * renders fast and does not block on API calls during initial paint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeModal from "./WelcomeModal";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token");

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessTokenSilently: mockGetAccessTokenSilently,
    user: { email: "test@example.com" },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockStartJob = vi.fn();
vi.mock("@/contexts/PlaceOnboardingContext", () => ({
  usePlaceOnboarding: () => ({
    status: "idle",
    message: "",
    repName: null,
    dismissed: false,
    dismiss: vi.fn(),
    startJob: mockStartJob,
    notifyRepFound: vi.fn(),
  }),
}));

const mockSearchPublicCities = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/publicApiClient", () => ({
  searchPublicCities: (...args: unknown[]) => mockSearchPublicCities(...args),
}));

const mockFetchAddressSuggestions = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/locationSearchUtils", () => ({
  fetchAddressSuggestions: (...args: unknown[]) => mockFetchAddressSuggestions(...args),
}));

const mockGetUserPreferences = vi.fn().mockResolvedValue({ extra: {} });
const mockSaveCity = vi.fn().mockResolvedValue(undefined);
const mockUpdateUserPreferences = vi.fn().mockResolvedValue(undefined);
const mockGetCity = vi.fn().mockResolvedValue({ id: 1, is_active: true, name: "San Francisco" });
const mockCreatePlace = vi.fn().mockResolvedValue({ id: 42 });
const mockRunPlaceMetricsAndAnomaliesAsJob = vi.fn().mockResolvedValue({ job_id: "job-123" });
const mockGetCityMetrics = vi.fn().mockResolvedValue([]);
const mockSaveUserMetricOrdering = vi.fn().mockResolvedValue(undefined);
const mockSubmitCityLeadInterest = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/apiClient", () => ({
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  saveCity: (...args: unknown[]) => mockSaveCity(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  getCity: (...args: unknown[]) => mockGetCity(...args),
  createPlace: (...args: unknown[]) => mockCreatePlace(...args),
  runPlaceMetricsAndAnomaliesAsJob: (...args: unknown[]) => mockRunPlaceMetricsAndAnomaliesAsJob(...args),
  getCityMetrics: (...args: unknown[]) => mockGetCityMetrics(...args),
  saveUserMetricOrdering: (...args: unknown[]) => mockSaveUserMetricOrdering(...args),
  submitCityLeadInterest: (...args: unknown[]) => mockSubmitCityLeadInterest(...args),
}));

vi.mock("@/lib/findDistrictFromCoordinates", () => ({
  findDistrictFromCoordinates: vi.fn().mockResolvedValue(5),
}));

vi.mock("@/lib/uiEvents", () => ({
  emitSavedCitiesChanged: vi.fn(),
}));

vi.mock("@/lib/mapUtils", () => ({
  DEFAULT_PLACE_RADIUS_M: 200,
}));

vi.mock("@/lib/newsletterPreferences", () => ({
  mergeNewsletterPreferenceFields: vi.fn((_extra: unknown, fields: unknown) => fields),
  readNewsletterPreferenceFields: vi.fn(() => ({
    newsletterDescription: "",
    newsletterFrequency: "weekly",
  })),
}));

vi.mock("@/lib/feed/categoryPresets", () => ({
  CATEGORY_PRESETS: [
    { id: "crime-safety", label: "Crime & Safety", metricCategories: ["Crime"] },
    { id: "government-budget", label: "Government Budget", metricCategories: ["Budget"] },
    { id: "housing", label: "Housing", metricCategories: ["Housing"] },
  ],
}));

vi.mock("@/lib/utils", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

// Stub fetch for welcome-email and geocode endpoints
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (typeof url === "string" && url.includes("/api/welcome-email")) {
    return Promise.resolve({ ok: true });
  }
  if (typeof url === "string" && url.includes("/api/geocode")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        cityName: "San Francisco",
        stateName: "California",
        countryName: "United States",
        lat: "37.7749",
        lon: "-122.4194",
        address: {},
      }),
    });
  }
  if (typeof url === "string" && url.includes("/api/reverse-geocode")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        cityName: "San Francisco",
        stateName: "California",
        countryName: "United States",
      }),
    });
  }
  return Promise.resolve({ ok: false, status: 404 });
});
vi.stubGlobal("fetch", mockFetch);

describe("WelcomeModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCitySelected: vi.fn(),
    onComplete: vi.fn(),
    onCityNotFound: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchPublicCities.mockResolvedValue([]);
    mockGetCity.mockResolvedValue({ id: 1, is_active: true, name: "San Francisco" });
  });

  // ── Step 1: Welcome (address entry) ──────────────────────────────────

  describe("Welcome step", () => {
    it("renders instantly with address input and no spinner", () => {
      const start = performance.now();
      render(<WelcomeModal {...defaultProps} />);
      const elapsed = performance.now() - start;

      expect(screen.getByText(/where do you live/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/enter your address/i)).toBeInTheDocument();
      expect(screen.getByText(/find my city/i)).toBeInTheDocument();
      expect(elapsed).toBeLessThan(100);
    });

    it("does not fetch any API data on mount", () => {
      render(<WelcomeModal {...defaultProps} />);

      // Only getUserPreferences should be called (lightweight, for newsletter prefs)
      expect(mockSearchPublicCities).not.toHaveBeenCalled();
      expect(mockGetCity).not.toHaveBeenCalled();
    });

    it("debounces address suggestions (300ms)", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      const input = screen.getByPlaceholderText(/enter your address/i);
      await user.type(input, "123 Main");

      // Suggestions should not be fetched immediately
      expect(mockFetchAddressSuggestions).not.toHaveBeenCalled();

      // After debounce period, they should fire
      await waitFor(() => {
        expect(mockFetchAddressSuggestions).toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it("shows 'Find my city' button enabled only with input", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      const btn = screen.getByText(/find my city/i).closest("button")!;
      expect(btn).toBeDisabled();

      await user.type(screen.getByPlaceholderText(/enter your address/i), "Oakland");
      expect(btn).not.toBeDisabled();
    });
  });

  // ── Step 2: City found -> Preferences ────────────────────────────────

  describe("Preferences step", () => {
    it("renders category pills without blocking API calls", async () => {
      // Simulate: city search returns a match, getCity confirms it's active
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      // Type address and submit
      const input = screen.getByPlaceholderText(/enter your address/i);
      await user.type(input, "San Francisco");
      await user.click(screen.getByText(/find my city/i));

      // Should transition to preferences step
      await waitFor(() => {
        expect(screen.getByText(/what do you care about/i)).toBeInTheDocument();
      });

      // Category pills render instantly
      expect(screen.getByText("Crime & Safety")).toBeInTheDocument();
      expect(screen.getByText("Government Budget")).toBeInTheDocument();
      expect(screen.getByText("Housing")).toBeInTheDocument();
    });

    it("pre-selects default categories immediately", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter your address/i), "San Francisco");
      await user.click(screen.getByText(/find my city/i));

      await waitFor(() => {
        expect(screen.getByText(/what do you care about/i)).toBeInTheDocument();
      });

      // Crime & Safety and Government Budget should be pre-selected
      const crimeBtn = screen.getByText("Crime & Safety").closest("button")!;
      expect(crimeBtn.getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles category pills without API calls", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter your address/i), "San Francisco");
      await user.click(screen.getByText(/find my city/i));

      await waitFor(() => {
        expect(screen.getByText("Housing")).toBeInTheDocument();
      });

      // Toggle housing on
      const housingBtn = screen.getByText("Housing").closest("button")!;
      expect(housingBtn.getAttribute("aria-pressed")).toBe("false");
      await user.click(housingBtn);
      expect(housingBtn.getAttribute("aria-pressed")).toBe("true");

      // No additional API calls for toggling
      const callsAfterRender = mockGetCity.mock.calls.length;
      await user.click(housingBtn);
      expect(mockGetCity.mock.calls.length).toBe(callsAfterRender);
    });

    it("weekly digest checkbox is pre-checked", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter your address/i), "San Francisco");
      await user.click(screen.getByText(/find my city/i));

      await waitFor(() => {
        expect(screen.getByText(/weekly digest/i)).toBeInTheDocument();
      });

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();
    });

    it("saves city and navigates immediately on 'Let's go' (prefs save in background)", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter your address/i), "San Francisco");
      await user.click(screen.getByText(/find my city/i));

      await waitFor(() => {
        expect(screen.getByText(/let.s go/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/let.s go/i));

      // City should be saved
      await waitFor(() => {
        expect(mockSaveCity).toHaveBeenCalledWith(1, "test-token");
      });

      // Navigation callback fires immediately
      expect(defaultProps.onCitySelected).toHaveBeenCalledWith(1, null);
      expect(defaultProps.onComplete).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  // ── City not found (delegates to onCityNotFound) ─────────────────────

  describe("City not found", () => {
    it("calls onCityNotFound when city is not in database", async () => {
      mockSearchPublicCities.mockResolvedValue([]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter your address/i), "Smallville");
      await user.click(screen.getByText(/find my city/i));

      await waitFor(() => {
        expect(defaultProps.onCityNotFound).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it("calls onCityNotFound when city exists but is inactive", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 99, name: "San Francisco", state: "California", country: "United States", display_name: "San Francisco, California" },
      ]);
      mockGetCity.mockResolvedValue({ id: 99, is_active: false, name: "San Francisco" });

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter your address/i), "San Francisco");
      await user.click(screen.getByText(/find my city/i));

      await waitFor(() => {
        expect(defaultProps.onCityNotFound).toHaveBeenCalledWith(
          "San Francisco",
          "California",
          "United States"
        );
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });
  });

  // ── Modal behavior ───────────────────────────────────────────────────

  describe("Modal behavior", () => {
    it("does not render when isOpen is false", () => {
      render(<WelcomeModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText(/where do you live/i)).not.toBeInTheDocument();
    });

    it("resets state when re-opened", async () => {
      const { rerender } = render(<WelcomeModal {...defaultProps} isOpen={false} />);
      rerender(<WelcomeModal {...defaultProps} isOpen={true} />);

      // Should start at welcome step
      expect(screen.getByText(/where do you live/i)).toBeInTheDocument();
    });
  });
});
