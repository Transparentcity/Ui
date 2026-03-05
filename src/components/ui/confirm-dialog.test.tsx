import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect } from "vitest"
import { ConfirmDialog } from "./confirm-dialog"

describe("ConfirmDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete item",
    description: "This action cannot be undone.",
    onConfirm: vi.fn(),
  }

  it("renders title and description when open", () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText("Delete item")).toBeInTheDocument()
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument()
  })

  it("does not render content when closed", () => {
    render(<ConfirmDialog {...defaultProps} open={false} />)
    expect(screen.queryByText("Delete item")).not.toBeInTheDocument()
  })

  it("uses default confirm label 'Confirm'", () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument()
  })

  it("uses custom confirm label", () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Delete Forever" />)
    expect(screen.getByRole("button", { name: /Delete Forever/i })).toBeInTheDocument()
  })

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it("shows Cancel button", () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument()
  })

  it("shows loading spinner when loading is true", () => {
    render(<ConfirmDialog {...defaultProps} loading />)
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()
  })

  it("disables Cancel and Confirm when loading", () => {
    render(<ConfirmDialog {...defaultProps} loading confirmLabel="Delete" />)
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Delete/i })).toBeDisabled()
  })

  it("applies destructive variant styling", () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" confirmLabel="Delete" />)
    const btn = screen.getByRole("button", { name: /Delete/i })
    expect(btn.className).toContain("bg-red-600")
  })

  it("applies default variant styling", () => {
    render(<ConfirmDialog {...defaultProps} variant="default" />)
    const btn = screen.getByRole("button", { name: /Confirm/i })
    expect(btn.className).toContain("bg-purple-600")
  })
})
