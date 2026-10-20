import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect } from "vitest"
import UserMenuPanel from "./UserMenuPanel"

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    logout: vi.fn(),
    getAccessTokenSilently: vi.fn(),
    isAuthenticated: true,
    user: { email: "admin@example.com" },
  }),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@/lib/wasteQueryPersister", () => ({ clearPersistedWasteCache: vi.fn() }))

describe("UserMenuPanel waste link", () => {
  it("shows Waste detection to admins, linking to /waste", () => {
    render(<UserMenuPanel isAdmin onClose={() => {}} />)
    const link = screen.getByText("Waste detection").closest("a")
    expect(link?.getAttribute("href")).toBe("/waste")
  })

  it("hides it from non-admins", () => {
    render(<UserMenuPanel isAdmin={false} onClose={() => {}} />)
    expect(screen.queryByText("Waste detection")).not.toBeInTheDocument()
  })
})
