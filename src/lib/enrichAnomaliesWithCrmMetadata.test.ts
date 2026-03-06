/**
 * Tests for enrichAnomaliesWithCrmMetadata — verifies queries use
 * anomaly_id and metadata is correctly merged.
 */
import { vi, describe, it, expect, beforeEach } from "vitest"
import type { Anomaly, CrmAnomalyMetadata } from "./types"

// ---- Mock database client ---------------------------------------------------

function createMockQueryBuilder() {
  let result: { data: unknown; error: Error | null } = { data: [], error: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {}

  const chainMethods = ["select", "insert", "update", "delete", "eq", "in", "order", "limit"]

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }

  builder.single = vi.fn().mockImplementation(() => {
    const rows = Array.isArray(result.data) ? result.data : []
    return Promise.resolve({ data: rows[0] ?? null, error: result.error })
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
    resolve(result)
    return Promise.resolve()
  })

  builder._setResult = (data: unknown, error: Error | null = null) => {
    result = { data, error }
  }

  return builder
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queryBuilders: Array<{ table: string; builder: any }> = []

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

// ---- Import under test (after mocks) ----------------------------------------

import {
  enrichAnomaliesWithCrmMetadata,
  enrichAnomalyWithCrmMetadata,
} from "./enrichAnomaliesWithCrmMetadata"

// ---- Sample data ------------------------------------------------------------

const makeAnomaly = (id: number): Anomaly => ({
  id,
  anomaly_id: id,
  created_at: "2025-01-01T00:00:00Z",
})

const makeMetadata = (platformResultId: number): CrmAnomalyMetadata => ({
  id: `meta-${platformResultId}`,
  anomaly_id: platformResultId,
  district_label: "District 5",
  is_citywide: false,
  severity: "medium",
  crm_status: "new",
  notes: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
})

// ---- Tests -------------------------------------------------------------------

describe("enrichAnomaliesWithCrmMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("queries crm_anomaly_metadata using anomaly_id", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([makeMetadata(101)])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await enrichAnomaliesWithCrmMetadata([makeAnomaly(101)])

    const { table, builder } = queryBuilders[0]
    expect(table).toBe("crm_anomaly_metadata")
    expect(builder.in).toHaveBeenCalledWith("anomaly_id", [101])
  })

  it("passes anomaly IDs to the .in() filter", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await enrichAnomaliesWithCrmMetadata([makeAnomaly(101), makeAnomaly(202)])

    const { builder } = queryBuilders[0]
    expect(builder.in).toHaveBeenCalledWith("anomaly_id", [101, 202])
  })

  it("merges metadata into anomalies by anomaly_id", async () => {
    const metadata = makeMetadata(101)
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([metadata])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const result = await enrichAnomaliesWithCrmMetadata([makeAnomaly(101)])

    expect(result[0].crm_metadata).toEqual(metadata)
    expect(result[0].district_label).toBe("District 5")
    expect(result[0].severity).toBe("medium")
    expect(result[0].crm_status).toBe("new")
  })

  it("returns anomalies unchanged when no metadata found", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const anomaly = makeAnomaly(999)
    const result = await enrichAnomaliesWithCrmMetadata([anomaly])

    expect(result[0]).toEqual(anomaly)
    expect(result[0].crm_metadata).toBeUndefined()
  })

  it("returns empty array for empty input", async () => {
    const result = await enrichAnomaliesWithCrmMetadata([])
    expect(result).toEqual([])
    expect(queryBuilders).toHaveLength(0)
  })

  it("handles multiple anomalies with partial metadata", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        // Only metadata for 101, not 102
        builder._setResult([makeMetadata(101)])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const result = await enrichAnomaliesWithCrmMetadata([
      makeAnomaly(101),
      makeAnomaly(102),
    ])

    expect(result[0].crm_metadata).toBeDefined()
    expect(result[1].crm_metadata).toBeUndefined()
  })

  it("gracefully handles DB errors", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult(null, new Error("DB connection failed"))
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const anomaly = makeAnomaly(101)
    const result = await enrichAnomaliesWithCrmMetadata([anomaly])

    // Should return original anomalies unchanged on error
    expect(result).toEqual([anomaly])
  })
})

describe("enrichAnomalyWithCrmMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("enriches a single anomaly", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([makeMetadata(101)])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const result = await enrichAnomalyWithCrmMetadata(makeAnomaly(101))

    expect(result.crm_metadata).toBeDefined()
    expect(result.crm_metadata!.anomaly_id).toBe(101)
  })
})
