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
const mockStartCityLoading = vi.fn();
const mockCompleteCityLoading = vi.fn();
vi.mock("@/contexts/PlaceOnboardingContext", () => ({
  usePlaceOnboarding: () => ({
    status: "idle",
    mode: "idle",
    message: "",
    cityName: null,
    repName: null,
    repTitle: null,
    dismissed: false,
    dismiss: vi.fn(),
    startJob: mockStartJob,
    startCityLoading: mockStartCityLoading,
    completeCityLoading: mockCompleteCityLoading,
    notifyRepFound: vi.fn(),
    startBackgroundWork: vi.fn(),
    completeBackgroundWork: vi.fn(),
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

vi.mock("@/lib/apiClient", () => ({
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  saveCity: (...args: unknown[]) => mockSaveCity(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  getCity: (...args: unknown[]) => mockGetCity(...args),
  createPlace: (...args: unknown[]) => mockCreatePlace(...args),
  runPlaceMetricsAndAnomaliesAsJob: (...args: unknown[]) => mockRunPlaceMetricsAndAnomaliesAsJob(...args),
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

      expect(screen.getByText(/discover your block/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/enter city, zip or address/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /use my current location/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Continue$/i })).toBeInTheDocument();
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

      const input = screen.getByPlaceholderText(/enter city, zip or address/i);
      await user.type(input, "123 Main");

      // Suggestions should not be fetched immediately
      expect(mockFetchAddressSuggestions).not.toHaveBeenCalled();

      // After debounce period, they should fire
      await waitFor(() => {
        expect(mockFetchAddressSuggestions).toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it("shows Continue button enabled only with input", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      const btn = screen.getByText(/^Continue$/i).closest("button")!;
      expect(btn).toBeDisabled();

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "Oakland");
      expect(btn).not.toBeDisabled();
    });
  });

  // ── Step 2: City found -> Preferences ────────────────────────────────

  describe("Preferences step", () => {
    it("renders digest step without category pills", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      const input = screen.getByPlaceholderText(/enter city, zip or address/i);
      await user.type(input, "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));

      await waitFor(() => {
        expect(screen.getByText(/almost there/i)).toBeInTheDocument();
      });

      expect(screen.queryByText("Crime & Safety")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /advanced newsletter options \(optional\)/i })
      ).toBeInTheDocument();
    });

    it("reveals optional personalization textarea under advanced options", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));

      await waitFor(() => {
        expect(screen.getByText(/almost there/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/in your own words \(optional\)/i)).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /advanced newsletter options \(optional\)/i })
      );

      expect(
        screen.getByLabelText(/in your own words \(optional\)/i)
      ).toBeInTheDocument();
    });

    it("weekly digest checkbox is pre-checked", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));

      await waitFor(() => {
        expect(screen.getByText(/almost there/i)).toBeInTheDocument();
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

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));

      await waitFor(() => {
        expect(screen.getByText(/let.s go/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/let.s go/i));

      // City should be saved
      await waitFor(() => {
        expect(mockSaveCity).toHaveBeenCalledWith(1, "test-token");
      });

      // City-level geocode: no district inference (findDistrictFromCoordinates not used)
      expect(defaultProps.onCitySelected).toHaveBeenCalledWith(1, null, null);
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

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "Smallville");
      await user.click(screen.getByText(/^Continue$/i));

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

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));

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
      expect(screen.queryByText(/discover your block/i)).not.toBeInTheDocument();
    });

    it("resets state when re-opened", async () => {
      const { rerender } = render(<WelcomeModal {...defaultProps} isOpen={false} />);
      rerender(<WelcomeModal {...defaultProps} isOpen={true} />);

      // Should start at welcome step
      expect(screen.getByText(/discover your block/i)).toBeInTheDocument();
    });
  });
});
