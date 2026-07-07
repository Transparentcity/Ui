import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteShell } from "./waste-shell"

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn(),
  }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/waste",
}))

vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href, onClick, ...props }: any) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}))

vi.mock("@/components/Loader", () => ({
  default: () => <div data-testid="loader">Loading...</div>,
}))

vi.mock("./waste-refresh-panel", () => ({
  WasteRefreshPanel: () => (
    <div data-testid="waste-refresh-panel">Weekly data refresh</div>
  ),
}))

vi.mock("@/lib/hooks/useWaste", () => ({
  useLatestWasteRun: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
}))

const useWasteCity = vi.fn()
vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => useWasteCity(),
}))

const CITY_DEFAULT = {
  selectedCityId: 57260,
  eligibleCities: [{ id: 57260, name: "San Francisco", slug: "san-francisco", datasets_count: 10 }],
  isLoading: false,
  isFetching: false,
  cityLoadError: null,
  isCityFallback: false,
  setSelectedCityId: vi.fn(),
  selectedCityName: "San Francisco",
  selectedCitySlug: "san-francisco",
  refetchCities: vi.fn(),
}

describe("WasteShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWasteCity.mockReturnValue(CITY_DEFAULT)
  })

  it("shows a Retry button on a city-load error and refetches on click", () => {
    const refetchCities = vi.fn()
    useWasteCity.mockReturnValue({
      ...CITY_DEFAULT,
      cityLoadError: Object.assign(new Error("504 Gateway Timeout"), {
        status: 504,
      }),
      refetchCities,
    })
    render(<WasteShell title="Test">Content</WasteShell>)
    expect(
      screen.getByText(/Couldn't load the waste city list/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByText("Retry"))
    expect(refetchCities).toHaveBeenCalledTimes(1)
  })

  it("does not offer Retry for a 403 (no admin access) error", () => {
    useWasteCity.mockReturnValue({
      ...CITY_DEFAULT,
      cityLoadError: Object.assign(new Error("403 Forbidden"), { status: 403 }),
    })
    render(<WasteShell title="Test">Content</WasteShell>)
    expect(screen.getByText(/doesn't have admin access/)).toBeInTheDocument()
    expect(screen.queryByText("Retry")).not.toBeInTheDocument()
  })

  it("renders title and description in the header", () => {
    render(<WasteShell title="My Title" description="My description">Content</WasteShell>)
    expect(screen.getByText("My Title")).toBeInTheDocument()
    expect(screen.getByText("My description")).toBeInTheDocument()
  })

  it("shows the selected city name as the city header", () => {
    render(<WasteShell title="Workspace">Content</WasteShell>)
    // The city name is carried by the city header row (the picker heading),
    // not a purple pill beside the title.
    expect(screen.getAllByText("San Francisco").length).toBeGreaterThanOrEqual(1)
  })

  it("shows the city name in the footer", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    expect(screen.getByText(/Analyzing: San Francisco/)).toBeInTheDocument()
  })

  it("renders actions in the header", () => {
    render(
      <WasteShell title="Test" actions={<button>Action Button</button>}>
        Content
      </WasteShell>
    )
    expect(screen.getByText("Action Button")).toBeInTheDocument()
  })

  it("renders children in the main content area", () => {
    render(<WasteShell title="Test"><div data-testid="child">Hello</div></WasteShell>)
    expect(screen.getByTestId("child")).toBeInTheDocument()
  })

  it("does not render the old top-level tab navigation", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    expect(screen.queryByText("Overview")).not.toBeInTheDocument()
    expect(screen.queryByText("Findings")).not.toBeInTheDocument()
    expect(screen.queryByText("Cases")).not.toBeInTheDocument()
    expect(screen.queryByText("Reports")).not.toBeInTheDocument()
  })

  it("keeps the Seymour toggle and admin tools in the top bar", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    expect(screen.getByText("Seymour")).toBeInTheDocument()
    expect(screen.getByLabelText("Admin tools")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Admin tools"))
    expect(screen.getByText("Methodology")).toBeInTheDocument()
  })

  it("shows the weekly refresh panel inside the gear menu", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    fireEvent.click(screen.getByLabelText("Admin tools"))
    expect(screen.getByTestId("waste-refresh-panel")).toBeInTheDocument()
    // The dead "Detectors & Data" link is gone.
    expect(screen.queryByText("Detectors & Data")).not.toBeInTheDocument()
  })
})
