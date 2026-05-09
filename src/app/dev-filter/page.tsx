"use client";

/**
 * Dev-only preview page for Filter 2.0.
 * Renders FilterPanelV2 + AddFilter + SortDropdown against mock data so the
 * panel can be verified without a logged-in feed. Not linked from the app.
 * Navigate to /dev-filter directly. Safe to delete once Filter 2.0 ships.
 */

import { useState } from "react";
import FilterPanelV2, {
  type CityInfo,
  type DistrictsForCity,
  type FilterState,
  type UserPlace,
} from "@/components/feed/FilterPanelV2";
import { AddFilter, SortDropdown } from "@/components/feed/AddFilterPopover";

const MOCK_CITIES: CityInfo[] = [
  { city_id: 1, city_name: "San Francisco", city_emoji: "🌉" },
  { city_id: 2, city_name: "Denver",        city_emoji: "🏔️" },
  { city_id: 3, city_name: "Oakland",       city_emoji: "🌳" },
  { city_id: 4, city_name: "Seattle",       city_emoji: "☔" },
  { city_id: 5, city_name: "Portland",      city_emoji: "🚲" },
  { city_id: 6, city_name: "Austin",        city_emoji: "🤠" },
  { city_id: 7, city_name: "Boston",        city_emoji: "🦞" },
  { city_id: 8, city_name: "Chicago",       city_emoji: "🌭" },
];

const MOCK_DISTRICTS: DistrictsForCity[] = [
  {
    cityId: 1,
    cityName: "San Francisco",
    districtTerm: "district",
    prefix: "D",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
];

const MOCK_PLACES: UserPlace[] = [
  { id: 1, city_id: 1, label: "Home in Sunset" },
  { id: 2, city_id: 1, label: "Work in SoMa" },
];

const TOPICS = [
  { value: "safety",   label: "Safety" },
  { value: "business", label: "Business" },
  { value: "spending", label: "Spending" },
  { value: "alert",    label: "Alerts" },
  { value: "trend",    label: "Trends" },
  { value: "justice",  label: "Justice" },
  { value: "context",  label: "Context" },
];

export default function FilterPreviewPage() {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    selectedCityIds: new Set([1, 2]),
    selectedTopics: new Set(["safety"]),
    selectedDistricts: new Map(),
    selectedPlaceId: null,
    onlyMySavedPlaces: false,
    feedOrder: "published_at",
  });
  const savedCityIds = new Set([1, 2, 3]);

  const handleApply = (next: FilterState) => setFilters(next);

  const handleToggleCityChip = (cid: number) => {
    const next = new Set(filters.selectedCityIds);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    setFilters({ ...filters, selectedCityIds: next });
  };

  const handleToggleTopicChip = (t: string) => {
    const next = new Set(filters.selectedTopics);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setFilters({ ...filters, selectedTopics: next });
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 4px" }}>
        Filter 2.0 dev preview
      </h1>
      <p style={{ color: "var(--text-tertiary)", margin: "0 0 24px", fontSize: 13 }}>
        Press <kbd>F</kbd> in real app · click below here · delete this page once shipped.
      </p>

      {/* Header row mirrors production: title on the left, filter trigger on the right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 12px 8px",
          border: "1px solid var(--border-primary)",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottom: "none",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Feed</div>
        <button
          type="button"
          aria-label="Open filters"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            border: "1px solid var(--border-primary)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            cursor: "pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter
        </button>
      </div>

      {/* Pills row sits below the header, just like production. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px 12px",
          border: "1px solid var(--border-primary)",
          borderTop: "none",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          background: "var(--bg-primary)",
          flexWrap: "wrap",
        }}
      >
        {[...filters.selectedCityIds].map((cid) => {
          const c = MOCK_CITIES.find((x) => x.city_id === cid);
          if (!c) return null;
          return (
            <span
              key={`city-${cid}`}
              onClick={() => handleToggleCityChip(cid)}
              style={pillStyle}
            >
              {c.city_emoji} {c.city_name} ×
            </span>
          );
        })}
        {[...filters.selectedTopics].map((t) => (
          <span key={`topic-${t}`} onClick={() => handleToggleTopicChip(t)} style={pillStyle}>
            {TOPICS.find((x) => x.value === t)?.label ?? t} ×
          </span>
        ))}

        <AddFilter
          cities={MOCK_CITIES}
          topics={TOPICS}
          selectedCityIds={filters.selectedCityIds}
          selectedTopics={filters.selectedTopics}
          onToggleCity={handleToggleCityChip}
          onToggleTopic={handleToggleTopicChip}
        />

        <div style={{ marginLeft: "auto" }}>
          <SortDropdown
            order={filters.feedOrder}
            onChange={(o) => setFilters({ ...filters, feedOrder: o })}
          />
        </div>
      </div>

      <FilterPanelV2
        open={open}
        onClose={() => setOpen(false)}
        allCities={MOCK_CITIES}
        savedCityIds={savedCityIds}
        filters={filters}
        onApply={handleApply}
        userPlaces={MOCK_PLACES}
        districtsPerCity={MOCK_DISTRICTS}
        onAddAddress={() => alert("Add address")}
      />
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 999,
  border: "1px solid var(--brand-primary, #ad35fa)",
  background: "var(--brand-primary-light, rgba(173, 53, 250, 0.08))",
  color: "var(--brand-primary, #ad35fa)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
