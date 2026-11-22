import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/apiBase", () => ({ getApiBaseUrl: () => "https://api.test" }))

import { approveItem, rejectItem, reporterFeedsEnabled } from "@/lib/reporterFeedLeads"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("reporterFeedsEnabled", () => {
  it("is off by default", () => {
    vi.stubEnv("NEXT_PUBLIC_REPORTER_FEEDS_ENABLED", "")
    expect(reporterFeedsEnabled()).toBe(false)
  })
  it("accepts true and 1", () => {
    vi.stubEnv("NEXT_PUBLIC_REPORTER_FEEDS_ENABLED", "true")
    expect(reporterFeedsEnabled()).toBe(true)
    vi.stubEnv("NEXT_PUBLIC_REPORTER_FEEDS_ENABLED", "1")
    expect(reporterFeedsEnabled()).toBe(true)
  })
})

describe("api calls", () => {
  it("approve posts edits with auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 4 }) })
    vi.stubGlobal("fetch", fetchMock)
    await approveItem({ Authorization: "Bearer t" }, 4, { why_you: "x" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.test/api/admin/reporter-feeds/items/4/approve")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ edits: { why_you: "x" } })
    expect(init.headers).toMatchObject({ Authorization: "Bearer t", "Content-Type": "application/json" })
  })
  it("surfaces the backend detail on errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: "Daily cap reached" }) }),
    )
    await expect(rejectItem({}, 4, "off_beat")).rejects.toThrow("Daily cap reached")
  })
})
