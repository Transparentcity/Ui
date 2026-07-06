import { renderHook, act } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { useWasteSelectedCity } from "./useWasteSelectedCity"

const useWasteAdminCities = vi.fn()
vi.mock("@/lib/hooks/useWasteAdmin", () => ({
  useWasteAdminCities: () => useWasteAdminCities(),
}))

vi.mock("@/lib/apiBase", () => ({
  CRM_DEFAULT_CITY_ID: 1,
}))

// Node 25 ships a built-in localStorage stub that shadows jsdom's and lacks
// working methods without --localstorage-file; give the tests a real one.
const store = new Map<string, string>()
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
})

const CITIES = [
  { id: 57260, slug: "san-francisco", name: "San Francisco", flag: "🌉", launched: true, configured: true },
  { id: 56838, slug: "chicago", name: "Chicago", flag: "🏙️", launched: true, configured: true },
  { id: 99001, slug: "oakland", name: "Oakland", flag: "🌳", launched: true, configured: false },
  { id: 99002, slug: "denver", name: "Denver", flag: "⛰️", launched: false, configured: true },
]

function mockCities(overrides: Partial<Record<string, unknown>> = {}) {
  useWasteAdminCities.mockReturnValue({
    data: CITIES,
    isLoading: false,
    isFetching: false,
    error: null,
    ...overrides,
  })
}

describe("useWasteSelectedCity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
    mockCities()
  })

  it("only exposes cities that are configured AND launched", () => {
    const { result } = renderHook(() => useWasteSelectedCity())
    expect(result.current.eligibleCities.map((c) => c.slug)).toEqual([
      "san-francisco",
      "chicago",
    ])
  })

  it("maps the backend flag field to the picker's emoji field", () => {
    const { result } = renderHook(() => useWasteSelectedCity())
    expect(result.current.eligibleCities[0].emoji).toBe("🌉")
  })

  it("defaults to the first eligible city", () => {
    const { result } = renderHook(() => useWasteSelectedCity())
    expect(result.current.selectedCityId).toBe(57260)
    expect(result.current.isCityFallback).toBe(false)
  })

  it("honors a stored city choice and persists new choices", () => {
    window.localStorage.setItem("waste:selectedCityId", "56838")
    const { result } = renderHook(() => useWasteSelectedCity())
    expect(result.current.selectedCityId).toBe(56838)

    act(() => result.current.setSelectedCityId(57260))
    expect(result.current.selectedCityId).toBe(57260)
    expect(window.localStorage.getItem("waste:selectedCityId")).toBe("57260")
  })

  it("ignores a stored id that is no longer eligible", () => {
    window.localStorage.setItem("waste:selectedCityId", "99001") // Oakland: not configured
    const { result } = renderHook(() => useWasteSelectedCity())
    expect(result.current.selectedCityId).toBe(57260)
  })

  it("falls back to the default city and flags it when the list fails to load", () => {
    mockCities({ data: undefined, error: new Error("403") })
    const { result } = renderHook(() => useWasteSelectedCity())
    expect(result.current.eligibleCities).toEqual([])
    expect(result.current.selectedCityId).toBe(1)
    expect(result.current.isCityFallback).toBe(true)
    expect(result.current.cityLoadError?.message).toBe("403")
  })
})
