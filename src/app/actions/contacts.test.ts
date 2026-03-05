/**
 * Tests for CRM contact server actions.
 *
 * Covers:
 * - checkDuplicateEmail
 * - getContactActivity
 */
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Mock database client ---------------------------------------------------

// Build a chainable query builder mock that records calls
function createMockQueryBuilder() {
  let result: { data: unknown; error: Error | null } = { data: [], error: null }
  let singleMode = false

  const builder: Record<string, any> = {}

  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "ilike",
    "in",
    "is",
    "order",
    "limit",
  ]

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }

  builder.single = vi.fn().mockImplementation(() => {
    singleMode = true
    const rows = Array.isArray(result.data) ? result.data : []
    return Promise.resolve({
      data: rows[0] ?? null,
      error: result.error,
    })
  })

  builder.then = vi.fn().mockImplementation((resolve: any) => {
    resolve(result)
    return Promise.resolve()
  })

  // Helper to set what data the next query returns
  builder._setResult = (data: unknown, error: Error | null = null) => {
    result = { data, error }
  }

  return builder
}

let queryBuilders: Record<string, any>[] = []

const mockCreateClient = vi.fn().mockImplementation(() => ({
  from: vi.fn().mockImplementation((table: string) => {
    const builder = createMockQueryBuilder()
    queryBuilders.push({ table, builder })
    return builder
  }),
}))

vi.mock("@/lib/db", () => ({
  createClient: () => mockCreateClient(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// ---- Import under test (after mocks) ----------------------------------------

import { checkDuplicateEmail, getContactActivity } from "./contacts"

// ---- Tests -------------------------------------------------------------------

describe("checkDuplicateEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("returns duplicate:true with name when email exists", async () => {
    // Set up the mock to return a match
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        builder._setResult([{ id: "c-1", name: "Alice Wong" }])
        queryBuilders.push({ table: "prospects", builder })
        return builder
      }),
    }))

    const result = await checkDuplicateEmail("alice@city.gov")
    expect(result).toEqual({ duplicate: true, name: "Alice Wong" })
  })

  it("returns duplicate:false when email does not exist", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        builder._setResult([])
        queryBuilders.push({ table: "prospects", builder })
        return builder
      }),
    }))

    const result = await checkDuplicateEmail("new@city.gov")
    expect(result).toEqual({ duplicate: false })
  })

  it("returns duplicate:false for empty email", async () => {
    const result = await checkDuplicateEmail("")
    expect(result).toEqual({ duplicate: false })
  })

  it("returns duplicate:false for whitespace-only email", async () => {
    const result = await checkDuplicateEmail("   ")
    expect(result).toEqual({ duplicate: false })
  })

  it("calls neq to exclude the given id", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        builder._setResult([])
        queryBuilders.push({ table: "prospects", builder })
        return builder
      }),
    }))

    await checkDuplicateEmail("alice@city.gov", "c-99")

    const { builder } = queryBuilders[0]
    expect(builder.neq).toHaveBeenCalledWith("id", "c-99")
  })

  it("does not call neq when excludeId is not provided", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        builder._setResult([])
        queryBuilders.push({ table: "prospects", builder })
        return builder
      }),
    }))

    await checkDuplicateEmail("alice@city.gov")

    const { builder } = queryBuilders[0]
    expect(builder.neq).not.toHaveBeenCalled()
  })
})

describe("getContactActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("returns contact_created event from prospect data", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          // prospects query
          builder._setResult([{
            created_at: "2025-01-01T10:00:00Z",
            updated_at: "2025-01-01T10:00:00Z",
            name: "Alice Wong",
          }])
        } else {
          // send_queue query
          builder._setResult([])
        }
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const events = await getContactActivity("c-1")

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: "contact_created",
      date: "2025-01-01T10:00:00Z",
      detail: expect.stringContaining("Alice Wong"),
    })
  })

  it("includes contact_updated event when updated_at differs from created_at", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          builder._setResult([{
            created_at: "2025-01-01T10:00:00Z",
            updated_at: "2025-02-15T14:00:00Z",
            name: "Alice Wong",
          }])
        } else {
          builder._setResult([])
        }
        queryBuilders.push({ builder })
        return builder
      }),
    }))

    const events = await getContactActivity("c-1")

    expect(events).toHaveLength(2)
    const types = events.map((e) => e.type)
    expect(types).toContain("contact_created")
    expect(types).toContain("contact_updated")
  })

  it("includes draft_generated and email_sent events from send_queue", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          builder._setResult([{
            created_at: "2025-01-01T10:00:00Z",
            updated_at: "2025-01-01T10:00:00Z",
            name: "Alice Wong",
          }])
        } else {
          builder._setResult([
            {
              id: "q-1",
              status: "sent",
              created_at: "2025-02-10T09:00:00Z",
              sent_at: "2025-02-11T10:00:00Z",
              personalized_subject: "Budget update",
            },
            {
              id: "q-2",
              status: "pending_review",
              created_at: "2025-03-01T08:00:00Z",
              sent_at: null,
              personalized_subject: "Police overtime",
            },
          ])
        }
        queryBuilders.push({ builder })
        return builder
      }),
    }))

    const events = await getContactActivity("c-1")

    const types = events.map((e) => e.type)
    expect(types).toContain("contact_created")
    expect(types).toContain("draft_generated")
    expect(types).toContain("email_sent")
    // q-1 generates both draft_generated + email_sent, q-2 generates only draft_generated
    expect(events.filter((e) => e.type === "draft_generated")).toHaveLength(2)
    expect(events.filter((e) => e.type === "email_sent")).toHaveLength(1)
  })

  it("sorts events chronologically (newest first)", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          builder._setResult([{
            created_at: "2025-01-01T10:00:00Z",
            updated_at: "2025-01-01T10:00:00Z",
            name: "Alice Wong",
          }])
        } else {
          builder._setResult([
            {
              id: "q-1",
              status: "sent",
              created_at: "2025-03-01T09:00:00Z",
              sent_at: "2025-03-02T10:00:00Z",
              personalized_subject: "Draft A",
            },
          ])
        }
        queryBuilders.push({ builder })
        return builder
      }),
    }))

    const events = await getContactActivity("c-1")

    // Newest first: sent (Mar 2) > draft (Mar 1) > created (Jan 1)
    expect(events[0].type).toBe("email_sent")
    expect(events[1].type).toBe("draft_generated")
    expect(events[2].type).toBe("contact_created")
  })

  it("returns empty array when contact is not found", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          // prospects: no match (single returns null)
          builder._setResult([])
        } else {
          builder._setResult([])
        }
        queryBuilders.push({ builder })
        return builder
      }),
    }))

    const events = await getContactActivity("nonexistent")
    expect(events).toEqual([])
  })

  it("uses (No subject) fallback when personalized_subject is null", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          builder._setResult([{
            created_at: "2025-01-01T10:00:00Z",
            updated_at: "2025-01-01T10:00:00Z",
            name: "Alice",
          }])
        } else {
          builder._setResult([
            {
              id: "q-1",
              status: "pending_review",
              created_at: "2025-02-01T09:00:00Z",
              sent_at: null,
              personalized_subject: null,
            },
          ])
        }
        queryBuilders.push({ builder })
        return builder
      }),
    }))

    const events = await getContactActivity("c-1")
    const draftEvent = events.find((e) => e.type === "draft_generated")
    expect(draftEvent?.detail).toContain("(No subject)")
  })
})
