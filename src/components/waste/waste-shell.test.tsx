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

vi.mock("@/lib/hooks/useWaste", () => ({
  useLatestWasteRun: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
}))

vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({
    selectedCityId: 57260,
    eligibleCities: [{ id: 57260, name: "San Francisco", slug: "san-francisco", datasets_count: 10 }],
    isLoading: false,
    isFetching: false,
    cityLoadError: null,
    isCityFallback: false,
    setSelectedCityId: vi.fn(),
    selectedCityName: "San Francisco",
  }),
}))

describe("WasteShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders title and description in the header", () => {
    render(<WasteShell title="My Title" description="My description">Content</WasteShell>)
    expect(screen.getByText("My Title")).toBeInTheDocument()
    expect(screen.getByText("My description")).toBeInTheDocument()
  })

  it("shows the selected city name as a badge next to the title", () => {
    render(<WasteShell title="Command Center">Content</WasteShell>)
    const badges = screen.getAllByText("San Francisco")
    expect(badges.length).toBeGreaterThanOrEqual(1)
    const badge = badges.find((el) => el.className.includes("purple"))
    expect(badge).toBeInTheDocument()
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

  it("renders tab navigation links", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    expect(screen.getByText("Command Center")).toBeInTheDocument()
    expect(screen.getByText("Operations")).toBeInTheDocument()
    expect(screen.getByText("Forensics")).toBeInTheDocument()
  })
})
