import { render, screen, waitFor } from "@testing-library/react";
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
      expect(screen.getByText("Sign up now")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
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

    expect(screen.queryByText("Sign up now")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
  });
});
