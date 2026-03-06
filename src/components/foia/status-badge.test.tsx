/**
 * Tests for FOIA status badge components.
 * Verifies every status renders without error and shows the correct label.
 */
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { RequestStatusBadge, TaskStatusBadge } from "./status-badge"
import type { RequestStatus, TaskStatus } from "@/lib/foia/types"

describe("RequestStatusBadge", () => {
  const statuses: { status: RequestStatus; label: string }[] = [
    { status: "draft", label: "Draft" },
    { status: "submitted", label: "Submitted" },
    { status: "submitted_unacknowledged", label: "Unacknowledged" },
    { status: "acknowledged", label: "Acknowledged" },
    { status: "clarification_requested", label: "Clarification" },
    { status: "partially_fulfilled", label: "Partial" },
    { status: "fee_requested", label: "Fee Requested" },
    { status: "extension_claimed", label: "Extension" },
    { status: "denied", label: "Denied" },
    { status: "fulfilled", label: "Fulfilled" },
    { status: "closed_incomplete", label: "Closed" },
  ]

  for (const { status, label } of statuses) {
    it(`renders "${label}" for status "${status}"`, () => {
      render(<RequestStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  }
})

describe("TaskStatusBadge", () => {
  const statuses: { status: TaskStatus; label: string }[] = [
    { status: "pending", label: "Pending" },
    { status: "assigned", label: "Assigned" },
    { status: "in_progress", label: "In Progress" },
    { status: "completed", label: "Completed" },
    { status: "cancelled", label: "Cancelled" },
  ]

  for (const { status, label } of statuses) {
    it(`renders "${label}" for status "${status}"`, () => {
      render(<TaskStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  }
})
