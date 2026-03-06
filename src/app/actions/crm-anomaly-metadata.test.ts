/**
 * Tests for CRM anomaly metadata server actions.
 *
 * Verifies:
 * - All DB queries use `anomaly_id` (not `anomaly_id`)
 * - getOrCreateCrmMetadata returns existing or creates new
 * - getCrmMetadataForAnomalies returns map keyed by anomaly_id
 * - bulkUpdateCrmStatus uses a single .in() query (not N+1)
 * - deleteCrmMetadata targets correct column
 * - updateCrmStatus, updateCrmSeverity, updateCrmDistrictLabel, updateCrmNotes
 */
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Mock database client ---------------------------------------------------

function createMockQueryBuilder() {
  let result: { data: unknown; error: Error | null } = { data: [], error: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {}

  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "is",
    "order",
    "limit",
  ]

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }

  builder.single = vi.fn().mockImplementation(() => {
    const rows = Array.isArray(result.data) ? result.data : []
    return Promise.resolve({
      data: rows[0] ?? null,
      error: result.error,
    })
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// ---- Import under test (after mocks) ----------------------------------------

import {
  getOrCreateCrmMetadata,
  getCrmMetadataForAnomalies,
  updateCrmStatus,
  updateCrmSeverity,
  updateCrmDistrictLabel,
  updateCrmNotes,
  bulkUpdateCrmStatus,
  deleteCrmMetadata,
} from "./crm-anomaly-metadata"

// ---- Sample data ------------------------------------------------------------

const SAMPLE_METADATA = {
  id: "meta-uuid-1",
  anomaly_id: 101,
  district_label: "District 5",
  is_citywide: false,
  severity: "medium" as const,
  crm_status: "new" as const,
  notes: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
}

// ---- Tests -------------------------------------------------------------------

describe("getOrCreateCrmMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("queries crm_anomaly_metadata by anomaly_id", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await getOrCreateCrmMetadata(101)

    const { table, builder } = queryBuilders[0]
    expect(table).toBe("crm_anomaly_metadata")
    expect(builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })

  it("returns existing metadata when found", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const result = await getOrCreateCrmMetadata(101)
    expect(result).toEqual(SAMPLE_METADATA)
  })

  it("inserts with anomaly_id when metadata does not exist", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          // SELECT returns empty (triggers .single → null)
          builder._setResult([])
        } else {
          // INSERT returns new row
          builder._setResult([{ ...SAMPLE_METADATA, anomaly_id: 42 }])
        }
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const result = await getOrCreateCrmMetadata(42)

    // First call: select, second call: insert
    expect(queryBuilders).toHaveLength(2)
    const insertBuilder = queryBuilders[1].builder
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ anomaly_id: 42 })
    )
    expect(result.anomaly_id).toBe(42)
  })

  it("insert payload includes anomaly_id field", async () => {
    let callCount = 0
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        callCount++
        if (callCount === 1) {
          builder._setResult([])
        } else {
          builder._setResult([SAMPLE_METADATA])
        }
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await getOrCreateCrmMetadata(101)

    const insertBuilder = queryBuilders[1].builder
    const insertArg = insertBuilder.insert.mock.calls[0][0]
    expect(insertArg).toHaveProperty("anomaly_id", 101)
    expect(insertArg).toHaveProperty("severity", "medium")
    expect(insertArg).toHaveProperty("crm_status", "new")
  })
})

describe("getCrmMetadataForAnomalies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("queries using .in('anomaly_id', ids)", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await getCrmMetadataForAnomalies([101, 102])

    const { builder } = queryBuilders[0]
    expect(builder.in).toHaveBeenCalledWith("anomaly_id", [101, 102])
  })

  it("returns map keyed by anomaly_id", async () => {
    const meta2 = { ...SAMPLE_METADATA, id: "meta-2", anomaly_id: 102 }
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA, meta2])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    const result = await getCrmMetadataForAnomalies([101, 102])

    expect(result[101]).toEqual(SAMPLE_METADATA)
    expect(result[102]).toEqual(meta2)
  })

  it("returns empty object for empty input", async () => {
    const result = await getCrmMetadataForAnomalies([])
    expect(result).toEqual({})
    // Should not have called the DB at all
    expect(queryBuilders).toHaveLength(0)
  })

  it("deduplicates and filters invalid IDs", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await getCrmMetadataForAnomalies([101, 101, -1, NaN, 0])

    const { builder } = queryBuilders[0]
    // Only 101 should pass the filter (positive, finite, unique)
    expect(builder.in).toHaveBeenCalledWith("anomaly_id", [101])
  })
})

describe("updateCrmStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("updates using anomaly_id", async () => {
    let callCount = 0
    // Use mockImplementation (not Once) since getOrCreateCrmMetadata + updateCrmStatus
    // each call createClient() independently
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        callCount++
        // Call 1: getOrCreateCrmMetadata SELECT → return existing
        // Call 2: updateCrmStatus UPDATE → success
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await updateCrmStatus(101, "sent")

    // The update call uses .eq('anomaly_id', 101)
    const updateBuilder = queryBuilders.find(
      ({ builder }) => builder.update.mock.calls.length > 0
    )
    expect(updateBuilder).toBeDefined()
    expect(updateBuilder!.builder.update).toHaveBeenCalledWith({ crm_status: "sent" })
    expect(updateBuilder!.builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })
})

describe("updateCrmSeverity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("updates severity using anomaly_id", async () => {
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await updateCrmSeverity(101, "high")

    const updateBuilder = queryBuilders.find(
      ({ builder }) => builder.update.mock.calls.length > 0
    )
    expect(updateBuilder).toBeDefined()
    expect(updateBuilder!.builder.update).toHaveBeenCalledWith({ severity: "high" })
    expect(updateBuilder!.builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })
})

describe("updateCrmDistrictLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("updates district label using anomaly_id", async () => {
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await updateCrmDistrictLabel(101, "District 7", false)

    const updateBuilder = queryBuilders.find(
      ({ builder }) => builder.update.mock.calls.length > 0
    )
    expect(updateBuilder).toBeDefined()
    expect(updateBuilder!.builder.update).toHaveBeenCalledWith({
      district_label: "District 7",
      is_citywide: false,
    })
    expect(updateBuilder!.builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })
})

describe("updateCrmNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("updates notes using anomaly_id", async () => {
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await updateCrmNotes(101, "Follow up next week")

    const updateBuilder = queryBuilders.find(
      ({ builder }) => builder.update.mock.calls.length > 0
    )
    expect(updateBuilder).toBeDefined()
    expect(updateBuilder!.builder.update).toHaveBeenCalledWith({ notes: "Follow up next week" })
    expect(updateBuilder!.builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })
})

describe("bulkUpdateCrmStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("uses a single .in() query for the bulk update (not N+1)", async () => {
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult([SAMPLE_METADATA])
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await bulkUpdateCrmStatus([101, 102], "sent")

    // Find the builder that called .in() — that's the bulk update
    const bulkBuilder = queryBuilders.find(
      ({ builder }) => builder.in.mock.calls.length > 0
    )
    expect(bulkBuilder).toBeDefined()
    expect(bulkBuilder!.builder.in).toHaveBeenCalledWith(
      "anomaly_id",
      [101, 102]
    )
    expect(bulkBuilder!.builder.update).toHaveBeenCalledWith({
      crm_status: "sent",
    })
  })
})

describe("deleteCrmMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilders = []
  })

  it("deletes using anomaly_id", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult(null)
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await deleteCrmMetadata(101)

    const { table, builder } = queryBuilders[0]
    expect(table).toBe("crm_anomaly_metadata")
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })

  it("targets the correct table and column", async () => {
    mockCreateClient.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation((table: string) => {
        const builder = createMockQueryBuilder()
        builder._setResult(null)
        queryBuilders.push({ table, builder })
        return builder
      }),
    }))

    await deleteCrmMetadata(101)

    const { table, builder } = queryBuilders[0]
    expect(table).toBe("crm_anomaly_metadata")
    expect(builder.eq).toHaveBeenCalledWith("anomaly_id", 101)
  })
})
