"use client"

import type { Query } from "@tanstack/react-query"
import type { Persister, PersistedClient } from "@tanstack/react-query-persist-client"

/**
 * Cross-visit persistence for the waste module's React Query cache.
 *
 * The waste pipeline runs weekly, so last visit's data is almost always
 * still current; persisting it lets /waste paint instantly from cache while
 * React Query revalidates in the background. Only the queries in
 * shouldPersistQuery's allowlist are persisted — the rest of the app keeps
 * its memory-only cache.
 *
 * IndexedDB rather than localStorage because a full run-result payload can
 * run to multiple MB, and localStorage's ~5MB quota (shared with Auth0's
 * token cache) is too tight for that.
 */

const DB_NAME = "tc-query-cache"
const STORE_NAME = "persisted"
const KEY = "waste"

/** Bump to invalidate previously persisted caches on breaking shape changes. */
export const WASTE_CACHE_BUSTER = "waste-v1"

/**
 * Persisted entries older than this are discarded on restore. The persisted
 * waste queries must also keep an in-memory gcTime of at least this long
 * (see useLatestPersistedWasteResult / useWasteAdminCities and the
 * hydrateOptions in providers.tsx): the persister rewrites the whole entry
 * on every cache change, so a query that gets garbage-collected from memory
 * is dropped from disk on the next write.
 */
export const WASTE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days ≈ one pipeline cycle

/**
 * Exact allowlist, not a key-prefix match: mutable waste state (review
 * queue, detector accuracy, threshold config) must NOT be persisted — a
 * 7-day-old copy would resurface pre-triage dispositions and stale
 * thresholds on the next visit. Only the weekly artifacts the landing page
 * needs for an instant paint qualify.
 */
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== "success") return false
  const [root, kind] = query.queryKey
  return (
    (root === "waste" && kind === "persisted") ||
    (root === "waste-admin" && kind === "cities")
  )
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(undefined)
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) {
        open.result.createObjectStore(STORE_NAME)
      }
    }
    open.onerror = () => resolve(undefined)
    open.onblocked = () => resolve(undefined)
    open.onsuccess = () => {
      const db = open.result
      try {
        const tx = db.transaction(STORE_NAME, mode)
        const req = run(tx.objectStore(STORE_NAME))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
        tx.oncomplete = () => db.close()
        tx.onabort = () => {
          db.close()
          resolve(undefined)
        }
      } catch {
        db.close()
        resolve(undefined)
      }
    }
  })
}

// The persist client fires persistClient on EVERY query-cache event
// (added/updated/removed, for any query in the app) with no built-in
// throttling in this version, so we coalesce writes ourselves: write the
// first snapshot immediately, then at most one trailing write per window.
const WRITE_COALESCE_MS = 2_000
let pendingClient: PersistedClient | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
// Once the cache is cleared (logout), never write again in this page
// lifetime — a coalesced write racing the logout redirect would otherwise
// resurrect the data we just deleted.
let persistenceDisabled = false

function flushPendingWrite() {
  writeTimer = null
  const client = pendingClient
  pendingClient = null
  if (client && !persistenceDisabled) {
    void withStore("readwrite", (store) => store.put(client, KEY))
  }
}

/**
 * Failures (private browsing, quota, corrupted DB) resolve to undefined /
 * no-op: persistence is an optimization, never a load-blocker.
 */
export const wastePersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    if (persistenceDisabled) return
    if (writeTimer) {
      // A write went out recently; hold the newest snapshot for the
      // trailing edge.
      pendingClient = client
      return
    }
    writeTimer = setTimeout(flushPendingWrite, WRITE_COALESCE_MS)
    await withStore("readwrite", (store) => store.put(client, KEY))
  },
  restoreClient: async () => {
    return (await withStore("readonly", (store) => store.get(KEY))) as
      | PersistedClient
      | undefined
  },
  removeClient: async () => {
    await withStore("readwrite", (store) => store.delete(KEY))
  },
}

/**
 * Delete the persisted cache and stop all further writes for this page
 * lifetime. Call on logout: the IndexedDB entry outlives localStorage
 * clears, and without this the next account on the same browser profile
 * would restore the previous user's waste findings.
 */
export async function clearPersistedWasteCache(): Promise<void> {
  persistenceDisabled = true
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  pendingClient = null
  await wastePersister.removeClient()
}
