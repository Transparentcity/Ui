import { describe, it, expect } from "vitest"
import type { Query } from "@tanstack/react-query"
import {
  shouldPersistQuery,
  wastePersister,
  clearPersistedWasteCache,
} from "./wasteQueryPersister"
import type { PersistedClient } from "@tanstack/react-query-persist-client"

function fakeQuery(queryKey: unknown[], status = "success"): Query {
  return { queryKey, state: { status } } as unknown as Query
}

describe("shouldPersistQuery", () => {
  it("persists the weekly artifacts: persisted results and the city list", () => {
    expect(shouldPersistQuery(fakeQuery(["waste", "persisted", 57260]))).toBe(true)
    expect(shouldPersistQuery(fakeQuery(["waste-admin", "cities"]))).toBe(true)
  })

  it("does NOT persist mutable waste state (queue, accuracy, thresholds)", () => {
    // A 7-day-old copy of these would resurface pre-triage dispositions
    // and stale thresholds; only weekly artifacts are allowlisted.
    expect(shouldPersistQuery(fakeQuery(["waste", "queue", 1, "pending"]))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(["waste", "accuracy", 1]))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(["waste", "thresholds", 1]))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(["waste-admin", "reports", "sf"]))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(["waste-admin", "detectors", "sf"]))).toBe(false)
  })

  it("skips non-waste queries so the rest of the app stays memory-only", () => {
    expect(shouldPersistQuery(fakeQuery(["metrics", { category: "waste" }]))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(["stories", 1]))).toBe(false)
  })

  it("skips errored and pending queries", () => {
    expect(shouldPersistQuery(fakeQuery(["waste", "persisted", 1], "error"))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(["waste", "persisted", 1], "pending"))).toBe(false)
  })
})

describe("wastePersister (no IndexedDB in this environment)", () => {
  // jsdom has no indexedDB; every operation must degrade to a silent no-op
  // rather than throw — persistence is an optimization, never a blocker.
  const client = { clientState: {}, timestamp: 0, buster: "" } as unknown as PersistedClient

  it("persistClient / restoreClient / removeClient resolve without throwing", async () => {
    await expect(wastePersister.persistClient(client)).resolves.toBeUndefined()
    await expect(wastePersister.restoreClient()).resolves.toBeUndefined()
    await expect(wastePersister.removeClient()).resolves.toBeUndefined()
  })

  it("clearPersistedWasteCache resolves and disables later writes", async () => {
    await expect(clearPersistedWasteCache()).resolves.toBeUndefined()
    // Post-clear writes must be inert for the rest of the page lifetime.
    await expect(wastePersister.persistClient(client)).resolves.toBeUndefined()
  })
})
