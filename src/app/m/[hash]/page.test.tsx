import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Auth mock ────────────────────────────────────────────────
const mockUseAuth0 = vi.fn();
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => mockUseAuth0(),
}));

// ── Next.js navigation ──────────────────────────────────────
vi.mock("next/navigation", () => ({
  useParams: () => ({ hash: "testHash123" }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

// ── Theme context ───────────────────────────────────────────
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light" }),
}));

// ── API client ──────────────────────────────────────────────
vi.mock("@/lib/publicApiClient", () => ({
  getPublicCityDetail: vi.fn().mockResolvedValue(null),
}));

// ── MapLayerPanel ───────────────────────────────────────────
vi.mock("@/components/MapLayerPanel", () => ({
  default: () => <div data-testid="map-layer-panel" />,
}));

// ── Loader ──────────────────────────────────────────────────
vi.mock("@/components/Loader", () => ({
  default: () => <div data-testid="loader" />,
}));

// ── deltaMapColors ──────────────────────────────────────────
vi.mock("@/lib/deltaMapColors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deltaMapColors")>();
  return {
    ...actual,
    getDeltaMapFillColor: vi.fn(),
  };
});

// ── CSS import ──────────────────────────────────────────────
vi.mock("./styles.css", () => ({}));

// Stub the fetch call that getPublicMap makes internally
// (getPublicMap is defined inline in the module, not imported)
const fakeMap = {
  id: 1,
  short_hash: "testHash123",
  title: "Test Map",
  description: "A test map",
  query_source: "SELECT incident_date, latitude, longitude LIMIT 200",
  source_info: {
    dataset_id: "wg3w-h783",
    dataset_name: "Police Department Incident Reports: 2018 to Present",
    dataset_url: "https://data.sfgov.org/d/wg3w-h783",
    query_url:
      "https://data.sfgov.org/resource/wg3w-h783.json?$query=SELECT%20incident_date%2C%20latitude%2C%20longitude%20LIMIT%20200",
    query_text: "SELECT incident_date, latitude, longitude LIMIT 200",
  },
  city_slug: "san-francisco",
  location_data: [
    { lat: 37.78, lng: -122.42, label: "Test Location" },
  ],
  center_lat: 37.78,
  center_lng: -122.42,
  zoom: 12,
  map_style: "mapbox://styles/mapbox/light-v11",
};

// We need to intercept the fetch call that getPublicMap does
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(fakeMap),
  }));
  // Mock mapboxgl to prevent script loading attempts
  (window as any).mapboxgl = undefined;
});

import PublicMapPage from "./page";

describe("PublicMapPage signup CTA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithRedirect: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fakeMap),
    }));
  });

  it("shows signup CTA when user is not authenticated", async () => {
    render(<PublicMapPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sign up now" })
      ).toBeInTheDocument();
    });
  });

  it("hides signup CTA when user is authenticated", async () => {
    mockUseAuth0.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      loginWithRedirect: vi.fn(),
    });

    render(<PublicMapPage />);

    // Wait for loading to finish (map data arrives)
    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "Sign up now" })
    ).not.toBeInTheDocument();
  });

  it("keeps source information collapsed by default and expands on click", async () => {
    render(<PublicMapPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Source information" })
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(
        /Transparent\.city turns official public records into clear, source-linked maps/i
      )
    ).not.toBeInTheDocument();

    const sourceToggle = screen.getByRole("button", {
      name: "Source information",
    });
    expect(sourceToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(sourceToggle);

    expect(sourceToggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(
        /Transparent\.city turns official public records into clear, source-linked maps/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Police Department Incident Reports: 2018 to Present")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Police Department Incident Reports: 2018 to Present",
      })
    ).toHaveAttribute("href", "https://data.sfgov.org/d/wg3w-h783");
    expect(
      screen.getByRole("link", {
        name:
          "https://data.sfgov.org/resource/wg3w-h783.json?$query=SELECT%20incident_date%2C%20latitude%2C%20longitude%20LIMIT%20200",
      })
    ).toHaveAttribute(
      "href",
      "https://data.sfgov.org/resource/wg3w-h783.json?$query=SELECT%20incident_date%2C%20latitude%2C%20longitude%20LIMIT%20200"
    );
    expect(
      screen.getByText("SELECT incident_date, latitude, longitude LIMIT 200")
    ).toBeInTheDocument();
  });
});
