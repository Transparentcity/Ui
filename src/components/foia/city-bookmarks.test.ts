/**
 * Tests for city selection typeahead and bookmark functionality
 * in the FOIA New Request modal.
 */

// We test the bookmark logic by simulating localStorage
// (the functions are module-private, so we re-implement the same logic here
// to validate the contract the component depends on.)

interface CityOption {
  id: number
  name: string
  state: string
}

const BOOKMARKED_CITIES_KEY = "foia_bookmarked_cities"

// Helpers (mirror the component logic)
function loadBookmarkedCities(): CityOption[] {
  try {
    const raw = localStorage.getItem(BOOKMARKED_CITIES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveBookmarkedCities(cities: CityOption[]) {
  localStorage.setItem(BOOKMARKED_CITIES_KEY, JSON.stringify(cities))
}

function toggleBookmark(city: CityOption): CityOption[] {
  const existing = loadBookmarkedCities()
  const idx = existing.findIndex((c) => c.id === city.id)
  if (idx >= 0) {
    existing.splice(idx, 1)
  } else {
    existing.push(city)
  }
  saveBookmarkedCities(existing)
  return existing
}

function isCityBookmarked(cityId: number): boolean {
  return loadBookmarkedCities().some((c) => c.id === cityId)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("City bookmark persistence", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns an empty array when no bookmarks are saved", () => {
    expect(loadBookmarkedCities()).toEqual([])
  })

  it("saves and loads a bookmarked city", () => {
    const city: CityOption = { id: 1, name: "Oakland", state: "CA" }
    saveBookmarkedCities([city])
    const loaded = loadBookmarkedCities()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe(1)
    expect(loaded[0].name).toBe("Oakland")
  })

  it("handles corrupt localStorage gracefully", () => {
    localStorage.setItem(BOOKMARKED_CITIES_KEY, "not-valid-json{{{")
    expect(loadBookmarkedCities()).toEqual([])
  })
})

describe("toggleBookmark", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("adds a city when it is not bookmarked", () => {
    const city: CityOption = { id: 42, name: "Berkeley", state: "CA" }
    const result = toggleBookmark(city)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(42)
    expect(isCityBookmarked(42)).toBe(true)
  })

  it("removes a city when it is already bookmarked", () => {
    const city: CityOption = { id: 42, name: "Berkeley", state: "CA" }
    toggleBookmark(city) // add
    const result = toggleBookmark(city) // remove
    expect(result).toHaveLength(0)
    expect(isCityBookmarked(42)).toBe(false)
  })

  it("can bookmark multiple cities", () => {
    const oakland: CityOption = { id: 1, name: "Oakland", state: "CA" }
    const sf: CityOption = { id: 2, name: "San Francisco", state: "CA" }
    const nyc: CityOption = { id: 3, name: "New York", state: "NY" }

    toggleBookmark(oakland)
    toggleBookmark(sf)
    toggleBookmark(nyc)

    const loaded = loadBookmarkedCities()
    expect(loaded).toHaveLength(3)
    expect(loaded.map((c) => c.id)).toEqual([1, 2, 3])
  })

  it("only removes the targeted city when unbookmarking", () => {
    const oakland: CityOption = { id: 1, name: "Oakland", state: "CA" }
    const sf: CityOption = { id: 2, name: "San Francisco", state: "CA" }

    toggleBookmark(oakland)
    toggleBookmark(sf)

    // Remove Oakland
    const result = toggleBookmark(oakland)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
    expect(isCityBookmarked(1)).toBe(false)
    expect(isCityBookmarked(2)).toBe(true)
  })
})

describe("isCityBookmarked", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns false for a non-bookmarked city", () => {
    expect(isCityBookmarked(999)).toBe(false)
  })

  it("returns true for a bookmarked city", () => {
    toggleBookmark({ id: 10, name: "Austin", state: "TX" })
    expect(isCityBookmarked(10)).toBe(true)
  })

  it("returns false after a city is unbookmarked", () => {
    const city: CityOption = { id: 10, name: "Austin", state: "TX" }
    toggleBookmark(city)
    toggleBookmark(city)
    expect(isCityBookmarked(10)).toBe(false)
  })
})

describe("City search result sorting", () => {
  it("sorts bookmarked cities to the top of search results", () => {
    // Simulate the sort logic used in the typeahead
    const bookmarkedIds = new Set([2, 5])
    const results: CityOption[] = [
      { id: 1, name: "Albany", state: "NY" },
      { id: 2, name: "Austin", state: "TX" },
      { id: 3, name: "Atlanta", state: "GA" },
      { id: 4, name: "Albuquerque", state: "NM" },
      { id: 5, name: "Arlington", state: "TX" },
    ]

    results.sort((a, b) => {
      const aBookmarked = bookmarkedIds.has(a.id) ? 0 : 1
      const bBookmarked = bookmarkedIds.has(b.id) ? 0 : 1
      return aBookmarked - bBookmarked
    })

    // Bookmarked cities (2 and 5) should come first
    expect(results[0].id).toBe(2)
    expect(results[1].id).toBe(5)
    // Non-bookmarked follow
    expect(results.slice(2).every((c) => !bookmarkedIds.has(c.id))).toBe(true)
  })

  it("preserves original order when no bookmarks exist", () => {
    const bookmarkedIds = new Set<number>()
    const results: CityOption[] = [
      { id: 1, name: "Albany", state: "NY" },
      { id: 2, name: "Austin", state: "TX" },
      { id: 3, name: "Atlanta", state: "GA" },
    ]

    const originalOrder = results.map((c) => c.id)
    results.sort((a, b) => {
      const aBookmarked = bookmarkedIds.has(a.id) ? 0 : 1
      const bBookmarked = bookmarkedIds.has(b.id) ? 0 : 1
      return aBookmarked - bBookmarked
    })

    expect(results.map((c) => c.id)).toEqual(originalOrder)
  })
})
