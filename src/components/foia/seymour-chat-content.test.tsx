/**
 * Tests for the Seymour Chat page:
 * - Tools collapsed by default (item 11)
 * - Tool names shown as pills when expanded
 * - Quick prompts always visible
 * - Empty state message
 */
import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    getAccessTokenSilently: vi.fn(),
  }),
}))

vi.mock("@/lib/apiClient", () => ({
  sendChatMessageStream: vi.fn(),
  createNewSession: vi.fn(),
}))

// Mock Collapsible with functional open/close behavior
vi.mock("@/components/ui/collapsible", () => {
  const React = require("react")
  return {
    Collapsible: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode
      open: boolean
      onOpenChange: (open: boolean) => void
    }) => (
      <div data-testid="collapsible" data-open={open}>
        {React.Children.map(children, (child: React.ReactElement) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { "data-parent-open": open, onOpenChange } as any)
            : child
        )}
      </div>
    ),
    CollapsibleTrigger: ({
      children,
      className,
      onOpenChange,
      "data-parent-open": parentOpen,
      ...props
    }: any) => (
      <button
        {...props}
        className={className}
        onClick={() => onOpenChange?.(!parentOpen)}
        data-testid="collapsible-trigger"
      >
        {children}
      </button>
    ),
    CollapsibleContent: ({
      children,
      "data-parent-open": parentOpen,
    }: any) =>
      parentOpen ? (
        <div data-testid="collapsible-content">{children}</div>
      ) : null,
  }
})

import { SeymourChatContent } from "./seymour-chat-content"

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SeymourChatContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
  })

  // -----------------------------------------------------------------------
  // Item 11: Tools collapsed by default
  // -----------------------------------------------------------------------

  it("renders 'Available commands' trigger button", () => {
    render(<SeymourChatContent />)
    expect(screen.getByText("Available commands", { exact: false })).toBeInTheDocument()
  })

  it("does not show tool names by default (collapsed)", () => {
    render(<SeymourChatContent />)
    // Tool names should NOT be visible when collapsed
    expect(screen.queryByText("Classify FOIA Email")).not.toBeInTheDocument()
    expect(screen.queryByText("Anomaly Detection")).not.toBeInTheDocument()
  })

  it("shows tool names as pills when trigger is clicked", () => {
    render(<SeymourChatContent />)

    // Click "Available commands" to expand
    fireEvent.click(screen.getByTestId("collapsible-trigger"))

    // Now tool names should be visible
    expect(screen.getByText("Classify FOIA Email")).toBeInTheDocument()
    expect(screen.getByText("Process FOIA Emails")).toBeInTheDocument()
    expect(screen.getByText("Search Datasets")).toBeInTheDocument()
    expect(screen.getByText("Fetch Portal Data")).toBeInTheDocument()
    expect(screen.getByText("Anomaly Detection")).toBeInTheDocument()
    expect(screen.getByText("Web Research")).toBeInTheDocument()
    expect(screen.getByText("Send Email")).toBeInTheDocument()
    expect(screen.getByText("Analyze Requests")).toBeInTheDocument()
  })

  it("does not show tool descriptions or examples", () => {
    render(<SeymourChatContent />)
    fireEvent.click(screen.getByTestId("collapsible-trigger"))

    // Old detailed descriptions should NOT exist
    expect(
      screen.queryByText(/Classify an inbound email from a city agency/)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Scan the inbox for FOIA-related/)
    ).not.toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Quick prompts always visible
  // -----------------------------------------------------------------------

  it("shows quick prompt buttons on initial load", () => {
    render(<SeymourChatContent />)
    expect(screen.getByText("Quick start:")).toBeInTheDocument()
    expect(
      screen.getByText("Check the inbox for any new FOIA responses")
    ).toBeInTheDocument()
    expect(screen.getByText("Which requests are overdue?")).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it("shows empty state message in chat area", () => {
    render(<SeymourChatContent />)
    expect(
      screen.getByText("Send a message to start working with Seymour")
    ).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  it("renders Seymour header", () => {
    render(<SeymourChatContent />)
    expect(screen.getByText("Seymour")).toBeInTheDocument()
    expect(
      screen.getByText("AI assistant for FOIA workflow")
    ).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Input area
  // -----------------------------------------------------------------------

  it("renders chat input textarea", () => {
    render(<SeymourChatContent />)
    expect(
      screen.getByPlaceholderText("Ask Seymour anything about FOIA requests...")
    ).toBeInTheDocument()
  })

  it("disables send button when input is empty", () => {
    render(<SeymourChatContent />)
    const buttons = screen.getAllByRole("button")
    const sendBtn = buttons.find((b) => b.className.includes("purple-600") && b.closest(".mt-3"))
    expect(sendBtn).toBeDisabled()
  })
})
