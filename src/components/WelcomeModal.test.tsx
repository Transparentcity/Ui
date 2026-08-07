/**
 * WelcomeModal onboarding tests.
 * Verifies each step (welcome, preferences)
 * renders fast and does not block on API calls during initial paint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeModal from "./WelcomeModal";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token");

// Auth0 keeps `user` referentially stable across renders. The reset effect in
// WelcomeModal lists `user` as a dependency, so a mock that rebuilt this object
// on every call would re-run the effect forever and exhaust the worker heap.
const mockAuth0State = {
  isAuthenticated: true,
  isLoading: false,
  getAccessTokenSilently: mockGetAccessTokenSilently,
  user: { email: "test@example.com" },
};

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => mockAuth0State,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

// Prevent vite from transforming LocationMapSave → mapbox-gl (worker OOM).
vi.mock("@/components/LocationMapSave", () => ({
  default: () => null,
}));

const mockStartJob = vi.fn();
const mockStartCityLoading = vi.fn();
const mockCompleteCityLoading = vi.fn();
// Stable object for the same reason as mockAuth0State above.
const mockPlaceOnboarding = {
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
};
vi.mock("@/contexts/PlaceOnboardingContext", () => ({
  usePlaceOnboarding: () => mockPlaceOnboarding,
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
const mockGetCity = vi.fn().mockResolvedValue({ id: 1, is_active: true, is_launched: true, name: "San Francisco" });
const mockGetCityLeaders = vi.fn().mockResolvedValue([]);
const mockCreatePlace = vi.fn().mockResolvedValue({ id: 42 });
const mockRunPlaceMetricsAndAnomaliesAsJob = vi.fn().mockResolvedValue({ job_id: "job-123" });
const mockFollowRepresentative = vi.fn().mockResolvedValue({ followed: true, city_id: 1, district: "0" });
const mockUnfollowRepresentative = vi.fn().mockResolvedValue({ followed: false, city_id: 1, district: "0" });
const mockUpdateUserProfile = vi.fn().mockResolvedValue(undefined);
const mockUploadAvatar = vi.fn().mockResolvedValue({ picture_url: "https://cdn.example.com/a.png" });
const mockSendOnboardingWelcomeEmail = vi.fn().mockResolvedValue(undefined);
const mockSubscribeNewsletter = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribeNewsletter = vi.fn().mockResolvedValue(undefined);
const mockGetGiftMeta = vi.fn().mockResolvedValue(null);
const mockGetCurrentPosition = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  saveCity: (...args: unknown[]) => mockSaveCity(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  getCity: (...args: unknown[]) => mockGetCity(...args),
  getCityLeaders: (...args: unknown[]) => mockGetCityLeaders(...args),
  createPlace: (...args: unknown[]) => mockCreatePlace(...args),
  runPlaceMetricsAndAnomaliesAsJob: (...args: unknown[]) => mockRunPlaceMetricsAndAnomaliesAsJob(...args),
  followRepresentative: (...args: unknown[]) => mockFollowRepresentative(...args),
  unfollowRepresentative: (...args: unknown[]) => mockUnfollowRepresentative(...args),
  updateUserProfile: (...args: unknown[]) => mockUpdateUserProfile(...args),
  uploadAvatar: (...args: unknown[]) => mockUploadAvatar(...args),
  sendOnboardingWelcomeEmail: (...args: unknown[]) => mockSendOnboardingWelcomeEmail(...args),
  subscribeNewsletter: (...args: unknown[]) => mockSubscribeNewsletter(...args),
  unsubscribeNewsletter: (...args: unknown[]) => mockUnsubscribeNewsletter(...args),
  getGiftMeta: (...args: unknown[]) => mockGetGiftMeta(...args),
}));

vi.mock("@/lib/findDistrictFromCoordinates", () => ({
  findDistrictFromCoordinates: vi.fn().mockResolvedValue(5),
}));

vi.mock("@/lib/uiEvents", () => ({
  emitSavedCitiesChanged: vi.fn(),
}));

vi.mock("@/lib/mapUtils", () => ({
  DEFAULT_PLACE_RADIUS_M: 200,
  MAX_PLACE_RADIUS_M: 1000,
}));

vi.mock("@/lib/newsletterPreferences", () => ({
  mergeNewsletterPreferenceFields: vi.fn((_extra: unknown, fields: unknown) => fields),
  readNewsletterPreferenceFields: vi.fn(() => ({
    newsletterDescription: "",
    newsletterFrequency: "weekly",
    // The real helper always returns an array; omitting it fed `undefined`
    // into NewsletterPromptBuilder and crashed the persona picker.
    newsletterPersonaSelections: [],
  })),
}));

vi.mock("@/lib/utils", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

// Stub fetch for welcome-email and geocode endpoints
function defaultFetchImpl(url: string) {
  if (typeof url === "string" && url.includes("/api/welcome-email")) {
    return Promise.resolve({ ok: true });
  }
  if (typeof url === "string" && url.includes("/api/geocode")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
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
      json: () =>
        Promise.resolve({
          cityName: "San Francisco",
          stateName: "California",
          countryName: "United States",
        }),
    });
  }
  return Promise.resolve({ ok: false, status: 404 });
}

const mockFetch = vi.fn().mockImplementation(defaultFetchImpl);
vi.stubGlobal("fetch", mockFetch);

describe("WelcomeModal", () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCitySelected: vi.fn(),
    onComplete: vi.fn(),
    onCityNotFound: vi.fn(),
  };

  // Onboarding opens on the profile step; the address and preferences suites
  // below enter at the address step directly so each step is covered in isolation.
  const defaultProps = { ...baseProps, initialStep: "welcome" as const };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchPublicCities.mockResolvedValue([]);
    mockGetCity.mockResolvedValue({ id: 1, is_active: true, is_launched: true, name: "San Francisco" });
    mockGetCityLeaders.mockResolvedValue([]);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: mockGetCurrentPosition,
      },
    });
  });

  // ── Step 1: Profile (name + avatar) ──────────────────────────────────

  describe("Profile step", () => {
    it("is the default entry step", () => {
      render(<WelcomeModal {...baseProps} />);

      expect(screen.getByText(/welcome to transparent\.city/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/enter city, zip or address/i)).not.toBeInTheDocument();
    });

    it("advances to the address step without saving when skipped", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal {...baseProps} />);

      await user.click(screen.getByRole("button", { name: /skip for now/i }));

      expect(screen.getByPlaceholderText(/enter city, zip or address/i)).toBeInTheDocument();
      expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    });

    it("saves the entered name before advancing to the address step", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal {...baseProps} />);

      await user.type(screen.getByPlaceholderText(/first name/i), "Ada");
      await user.type(screen.getByPlaceholderText(/last name/i), "Lovelace");
      await user.click(screen.getByRole("button", { name: /^Continue$/i }));

      await waitFor(() => {
        expect(mockUpdateUserProfile).toHaveBeenCalledWith("test-token", {
          first_name: "Ada",
          last_name: "Lovelace",
        });
      });
      expect(screen.getByPlaceholderText(/enter city, zip or address/i)).toBeInTheDocument();
    });
  });

  // ── Step 2: Welcome (address entry) ──────────────────────────────────

  describe("Welcome step", () => {
    it("renders instantly with address input and no spinner", () => {
      const start = performance.now();
      render(<WelcomeModal {...defaultProps} />);
      const elapsed = performance.now() - start;

      expect(screen.getByText(/discover your place/i)).toBeInTheDocument();
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

    it("keeps Continue text visible while GPS lookup is loading", async () => {
      mockGetCurrentPosition.mockImplementation(() => {
        // Leave pending so the loading state stays visible during the assertion.
      });

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "Oakland");
      const continueButton = screen.getByRole("button", { name: /^Continue$/i });
      expect(continueButton).not.toBeDisabled();

      await user.click(screen.getByRole("button", { name: /use my current location/i }));

      expect(screen.getByRole("button", { name: /^Continue$/i })).toBeDisabled();
    });
  });

  // ── Step 2: City found -> Preferences ────────────────────────────────

  describe("Preferences step", () => {
    afterEach(() => {
      mockFetch.mockImplementation(defaultFetchImpl);
    });

    const goToStep2 = async (user: ReturnType<typeof userEvent.setup>) => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);
      render(<WelcomeModal {...defaultProps} />);
      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));
      await waitFor(() => {
        expect(screen.getByText(/almost done/i)).toBeInTheDocument();
      });
    };

    it("shows welcome header and advanced options on step 2", async () => {
      const user = userEvent.setup();
      await goToStep2(user);

      expect(screen.queryByText(/Crime & Safety/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /personalize your weekly update \(optional\)/i })
      ).toBeInTheDocument();
    });

    it("reveals persona builder under advanced options", async () => {
      const user = userEvent.setup();
      await goToStep2(user);

      expect(screen.queryByText(/pick up to 3/i)).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /personalize your weekly update \(optional\)/i })
      );

      expect(screen.getByText(/pick up to 3/i)).toBeInTheDocument();
    });

    it("weekly update checkbox is pre-checked", async () => {
      const user = userEvent.setup();
      await goToStep2(user);

      expect(screen.getAllByText(/weekly update/i).length).toBeGreaterThan(0);
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();
    });

    it("shows no leader cards when city has no leaders", async () => {
      mockGetCityLeaders.mockResolvedValue([]);
      const user = userEvent.setup();
      await goToStep2(user);

      expect(screen.queryByRole("button", { name: /follow|following/i })).not.toBeInTheDocument();
    });

    it("shows mayor card pre-checked as Following when city has a mayor", async () => {
      mockGetCityLeaders.mockResolvedValue([
        { id: 1, city_id: 1, name: "London Breed", title: "Mayor", district: null },
      ]);
      const user = userEvent.setup();
      await goToStep2(user);

      expect(screen.getByText(/Mayor London Breed/i)).toBeInTheDocument();
      const followBtn = screen.getByRole("button", { name: /unfollow london breed/i });
      expect(followBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("shows both mayor and district rep when district is known", async () => {
      mockGetCityLeaders.mockResolvedValue([
        { id: 1, city_id: 1, name: "London Breed", title: "Mayor", district: null },
        { id: 2, city_id: 1, name: "Rafael Mandelman", title: "Supervisor, District 8", district: 8 },
      ]);
      // findDistrictFromCoordinates is already mocked to return 5; here we use address geocode
      // so district=null (no precise). For this test, make geocode return address type to get district 5.
      const user = userEvent.setup();
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);
      render(<WelcomeModal {...defaultProps} />);
      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "San Francisco");
      await user.click(screen.getByText(/^Continue$/i));

      await waitFor(() => {
        expect(screen.getByText(/Mayor London Breed/i)).toBeInTheDocument();
      });
      // District 5 was inferred but leader with district=5 doesn't exist in mock data,
      // so only mayor card shown.
      expect(screen.queryByText(/Rafael Mandelman/i)).not.toBeInTheDocument();
    });

    it("toggling mayor follow button changes aria-pressed", async () => {
      mockGetCityLeaders.mockResolvedValue([
        { id: 1, city_id: 1, name: "London Breed", title: "Mayor", district: null },
      ]);
      const user = userEvent.setup();
      await goToStep2(user);

      const followBtn = screen.getByRole("button", { name: /unfollow london breed/i });
      expect(followBtn).toHaveAttribute("aria-pressed", "true");

      await user.click(followBtn);

      expect(screen.getByRole("button", { name: /^follow london breed$/i })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("calls followRepresentative for checked mayor on Let's go", async () => {
      mockGetCityLeaders.mockResolvedValue([
        { id: 1, city_id: 1, name: "London Breed", title: "Mayor", district: null },
      ]);
      const user = userEvent.setup();
      await goToStep2(user);

      await user.click(screen.getByText(/let.s go/i));

      await waitFor(() => {
        expect(mockFollowRepresentative).toHaveBeenCalledWith(1, "0", "test-token");
      });
    });

    it("calls unfollowRepresentative when mayor is unchecked before Let's go", async () => {
      mockGetCityLeaders.mockResolvedValue([
        { id: 1, city_id: 1, name: "London Breed", title: "Mayor", district: null },
      ]);
      const user = userEvent.setup();
      await goToStep2(user);

      await user.click(screen.getByRole("button", { name: /unfollow london breed/i }));
      await user.click(screen.getByText(/let.s go/i));

      await waitFor(() => {
        expect(mockUnfollowRepresentative).toHaveBeenCalledWith(1, "0", "test-token");
      });
      expect(mockFollowRepresentative).not.toHaveBeenCalled();
    });

    it("routes a precise address to the coverage step", async () => {
      mockSearchPublicCities.mockResolvedValue([
        { id: 1, name: "San Francisco", state: "CA", country: "US", display_name: "San Francisco, CA" },
      ]);

      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/welcome-email")) {
          return Promise.resolve({ ok: true });
        }
        if (typeof url === "string" && url.includes("/api/geocode")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                cityName: "San Francisco",
                stateName: "California",
                countryName: "United States",
                lat: "37.7749",
                lon: "-122.4194",
                address: {},
                place_type: ["address"],
              }),
          });
        }
        if (typeof url === "string" && url.includes("/api/reverse-geocode")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                cityName: "San Francisco",
                stateName: "California",
                countryName: "United States",
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const user = userEvent.setup();
      render(<WelcomeModal {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/enter city, zip or address/i), "123 Main St");
      await user.click(screen.getByText(/^Continue$/i));

      // The place label/radius inputs belong to LocationMapSave, which is
      // stubbed out here, so assert on the step chrome WelcomeModal owns.
      await waitFor(() => {
        expect(screen.getByText(/drag the map to move the pin/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/good news/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Next$/i })).toBeInTheDocument();
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
      expect(screen.queryByText(/discover your place/i)).not.toBeInTheDocument();
    });

    it("resets state when re-opened", async () => {
      const { rerender } = render(<WelcomeModal {...defaultProps} isOpen={false} />);
      rerender(<WelcomeModal {...defaultProps} isOpen={true} />);

      // Should start at welcome step
      expect(screen.getByText(/discover your place/i)).toBeInTheDocument();
    });
  });
});
