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
  default: ({ children, href, onClick, ...props }: any) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}))

vi.mock("@/components/Loader", () => ({
  default: () => <div data-testid="loader">Loading...</div>,
}))

describe("WasteShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sidebar is hidden on mobile by default", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    const sidebar = document.querySelector("aside")
    expect(sidebar?.className).toContain("hidden")
    expect(sidebar?.className).toContain("lg:flex")
  })

  it("hamburger button opens sidebar", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    const hamburger = screen.getByLabelText("Open navigation menu")
    fireEvent.click(hamburger)
    const sidebar = document.querySelector("aside")
    expect(sidebar?.className).toContain("fixed")
    expect(sidebar?.className).toContain("flex")
    expect(sidebar?.className).not.toMatch(/\bhidden\b/)
  })

  it("overlay appears when sidebar is open", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    fireEvent.click(screen.getByLabelText("Open navigation menu"))
    // Overlay has bg-black/50 and lg:hidden
    const overlay = document.querySelector(".bg-black\\/50")
    expect(overlay).toBeInTheDocument()
  })

  it("clicking overlay closes sidebar", () => {
    render(<WasteShell title="Test">Content</WasteShell>)
    fireEvent.click(screen.getByLabelText("Open navigation menu"))
    const overlay = document.querySelector(".bg-black\\/50")
    expect(overlay).toBeInTheDocument()
    fireEvent.click(overlay!)
    const sidebar = document.querySelector("aside")
    expect(sidebar?.className).toContain("hidden")
  })

  it("clicking a category nav item closes sidebar on mobile", () => {
    const onCategoryChange = vi.fn()
    render(
      <WasteShell title="Test" activeCategory="overview" onCategoryChange={onCategoryChange}>
        Content
      </WasteShell>
    )
    // Open sidebar
    fireEvent.click(screen.getByLabelText("Open navigation menu"))
    const sidebar = document.querySelector("aside")
    expect(sidebar?.className).not.toMatch(/\bhidden\b/)

    // Click a category button (e.g., "Payroll")
    const payrollBtn = screen.getByText("Payroll").closest("button")!
    fireEvent.click(payrollBtn)

    // Sidebar should be hidden again
    expect(document.querySelector("aside")?.className).toContain("hidden")
    expect(onCategoryChange).toHaveBeenCalledWith("payroll")
  })

  it("clicking a link nav item closes sidebar on mobile", () => {
    render(
      <WasteShell title="Test">Content</WasteShell>
    )
    // Open sidebar
    fireEvent.click(screen.getByLabelText("Open navigation menu"))

    // Click a link item (e.g., "Entity Scores")
    const link = screen.getByText("Entity Scores").closest("a")!
    fireEvent.click(link)

    // Sidebar should be hidden again
    expect(document.querySelector("aside")?.className).toContain("hidden")
  })

  it("renders title and description in the header", () => {
    render(<WasteShell title="My Title" description="My description">Content</WasteShell>)
    expect(screen.getByText("My Title")).toBeInTheDocument()
    expect(screen.getByText("My description")).toBeInTheDocument()
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
})
