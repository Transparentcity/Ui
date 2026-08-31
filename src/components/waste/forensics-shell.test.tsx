import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect } from "vitest"
import { ForensicsShell } from "./forensics-shell"

let mockPathname = "/waste"
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}))

vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function activeTabNames() {
  return screen
    .getAllByRole("link")
    .filter((a) => a.className.includes("border-[var(--brand-primary)]"))
    .map((a) => a.textContent?.trim())
}

describe("ForensicsShell", () => {
  it("renders the three simplified tabs with flattened hrefs", () => {
    mockPathname = "/waste"
    render(<ForensicsShell>content</ForensicsShell>)
    const links = screen.getAllByRole("link")
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/waste",
      "/waste/departments",
      "/waste/reports",
    ])
  })

  it("marks By category active at the module root", () => {
    mockPathname = "/waste"
    render(<ForensicsShell>content</ForensicsShell>)
    expect(activeTabNames()).toEqual(["By category"])
  })

  it("keeps By category active on category detail pages", () => {
    mockPathname = "/waste/categories/payroll"
    render(<ForensicsShell>content</ForensicsShell>)
    expect(activeTabNames()).toEqual(["By category"])
  })

  it("marks Reports active on workpaper detail pages", () => {
    mockPathname = "/waste/reports/fy26-q3-vendor-procurement"
    render(<ForensicsShell>content</ForensicsShell>)
    expect(activeTabNames()).toEqual(["Reports"])
  })

  it("marks By department active on its page", () => {
    mockPathname = "/waste/departments"
    render(<ForensicsShell>content</ForensicsShell>)
    expect(activeTabNames()).toEqual(["By department"])
  })

  it("renders children and optional title", () => {
    mockPathname = "/waste"
    render(<ForensicsShell title="Analysis Categories">the-body</ForensicsShell>)
    expect(screen.getByText("Analysis Categories")).toBeInTheDocument()
    expect(screen.getByText("the-body")).toBeInTheDocument()
  })
})
