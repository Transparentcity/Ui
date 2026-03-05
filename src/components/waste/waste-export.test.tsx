import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteExport } from "./waste-export"

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetToken = vi.fn().mockResolvedValue("mock-token")

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ getAccessTokenSilently: mockGetToken }),
}))

vi.mock("@/lib/apiClient", () => ({
  exportWasteFindings: vi.fn(),
  exportAuditorReport: vi.fn(),
}))

import { exportWasteFindings, exportAuditorReport } from "@/lib/apiClient"

const mockExportFindings = vi.mocked(exportWasteFindings)
const mockExportReport = vi.mocked(exportAuditorReport)

describe("WasteExport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue("mock-token")
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url")
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders all three export buttons", () => {
    render(<WasteExport category="payroll" />)
    expect(screen.getByText("Excel")).toBeInTheDocument()
    expect(screen.getByText("CSV")).toBeInTheDocument()
    expect(screen.getByText("JSON")).toBeInTheDocument()
  })

  // ── Excel export ───────────────────────────────────────────────────────────

  it("shows loading indicator and disables other buttons during Excel export", async () => {
    let resolveExport!: (v: Blob) => void
    mockExportReport.mockImplementation(
      () => new Promise((res) => { resolveExport = res })
    )
    render(<WasteExport category="payroll" />)

    fireEvent.click(screen.getByText("Excel"))

    await waitFor(() => {
      expect(screen.getByText("...")).toBeInTheDocument()
    })

    // Other buttons should be disabled
    expect(screen.getByText("CSV").closest("button")).toBeDisabled()
    expect(screen.getByText("JSON").closest("button")).toBeDisabled()

    // Resolve the export
    resolveExport(new Blob(["test"]))
    await waitFor(() => {
      expect(screen.getByText("Excel")).toBeInTheDocument()
    })
  })

  // ── CSV export ─────────────────────────────────────────────────────────────

  it("calls exportWasteFindings for CSV format", async () => {
    mockExportFindings.mockResolvedValue(new Blob(["csv-data"]))
    render(<WasteExport category="payroll" />)
    fireEvent.click(screen.getByText("CSV"))

    await waitFor(() => {
      expect(mockExportFindings).toHaveBeenCalledWith("mock-token", "payroll", "csv")
    })
  })

  // ── JSON export ────────────────────────────────────────────────────────────

  it("calls exportWasteFindings for JSON format", async () => {
    mockExportFindings.mockResolvedValue(new Blob(["json-data"]))
    render(<WasteExport category="payroll" />)
    fireEvent.click(screen.getByText("JSON"))

    await waitFor(() => {
      expect(mockExportFindings).toHaveBeenCalledWith("mock-token", "payroll", "json")
    })
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it("shows error message when export fails", async () => {
    mockExportReport.mockRejectedValue(new Error("Export service unavailable"))
    render(<WasteExport category="payroll" />)
    fireEvent.click(screen.getByText("Excel"))

    await waitFor(() => {
      expect(screen.getByText("Export service unavailable")).toBeInTheDocument()
    })
  })

  it("re-enables buttons after export error", async () => {
    mockExportReport.mockRejectedValue(new Error("fail"))
    render(<WasteExport category="payroll" />)
    fireEvent.click(screen.getByText("Excel"))

    await waitFor(() => {
      expect(screen.getByText("Excel").closest("button")).not.toBeDisabled()
    })
  })
})
