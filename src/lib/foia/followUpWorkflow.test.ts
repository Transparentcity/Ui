/**
 * Tests for FOIA follow-up workflow helper functions.
 * These are pure functions used across the FOIA module.
 */
import { describe, it, expect } from "vitest"
import {
  getFollowUpTaskSpec,
  buildNoResponseTaskPayload,
  isNarrowingSignal,
  FOLLOW_UP_CLASSIFICATION_TO_ACTION,
  FOLLOW_UP_ACTION_OPTIONS,
  FOLLOW_UP_QUICK_INSERTS,
} from "./followUpWorkflow"

// ---------------------------------------------------------------------------
// getFollowUpTaskSpec
// ---------------------------------------------------------------------------

describe("getFollowUpTaskSpec", () => {
  it("returns correct task type and title for each action", () => {
    const cases: [string, string, string][] = [
      ["no_response", "no_response", "No response - send status check email"],
      ["narrow_request", "narrow_request", "Revise & narrow the original request"],
      ["pickup_data", "pickup_data", "Pick up data (see instructions)"],
      ["generate_response", "send_response", "Draft and send response email"],
      ["status_update", "general_followup", "Review status update"],
      ["no_records", "general_followup", "Review 'no records' response & determine next steps"],
      ["partial_no_records", "follow_up_partial", "Follow up with remaining departments still searching"],
      ["pay_fee", "pay_fee", "Pay copying/mailing fee to receive records"],
      ["appeal", "appeal_denial", "Appeal denial or exemption claim"],
      ["none", "general_followup", "Follow up on interaction"],
    ]

    for (const [action, expectedType, expectedTitle] of cases) {
      const result = getFollowUpTaskSpec(action)
      expect(result.type).toBe(expectedType)
      expect(result.title).toBe(expectedTitle)
    }
  })

  it("defaults to general_followup for undefined action", () => {
    const result = getFollowUpTaskSpec(undefined)
    expect(result.type).toBe("general_followup")
    expect(result.title).toBe("Follow up on interaction")
  })

  it("defaults to general_followup for unknown action", () => {
    const result = getFollowUpTaskSpec("unknown_action")
    expect(result.type).toBe("general_followup")
    expect(result.title).toBe("Follow up on interaction")
  })
})

// ---------------------------------------------------------------------------
// buildNoResponseTaskPayload
// ---------------------------------------------------------------------------

describe("buildNoResponseTaskPayload", () => {
  it("creates a task payload with request_id and reason", () => {
    const payload = buildNoResponseTaskPayload(42, "No response after outbound email")
    expect(payload.request_id).toBe(42)
    expect(payload.type).toBe("no_response")
    expect(payload.title).toBe("No response - send 10-day status check")
    expect(payload.description).toBe("No response after outbound email")
    expect(payload.due_at).toBeDefined()
  })

  it("sets due date approximately 10 days in the future by default", () => {
    const before = Date.now()
    const payload = buildNoResponseTaskPayload(1, "test")
    const dueMs = new Date(payload.due_at).getTime()
    const expectedMs = before + 10 * 24 * 60 * 60 * 1000
    // Allow 1 second tolerance
    expect(Math.abs(dueMs - expectedMs)).toBeLessThan(1000)
  })

  it("respects custom days parameter", () => {
    const before = Date.now()
    const payload = buildNoResponseTaskPayload(1, "test", 5)
    const dueMs = new Date(payload.due_at).getTime()
    const expectedMs = before + 5 * 24 * 60 * 60 * 1000
    expect(Math.abs(dueMs - expectedMs)).toBeLessThan(1000)
  })
})

// ---------------------------------------------------------------------------
// isNarrowingSignal
// ---------------------------------------------------------------------------

describe("isNarrowingSignal", () => {
  it('returns true for classification "narrow_request"', () => {
    expect(isNarrowingSignal({ direction: "inbound", classification: "narrow_request" })).toBe(true)
  })

  it('returns true for classification "clarification"', () => {
    expect(isNarrowingSignal({ direction: "inbound", classification: "clarification" })).toBe(true)
  })

  it("returns false for outbound messages", () => {
    expect(
      isNarrowingSignal({ direction: "outbound", classification: "narrow_request" })
    ).toBe(false)
  })

  it('returns true when subject contains "narrow"', () => {
    expect(isNarrowingSignal({ direction: "inbound", subject: "Please narrow your request" })).toBe(
      true
    )
  })

  it('returns true when body contains "too broad"', () => {
    expect(
      isNarrowingSignal({ direction: "inbound", body: "Your request is too broad to process" })
    ).toBe(true)
  })

  it('returns true when emailSnippet contains "voluminous"', () => {
    expect(
      isNarrowingSignal({
        direction: "inbound",
        emailSnippet: "The request is too voluminous",
      })
    ).toBe(true)
  })

  it("returns false for unrelated inbound messages", () => {
    expect(
      isNarrowingSignal({
        direction: "inbound",
        classification: "acknowledgment",
        subject: "We received your request",
        body: "Thank you for submitting your request.",
      })
    ).toBe(false)
  })

  it("returns false when all fields are empty", () => {
    expect(isNarrowingSignal({})).toBe(false)
  })

  it("returns true when direction is undefined but text has narrowing keywords", () => {
    // direction is undefined (not "outbound"), so keyword check applies
    expect(isNarrowingSignal({ body: "narrow your scope" })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Classification-to-action mapping
// ---------------------------------------------------------------------------

describe("FOLLOW_UP_CLASSIFICATION_TO_ACTION", () => {
  it("maps narrow_request to narrow_request", () => {
    expect(FOLLOW_UP_CLASSIFICATION_TO_ACTION["narrow_request"]).toBe("narrow_request")
  })

  it("maps clarification to narrow_request", () => {
    expect(FOLLOW_UP_CLASSIFICATION_TO_ACTION["clarification"]).toBe("narrow_request")
  })

  it("maps fee_notice to pay_fee", () => {
    expect(FOLLOW_UP_CLASSIFICATION_TO_ACTION["fee_notice"]).toBe("pay_fee")
  })

  it("maps denial to appeal", () => {
    expect(FOLLOW_UP_CLASSIFICATION_TO_ACTION["denial"]).toBe("appeal")
  })

  it("maps data_delivery to none", () => {
    expect(FOLLOW_UP_CLASSIFICATION_TO_ACTION["data_delivery"]).toBe("none")
  })

  it("maps acknowledgment to none", () => {
    expect(FOLLOW_UP_CLASSIFICATION_TO_ACTION["acknowledgment"]).toBe("none")
  })
})

// ---------------------------------------------------------------------------
// Constants shape
// ---------------------------------------------------------------------------

describe("FOLLOW_UP_ACTION_OPTIONS", () => {
  it("includes all expected action values", () => {
    const values = FOLLOW_UP_ACTION_OPTIONS.map((o) => o.value)
    expect(values).toContain("none")
    expect(values).toContain("narrow_request")
    expect(values).toContain("pickup_data")
    expect(values).toContain("pay_fee")
    expect(values).toContain("appeal")
    expect(values).toContain("no_response")
  })

  it("has unique values", () => {
    const values = FOLLOW_UP_ACTION_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe("FOLLOW_UP_QUICK_INSERTS", () => {
  it("has at least 5 quick insert options", () => {
    expect(FOLLOW_UP_QUICK_INSERTS.length).toBeGreaterThanOrEqual(5)
  })

  it("each option has label and text", () => {
    for (const insert of FOLLOW_UP_QUICK_INSERTS) {
      expect(insert.label).toBeTruthy()
      expect(insert.text).toBeTruthy()
    }
  })
})
