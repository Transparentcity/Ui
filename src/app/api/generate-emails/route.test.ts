/**
 * Tests for the /api/generate-emails API route.
 *
 * Covers:
 * - Input validation (missing email, no contacts)
 * - Contact fetching and active/inactive filtering
 * - Skipped contacts reporting (inactive, not found)
 * - Anomaly-to-contact matching (district, keyword, citywide)
 * - Claude API call and JSON parsing
 * - Error handling
 */
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Mocks ----------------------------------------------------------------

// Mock the AI SDK
const mockGenerateText = vi.fn()
vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
}))

// Mock Anthropic provider
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => () => "mocked-model",
}))

// Mock press-release-archetypes
vi.mock("@/lib/press-release-archetypes", () => ({
  getArchetypeById: (id: string) => {
    if (id === "T1-26") {
      return {
        id: "T1-26",
        name: "Small Business Survival Rates",
        category: "economy",
        description: "Net business formation (openings minus closures).",
        dataset: "Registered Business Locations (g8m3-pdis)",
        exampleHeadline: "San Francisco Gained 1,869 Net New Businesses in 2025.",
      }
    }
    return undefined
  },
}))

// Mock Supabase client
const mockSelect = vi.fn()
const mockIn = vi.fn()
const mockFrom = vi.fn()

vi.mock("@/lib/db", () => ({
  createClient: () => ({
    from: (...args: any[]) => {
      mockFrom(...args)
      return {
        select: (...sArgs: any[]) => {
          mockSelect(...sArgs)
          return {
            in: (...inArgs: any[]) => {
              mockIn(...inArgs)
              // Return the mock result — set via setupDbMock()
              return dbMockResult
            },
          }
        },
      }
    },
  }),
}))

// ---- Helpers ---------------------------------------------------------------

let dbMockResult: { data: any; error: any }

function setupDbMock(data: any[], error: any = null) {
  dbMockResult = { data, error }
}

function makeRequest(body: Record<string, any>) {
  return new Request("http://localhost/api/generate-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const ACTIVE_CONTACT = {
  id: "c-alan",
  name: "Alan Wong",
  title: "Commissioner",
  organization: "City of SF",
  department: "Planning",
  jurisdiction: "District 5",
  status: "active",
  prospect_keywords: [
    { keyword_id: "k1", keywords: { id: "k1", name: "budget", description: null, category: null } },
  ],
}

const INACTIVE_CONTACT = {
  id: "c-bob",
  name: "Bob Inactive",
  title: "Staff",
  organization: "City of SF",
  department: null,
  jurisdiction: null,
  status: "inactive",
  prospect_keywords: [],
}

const ANOMALIES = [
  {
    id: "a-1",
    metric_name: "Permit Delays",
    district_label: "D5",
    district: 5,
    is_citywide: false,
    severity: "high",
    pct_change: 47.2,
    recent_mean: 156,
    comparison_mean: 106,
    metric_category: "housing",
    group_field: "permit_type",
    group_value: "Building",
    anomaly_keywords: [
      { keyword_id: "k1", keywords: { id: "k1", name: "budget" } },
    ],
  },
  {
    id: "a-2",
    metric_name: "311 Response Times",
    district_label: "Citywide",
    district: 0,
    is_citywide: true,
    severity: "medium",
    pct_change: 23.0,
    recent_mean: 4.5,
    comparison_mean: 3.7,
    metric_category: "services",
    anomaly_keywords: [],
  },
]

// ---- Import under test (after mocks) --------------------------------------

import { POST } from "./route"

// ---- Tests -----------------------------------------------------------------

describe("/api/generate-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // Input validation
  // ==========================================================================

  it("returns 400 when sampleEmail is missing", async () => {
    const req = makeRequest({ contactIds: ["c-1"] })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/sample email.*required/i)
  })

  it("returns 400 when contactIds is empty", async () => {
    const req = makeRequest({ sampleEmail: "Hi there", contactIds: [] })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/required/i)
  })

  it("returns 400 when contactIds is missing", async () => {
    const req = makeRequest({ sampleEmail: "Hi there" })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
  })

  // ==========================================================================
  // Contact fetching — no status filter in query
  // ==========================================================================

  it("fetches contacts without status filter (fetches all, filters after)", async () => {
    setupDbMock([ACTIVE_CONTACT])
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        emails: [{
          subject: "Test",
          body: "Hi Alan",
          contactId: "c-alan",
          anomalyIds: [],
        }],
      }),
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
    })
    await POST(req)

    // Verify .in() was called with the contact IDs (no .eq("status", "active"))
    expect(mockIn).toHaveBeenCalledWith("id", ["c-alan"])
    // The .from() should query "prospects"
    expect(mockFrom).toHaveBeenCalledWith("prospects")
  })

  // ==========================================================================
  // Skipped contacts: inactive
  // ==========================================================================

  it("skips inactive contacts and reports them in response", async () => {
    setupDbMock([ACTIVE_CONTACT, INACTIVE_CONTACT])
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        emails: [{
          subject: "Test",
          body: "Hi Alan",
          contactId: "c-alan",
          anomalyIds: [],
        }],
      }),
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan", "c-bob"],
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.skippedContacts).toContain("Bob Inactive")
    expect(data.contactCount).toBe(1) // Only active contact counted
  })

  // ==========================================================================
  // Skipped contacts: not found in DB
  // ==========================================================================

  it("reports contacts not found in DB as skipped", async () => {
    setupDbMock([ACTIVE_CONTACT]) // Only Alan found
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        emails: [{
          subject: "Test",
          body: "Hi Alan",
          contactId: "c-alan",
          anomalyIds: [],
        }],
      }),
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan", "c-unknown-id"],
    })
    const res = await POST(req)
    const data = await res.json()

    expect(data.skippedContacts).toHaveLength(1)
    expect(data.skippedContacts[0]).toContain("Unknown")
  })

  // ==========================================================================
  // All contacts inactive → 400
  // ==========================================================================

  it("returns 400 with skippedContacts when all contacts are inactive", async () => {
    setupDbMock([INACTIVE_CONTACT])

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-bob"],
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/no active contacts/i)
    expect(data.skippedContacts).toContain("Bob Inactive")
  })

  // ==========================================================================
  // Anomaly matching: district
  // ==========================================================================

  it("matches district anomalies to contacts by jurisdiction", async () => {
    setupDbMock([ACTIVE_CONTACT]) // jurisdiction: "District 5"
    let capturedPrompt = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedPrompt = args.prompt
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test",
            body: "Hi Alan",
            contactId: "c-alan",
            anomalyIds: ["a-1"],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      includeAnomalies: true,
      anomalies: ANOMALIES,
    })
    await POST(req)

    // The prompt should include the D5 anomaly for Alan (jurisdiction: "District 5")
    expect(capturedPrompt).toContain("Permit Delays")
    expect(capturedPrompt).toContain("a-1")
  })

  // ==========================================================================
  // Anomaly matching: citywide always included
  // ==========================================================================

  it("includes citywide anomalies for all contacts", async () => {
    setupDbMock([ACTIVE_CONTACT])
    let capturedPrompt = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedPrompt = args.prompt
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test",
            body: "Hi Alan",
            contactId: "c-alan",
            anomalyIds: ["a-1", "a-2"],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      includeAnomalies: true,
      anomalies: ANOMALIES,
    })
    await POST(req)

    // Both D5 and Citywide anomalies should be in the prompt
    expect(capturedPrompt).toContain("a-1")
    expect(capturedPrompt).toContain("a-2")
    expect(capturedPrompt).toContain("311 Response Times")
  })

  // ==========================================================================
  // No anomalies when includeAnomalies is false
  // ==========================================================================

  it("excludes anomalies when includeAnomalies is false", async () => {
    setupDbMock([ACTIVE_CONTACT])
    let capturedPrompt = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedPrompt = args.prompt
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test",
            body: "Hi Alan",
            contactId: "c-alan",
            anomalyIds: [],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      includeAnomalies: false,
    })
    await POST(req)

    expect(capturedPrompt).toContain("No matching anomalies")
    expect(capturedPrompt).not.toContain("Permit Delays")
  })

  // ==========================================================================
  // Claude response parsing
  // ==========================================================================

  it("parses Claude JSON response and returns emails", async () => {
    setupDbMock([ACTIVE_CONTACT])
    mockGenerateText.mockResolvedValueOnce({
      text: `Here are the emails:
{
  "emails": [
    {
      "subject": "Alan - permit delay spike",
      "body": "Hi Alan, permit processing times jumped 47%...",
      "contactId": "c-alan",
      "anomalyIds": ["a-1"]
    }
  ]
}`,
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
    })
    const res = await POST(req)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.emails).toHaveLength(1)
    expect(data.emails[0].subject).toBe("Alan - permit delay spike")
    expect(data.emails[0].contactId).toBe("c-alan")
  })

  it("returns empty emails array when Claude response has no valid JSON", async () => {
    setupDbMock([ACTIVE_CONTACT])
    mockGenerateText.mockResolvedValueOnce({
      text: "I'm sorry, I cannot generate emails right now.",
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
    })
    const res = await POST(req)
    const data = await res.json()

    // No JSON match → returns success with empty emails (not an error)
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.emails).toEqual([])
  })

  // ==========================================================================
  // DB error handling
  // ==========================================================================

  it("returns 500 when database query fails", async () => {
    setupDbMock(null, { message: "Connection refused" })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toMatch(/failed to fetch contacts/i)
  })

  // ==========================================================================
  // Claude API error handling
  // ==========================================================================

  it("returns 500 when Claude API throws", async () => {
    setupDbMock([ACTIVE_CONTACT])
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"))

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe("API rate limit")
  })

  // ==========================================================================
  // Sanitization
  // ==========================================================================

  it("sanitizes emoji and control characters from contact names", async () => {
    const contactWithEmoji = {
      ...ACTIVE_CONTACT,
      name: "Alan 🎉 Wong",
      title: "Commissioner 🏛️",
    }
    setupDbMock([contactWithEmoji])
    let capturedPrompt = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedPrompt = args.prompt
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test",
            body: "Hi Alan",
            contactId: "c-alan",
            anomalyIds: [],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
    })
    await POST(req)

    // Emoji should be stripped
    expect(capturedPrompt).toContain("Alan  Wong")
    expect(capturedPrompt).not.toContain("🎉")
  })

  // ==========================================================================
  // Press release mode — archetype integration
  // ==========================================================================

  it("uses press release prompt when mode is press_release", async () => {
    setupDbMock([ACTIVE_CONTACT])
    let capturedSystem = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedSystem = args.system
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test PR",
            body: "Press release body",
            contactId: "c-alan",
            anomalyIds: [],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      mode: "press_release",
    })
    await POST(req)

    expect(capturedSystem).toContain("CRITICAL STYLE RULES")
    expect(capturedSystem).toContain("SINGLE TOPIC")
    expect(capturedSystem).toContain("WRITE LIKE A REPORTER")
  })

  it("injects archetype context into press release prompt when archetypeId is valid", async () => {
    setupDbMock([ACTIVE_CONTACT])
    let capturedSystem = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedSystem = args.system
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test PR",
            body: "Press release body",
            contactId: "c-alan",
            anomalyIds: [],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      mode: "press_release",
      archetypeId: "T1-26",
    })
    await POST(req)

    expect(capturedSystem).toContain("STORY ARCHETYPE SELECTED")
    expect(capturedSystem).toContain("Small Business Survival Rates")
    expect(capturedSystem).toContain("g8m3-pdis")
  })

  it("returns 400 when archetypeId is invalid", async () => {
    setupDbMock([ACTIVE_CONTACT])

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      mode: "press_release",
      archetypeId: "INVALID-ID",
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain("Invalid archetype ID")
  })

  it("omits archetype context when no archetypeId is provided in press release mode", async () => {
    setupDbMock([ACTIVE_CONTACT])
    let capturedSystem = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedSystem = args.system
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test",
            body: "Body",
            contactId: "c-alan",
            anomalyIds: [],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      mode: "press_release",
    })
    await POST(req)

    expect(capturedSystem).toContain("CRITICAL STYLE RULES")
    expect(capturedSystem).not.toContain("STORY ARCHETYPE SELECTED")
  })

  // ==========================================================================
  // voiceNotes sanitization
  // ==========================================================================

  it("sanitizes voiceNotes before injecting into prompt", async () => {
    setupDbMock([ACTIVE_CONTACT])
    let capturedSystem = ""
    mockGenerateText.mockImplementationOnce((args: any) => {
      capturedSystem = args.system
      return {
        text: JSON.stringify({
          emails: [{
            subject: "Test",
            body: "Body",
            contactId: "c-alan",
            anomalyIds: [],
          }],
        }),
      }
    })

    const req = makeRequest({
      sampleEmail: "Hello",
      sampleSubject: "Test",
      contactIds: ["c-alan"],
      voiceNotes: "Keep it punchy 🎉 and fun",
    })
    await POST(req)

    expect(capturedSystem).toContain("VOICE/STYLE NOTES")
    expect(capturedSystem).toContain("Keep it punchy")
    expect(capturedSystem).not.toContain("🎉")
  })
})
