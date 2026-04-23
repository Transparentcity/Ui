"use client";

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import styles from "./FilterPanel.module.css";
import { searchPublicCities, type PublicCitySearchResult } from "@/lib/publicApiClient";

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface CityInfo {
  city_id: number;
  city_name: string;
  city_emoji?: string;
  district?: number;
  district_term?: string;
}

export interface UserPlace {
  id: number;
  city_id: number;
  label: string;
}

export interface DistrictsForCity {
  cityId: number;
  cityName: string;
  districtTerm: string;
  prefix: string;
  numbers: number[];
}

export interface FilterState {
  selectedCityIds: Set<number>;
  selectedTopics: Set<string>;
  selectedDistricts: Map<number, Set<number>>; // cityId → district numbers
  selectedPlaceId: number | null;
  onlyMySavedPlaces: boolean;
  feedOrder: "for_you" | "published_at";
}

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  /** All cities that have feed stories */
  allCities: CityInfo[];
  /** Cities the user follows (saved) */
  savedCityIds: Set<number>;
  /** Whether the current viewer is signed in (controls follow checkbox) */
  isAuthenticated: boolean;
  /** Current filter state */
  filters: FilterState;
  /** Apply filter changes */
  onApply: (filters: FilterState) => void;
  /** Follow/unfollow a city (save only, no feed change) */
  onToggleFollow: (cityId: number) => void;
  /** User's saved places */
  userPlaces: UserPlace[];
  /** Districts available per city */
  districtsPerCity: DistrictsForCity[];
  /** Open the add-address modal */
  onAddAddress: () => void;
}

/* ── Topic definitions ────────────────────────────────────────────────────── */

const ALL_TOPICS = [
  { value: "safety", label: "Safety" },
  { value: "business", label: "Business" },
  { value: "spending", label: "Spending" },
  { value: "alert", label: "Alerts" },
  { value: "trend", label: "Trends" },
  { value: "justice", label: "Justice" },
  { value: "context", label: "Context" },
] as const;

/* ── Component ────────────────────────────────────────────────────────────── */

export default function FilterPanel({
  open,
  onClose,
  allCities,
  savedCityIds,
  isAuthenticated,
  filters,
  onApply,
  onToggleFollow,
  userPlaces,
  districtsPerCity,
  onAddAddress,
}: FilterPanelProps) {
  // Draft state (applied on "Apply" for mobile, immediately on desktop)
  const [draft, setDraft] = useState<FilterState>({ ...filters });
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement>(null);

  // On desktop, the panel is absolutely positioned below the filter trigger.
  // A static max-height: 80vh can extend below the viewport when the trigger
  // is near the top of the page, clipping the bottom of the list off-screen.
  // Measure the panel's top position and cap max-height to fit the visible area.
  useLayoutEffect(() => {
    if (!open || !isDesktop) return;
    const el = panelRef.current;
    if (!el) return;

    const updateMaxHeight = () => {
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - 16; // 16px bottom margin
      el.style.setProperty("--panel-max-h", `${Math.max(available, 200)}px`);
    };

    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    window.addEventListener("scroll", updateMaxHeight, { passive: true });
    return () => {
      window.removeEventListener("resize", updateMaxHeight);
      window.removeEventListener("scroll", updateMaxHeight);
    };
  }, [open, isDesktop]);

  // Reset draft when panel opens + lock body scroll on mobile
  useEffect(() => {
    if (open) {
      setDraft({
        ...filters,
        selectedCityIds: new Set(filters.selectedCityIds),
        selectedTopics: new Set(filters.selectedTopics),
        selectedDistricts: new Map(
          [...filters.selectedDistricts].map(([k, v]) => [k, new Set(v)])
        ),
      });
      // Prevent body scroll behind the panel on mobile
      if (!isDesktop) {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
      }
    }
  }, [open, isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps

  // On desktop, auto-apply changes
  const applyIfDesktop = useCallback(
    (nextDraft: FilterState) => {
      setDraft(nextDraft);
      if (isDesktop) onApply(nextDraft);
    },
    [isDesktop, onApply],
  );

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — on mobile, apply draft before closing so selections aren't lost */}
      <div className={styles.backdrop} onClick={() => { if (!isDesktop) onApply(draft); onClose(); }} />

      {/* Panel */}
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Feed filters"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className={styles.dragHandle}>
          <div className={styles.dragHandleBar} />
        </div>

        {/* Panel header with clear + done buttons */}
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Filters</span>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.clearFiltersBtn}
              onClick={() => {
                const cleared: FilterState = {
                  selectedCityIds: new Set(),
                  selectedTopics: new Set(),
                  selectedDistricts: new Map(),
                  selectedPlaceId: null,
                  onlyMySavedPlaces: false,
                  feedOrder: "published_at",
                };
                applyIfDesktop(cleared);
              }}
            >
              Clear filters
            </button>
            <button
              type="button"
              className={styles.doneBtn}
              onClick={handleApply}
            >
              Done
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={styles.content}>
          {/* Cities */}
          <CitiesSection
            allCities={allCities}
            savedCityIds={savedCityIds}
            isAuthenticated={isAuthenticated}
            selected={draft.selectedCityIds}
            onChange={(ids) =>
              applyIfDesktop({
                ...draft,
                selectedCityIds: ids,
                // Selecting a city overrides "My Places" — keep UI and effective state aligned.
                onlyMySavedPlaces: ids.size > 0 ? false : draft.onlyMySavedPlaces,
                selectedPlaceId: ids.size > 0 ? null : draft.selectedPlaceId,
              })
            }
            onToggleFollow={onToggleFollow}
          />

          {/* Topics */}
          <TopicsSection
            selected={draft.selectedTopics}
            onChange={(topics) => applyIfDesktop({ ...draft, selectedTopics: topics })}
          />

          {/* My Places */}
          <MyPlacesSection
            userPlaces={userPlaces}
            active={draft.onlyMySavedPlaces}
            selectedPlaceId={draft.selectedPlaceId}
            onToggle={(active) =>
              applyIfDesktop({
                ...draft,
                onlyMySavedPlaces: active,
                selectedPlaceId: active ? draft.selectedPlaceId : null,
                // Enabling "My Places" clears city checkboxes so the UI reflects what the feed actually shows.
                selectedCityIds: active ? new Set() : draft.selectedCityIds,
              })
            }
            onSelectPlace={(placeId) =>
              applyIfDesktop({
                ...draft,
                selectedPlaceId: placeId,
                onlyMySavedPlaces: true,
                selectedCityIds: new Set(),
              })
            }
            onAddAddress={() => {
              onClose();
              onAddAddress();
            }}
          />

          {/* Districts */}
          {districtsPerCity.length > 0 && (
            <DistrictsSection
              districtsPerCity={districtsPerCity}
              selected={draft.selectedDistricts}
              onChange={(districts) =>
                applyIfDesktop({ ...draft, selectedDistricts: districts })
              }
            />
          )}

          {/* Sort */}
          <SortSection
            order={draft.feedOrder}
            onChange={(order) => applyIfDesktop({ ...draft, feedOrder: order })}
          />
        </div>

        {/* Mobile apply button */}
        <div className={styles.applyBar}>
          <button type="button" className={styles.applyBtn} onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Hook: detect desktop ─────────────────────────────────────────────────── */

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/* ── Cities Section ───────────────────────────────────────────────────────── */

function CitiesSection({
  allCities,
  savedCityIds,
  isAuthenticated,
  selected,
  onChange,
  onToggleFollow,
}: {
  allCities: CityInfo[];
  savedCityIds: Set<number>;
  isAuthenticated: boolean;
  selected: Set<number>;
  onChange: (ids: Set<number>) => void;
  onToggleFollow: (cityId: number) => void;
}) {
  const [typeahead, setTypeahead] = useState("");
  const [suggestions, setSuggestions] = useState<PublicCitySearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [justFollowedName, setJustFollowedName] = useState<string | null>(null);
  const typeaheadRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  const { followed, other } = useMemo(() => ({
    followed: allCities.filter((c) => savedCityIds.has(c.city_id)),
    other: allCities.filter((c) => !savedCityIds.has(c.city_id)),
  }), [allCities, savedCityIds]);

  const panelIds = useMemo(
    () => new Set(allCities.map((c) => c.city_id)),
    [allCities],
  );

  const handleTypeaheadChange = (value: string) => {
    setTypeahead(value);
    setShowSuggestions(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const q = value.trim();
    if (q.length < 2) { setSuggestions([]); setSearching(false); return; }
    setSearching(true);
    const id = ++reqIdRef.current;
    searchTimeoutRef.current = setTimeout(() => {
      searchPublicCities(q, 10).then((results) => {
        if (id !== reqIdRef.current) return;
        setSuggestions(Array.isArray(results) ? results : []);
        setSearching(false);
      }).catch(() => { if (id === reqIdRef.current) setSearching(false); });
    }, 250);
  };

  const handleFollowFromTypeahead = (city: PublicCitySearchResult) => {
    if (savedCityIds.has(city.id)) return;
    onToggleFollow(city.id);
    // Also add to the filter draft so the user sees the city in the feed right away.
    const next = new Set(selected);
    next.add(city.id);
    onChange(next);
    setTypeahead("");
    setSuggestions([]);
    setShowSuggestions(false);
    setJustFollowedName(city.display_name);
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    confirmTimeoutRef.current = setTimeout(() => setJustFollowedName(null), 3500);
  };

  // Independent controls: checkbox toggles follow state, button toggles feed membership.
  const toggleFeed = (cityId: number) => {
    const next = new Set(selected);
    if (next.has(cityId)) next.delete(cityId);
    else next.add(cityId);
    onChange(next);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (typeaheadRef.current && !typeaheadRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      reqIdRef.current++;
    };
  }, []);

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Cities</h3>
      {followed.length > 0 && (
        <div className={styles.cityGroup}>
          <p className={styles.cityGroupLabel}>Your cities</p>
          {followed.map((c) => (
            <CityRow
              key={c.city_id}
              city={c}
              followed
              inFeed={savedCityIds.has(c.city_id) || selected.has(c.city_id)}
              showFollowCheckbox={isAuthenticated}
              onToggleFollow={() => onToggleFollow(c.city_id)}
              onToggleFeed={() => toggleFeed(c.city_id)}
            />
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className={styles.cityGroup}>
          <p className={styles.cityGroupLabel}>All cities</p>
          {other.map((c) => (
            <CityRow
              key={c.city_id}
              city={c}
              followed={false}
              inFeed={savedCityIds.has(c.city_id) || selected.has(c.city_id)}
              showFollowCheckbox={isAuthenticated}
              onToggleFollow={() => onToggleFollow(c.city_id)}
              onToggleFeed={() => toggleFeed(c.city_id)}
            />
          ))}
        </div>
      )}

      <div className={styles.citySearchWrap} ref={typeaheadRef}>
        <input
          type="text"
          placeholder="Search for more cities…"
          value={typeahead}
          onChange={(e) => handleTypeaheadChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          className={styles.citySearchInput}
          autoComplete="off"
        />
        {showSuggestions && searching && typeahead.trim().length >= 2 && (
          <ul className={styles.cityTypeaheadList}>
            <li className={styles.cityTypeaheadSearching}>Searching…</li>
          </ul>
        )}
        {showSuggestions && !searching && typeahead.trim().length >= 2 && suggestions.length === 0 && (
          <ul className={styles.cityTypeaheadList}>
            <li className={styles.cityTypeaheadSearching}>No cities found</li>
          </ul>
        )}
        {showSuggestions && !searching && suggestions.length > 0 && (
          <ul className={styles.cityTypeaheadList}>
            {suggestions.map((c) => {
              const isFollowed = savedCityIds.has(c.id) || panelIds.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={styles.cityTypeaheadItem}
                    disabled={isFollowed}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFollowFromTypeahead(c);
                    }}
                  >
                    <span className={styles.cityTypeaheadName}>
                      {c.emoji ? `${c.emoji} ` : ""}{c.display_name}
                    </span>
                    {isFollowed ? (
                      <span className={styles.cityTypeaheadFollowing}>Following</span>
                    ) : (
                      <span className={styles.cityTypeaheadFollow}>Follow</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {justFollowedName && (
          <div className={styles.citySearchConfirm} role="status" aria-live="polite">
            <span aria-hidden>✓</span>
            <span>{justFollowedName} added to your feed</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CityRow({
  city,
  followed,
  inFeed,
  showFollowCheckbox,
  onToggleFollow,
  onToggleFeed,
}: {
  city: CityInfo;
  followed: boolean;
  inFeed: boolean;
  showFollowCheckbox: boolean;
  onToggleFollow: () => void;
  onToggleFeed: () => void;
}) {
  return (
    <div className={styles.cityItem}>
      {showFollowCheckbox && (
        <button
          type="button"
          className={styles.cityFollowCheckbox}
          onClick={onToggleFollow}
          aria-pressed={followed}
          aria-label={followed ? `Unfollow ${city.city_name}` : `Follow ${city.city_name}`}
        >
          <span
            className={`${styles.cityCheckbox} ${followed ? styles.cityCheckboxChecked : ""}`}
            aria-hidden="true"
          >
            {followed ? "✓" : ""}
          </span>
          <span className={styles.cityFollowedLabel}>
            {followed ? "Followed" : "Follow"}
          </span>
        </button>
      )}
      <span className={styles.cityName}>
        {city.city_emoji ? `${city.city_emoji} ` : ""}
        {city.city_name}
      </span>
      <button
        type="button"
        className={`${styles.cityFollowBtn} ${inFeed ? styles.cityFollowBtnFollowed : ""}`}
        onClick={onToggleFeed}
        aria-pressed={inFeed}
      >
        {inFeed ? "In feed" : "View in Feed"}
      </button>
    </div>
  );
}

/* ── Topics Section ───────────────────────────────────────────────────────── */

function TopicsSection({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (topics: Set<string>) => void;
}) {
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Topics</h3>
      <div className={styles.topicGrid}>
        {ALL_TOPICS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`${styles.topicChip} ${selected.has(t.value) ? styles.topicChipActive : ""}`}
            onClick={() => toggle(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── My Places Section ────────────────────────────────────────────────────── */

function MyPlacesSection({
  userPlaces,
  active,
  selectedPlaceId,
  onToggle,
  onSelectPlace,
  onAddAddress,
}: {
  userPlaces: UserPlace[];
  active: boolean;
  selectedPlaceId: number | null;
  onToggle: (active: boolean) => void;
  onSelectPlace: (placeId: number | null) => void;
  onAddAddress: () => void;
}) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>My Places</h3>

      {userPlaces.length > 0 ? (
        <>
          <div className={styles.myPlacesToggle} onClick={() => onToggle(!active)}>
            <span className={styles.myPlacesLabel}>Show ONLY stories near my places</span>
            <button
              type="button"
              className={`${styles.toggleSwitch} ${active ? styles.toggleSwitchActive : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(!active);
              }}
            >
              <div className={styles.toggleKnob} />
            </button>
          </div>

          {active && (
            <>
              {/* All places option */}
              <div
                className={`${styles.placeItem} ${selectedPlaceId === null ? styles.placeItemActive : ""}`}
                onClick={() => onSelectPlace(null)}
              >
                <div className={`${styles.placeRadio} ${selectedPlaceId === null ? styles.placeRadioActive : ""}`}>
                  {selectedPlaceId === null && <div className={styles.placeRadioDot} />}
                </div>
                <span>All my places</span>
              </div>

              {userPlaces.map((p) => (
                <div
                  key={p.id}
                  className={`${styles.placeItem} ${selectedPlaceId === p.id ? styles.placeItemActive : ""}`}
                  onClick={() => onSelectPlace(p.id)}
                >
                  <div className={`${styles.placeRadio} ${selectedPlaceId === p.id ? styles.placeRadioActive : ""}`}>
                    {selectedPlaceId === p.id && <div className={styles.placeRadioDot} />}
                  </div>
                  <span>📍 {p.label}</span>
                </div>
              ))}
            </>
          )}

          <button type="button" className={styles.addPlaceBtn} onClick={onAddAddress}>
            + Add another address
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 8px" }}>
            We&apos;ll show you stories about your neighborhood.
          </p>
          <button type="button" className={styles.addPlaceBtn} onClick={onAddAddress}>
            + Add your address to see nearby stories
          </button>
        </>
      )}
    </div>
  );
}

/* ── Districts Section ────────────────────────────────────────────────────── */

function DistrictsSection({
  districtsPerCity,
  selected,
  onChange,
}: {
  districtsPerCity: DistrictsForCity[];
  selected: Map<number, Set<number>>;
  onChange: (districts: Map<number, Set<number>>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Single-select: picking a district for a city replaces any prior selection
  const selectDistrict = (cityId: number, districtNum: number) => {
    const next = new Map([...selected].map(([k, v]) => [k, new Set(v)]));
    const current = next.get(cityId);
    // Toggle off if already selected
    if (current?.has(districtNum)) {
      next.delete(cityId);
    } else {
      next.set(cityId, new Set([districtNum]));
    }
    onChange(next);
    setExpanded(false); // collapse after selection
  };

  const clearCityDistricts = (cityId: number) => {
    const next = new Map([...selected].map(([k, v]) => [k, new Set(v)]));
    next.delete(cityId);
    onChange(next);
    setExpanded(false);
  };

  // Build summary text for collapsed state
  const summaryParts: string[] = [];
  for (const dc of districtsPerCity) {
    const citySet = selected.get(dc.cityId);
    if (citySet && citySet.size > 0) {
      const num = [...citySet][0];
      const cityLabel = districtsPerCity.length > 1 ? `${dc.cityName.split(",")[0]} ` : "";
      summaryParts.push(`${cityLabel}${dc.prefix}${num}`);
    }
  }
  const hasSelection = summaryParts.length > 0;
  const summaryText = hasSelection ? summaryParts.join(", ") : "None selected";

  const showCityHeaders = districtsPerCity.length > 1;

  return (
    <div className={styles.section}>
      {/* Collapsed header — tap to expand */}
      <button
        type="button"
        className={styles.districtToggleHeader}
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h3 className={styles.sectionTitle} style={{ margin: 0 }}>My District</h3>
          {!expanded && (
            <span className={styles.districtSummary}>
              {summaryText}
            </span>
          )}
        </div>
        <span className={styles.districtCaret} aria-hidden="true">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded: show district chips */}
      {expanded && districtsPerCity.map((dc) => {
        const citySelected = selected.get(dc.cityId) ?? new Set<number>();
        return (
          <div key={dc.cityId} className={styles.districtGroup}>
            {showCityHeaders && (
              <p className={styles.districtGroupLabel}>{dc.cityName}</p>
            )}
            <div className={styles.districtChipGrid}>
              <button
                type="button"
                className={`${styles.districtChip} ${citySelected.size === 0 ? styles.districtChipActive : ""}`}
                onClick={() => clearCityDistricts(dc.cityId)}
              >
                All {dc.districtTerm}s
              </button>
              {dc.numbers.map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`${styles.districtChip} ${citySelected.has(num) ? styles.districtChipActive : ""}`}
                  onClick={() => selectDistrict(dc.cityId, num)}
                >
                  {dc.prefix}{num}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Sort Section ─────────────────────────────────────────────────────────── */

function SortSection({
  order,
  onChange,
}: {
  order: "for_you" | "published_at";
  onChange: (order: "for_you" | "published_at") => void;
}) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Sort</h3>

      <div className={styles.sortOption} onClick={() => onChange("for_you")}>
        <div className={`${styles.sortRadio} ${order === "for_you" ? styles.sortRadioActive : ""}`}>
          {order === "for_you" && <div className={styles.sortRadioDot} />}
        </div>
        <div>
          <div className={styles.sortLabel}>Recommended</div>
          <div className={styles.sortDesc}>Stories ranked by your interests</div>
        </div>
      </div>

      <div className={styles.sortOption} onClick={() => onChange("published_at")}>
        <div className={`${styles.sortRadio} ${order === "published_at" ? styles.sortRadioActive : ""}`}>
          {order === "published_at" && <div className={styles.sortRadioDot} />}
        </div>
        <div>
          <div className={styles.sortLabel}>Newest first</div>
          <div className={styles.sortDesc}>Most recent stories at the top</div>
        </div>
      </div>
    </div>
  );
}
