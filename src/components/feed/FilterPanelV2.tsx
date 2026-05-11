"use client";

/**
 * FilterPanelV2: simplified filter
 *
 * One mental model: a checked city is in your feed.
 * Sort lives at the top as a 2-button segmented control.
 * Cities and Topics are tabs to keep the panel compact.
 * Active filters appear as chips below the title for one-click removal.
 *
 * Props are compatible with the original FilterPanel so it drops into the
 * existing FeedContainer wiring with minimal changes.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./FilterPanelV2.module.css";

/* ── Shared types (re-exported so callers don't need both files) ─────── */

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
  selectedDistricts: Map<number, Set<number>>;
  selectedPlaceId: number | null;
  onlyMySavedPlaces: boolean;
  feedOrder: "for_you" | "published_at";
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Broad catalog used to label active chips. Every city the app knows about. */
  allCities: CityInfo[];
  /** Optional narrowed list used for the city-row checkboxes. Defaults to allCities. */
  filterableCities?: CityInfo[];
  savedCityIds: Set<number>;
  filters: FilterState;
  onApply: (filters: FilterState) => void;
  userPlaces: UserPlace[];
  districtsPerCity: DistrictsForCity[];
  onAddAddress: () => void;
  /** Selector used to anchor the desktop dropdown. */
  triggerSelector?: string;
}

const ALL_TOPICS: { value: string; label: string }[] = [
  { value: "safety",   label: "Safety" },
  { value: "business", label: "Business" },
  { value: "spending", label: "Spending" },
  { value: "alert",    label: "Alerts" },
  { value: "trend",    label: "Trends" },
  { value: "justice",  label: "Justice" },
  { value: "context",  label: "Context" },
];

const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  ALL_TOPICS.map((t) => [t.value, t.label]),
);

/* ── Component ─────────────────────────────────────────────────────────── */

export default function FilterPanelV2({
  open,
  onClose,
  allCities,
  filterableCities,
  savedCityIds,
  filters,
  onApply,
  userPlaces,
  districtsPerCity,
  onAddAddress,
  triggerSelector = 'button[aria-label="Open filters"]',
}: Props) {
  const cityListSource = filterableCities ?? allCities;
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<FilterState>(() => cloneState(filters));
  const [tab, setTab] = useState<"cities" | "topics">("cities");
  const [districtsExpanded, setDistrictsExpanded] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* Reset draft each time the panel opens */
  useEffect(() => {
    if (open) {
      setDraft(cloneState(filters));
      setDistrictsExpanded(false);
      if (!isDesktop) {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
      }
    }
  }, [open, isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Close if breakpoint flips while open */
  const initialIsDesktopRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!open) { initialIsDesktopRef.current = null; return; }
    if (initialIsDesktopRef.current === null) {
      initialIsDesktopRef.current = isDesktop;
      return;
    }
    if (initialIsDesktopRef.current !== isDesktop) onClose();
  }, [open, isDesktop, onClose]);

  /* Anchor + flip-up on desktop */
  useEffect(() => {
    if (!open || !isDesktop) return;
    triggerRef.current = document.querySelector<HTMLElement>(triggerSelector);
    const measure = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const el = panelRef.current;
      const spaceBelow = window.innerHeight - r.bottom;
      const panelHeight = el?.offsetHeight || 540;
      const shouldFlip = spaceBelow < panelHeight + 16 && r.top > spaceBelow;
      setFlipUp((prev) => (prev === shouldFlip ? prev : shouldFlip));
      const next = {
        top: shouldFlip ? r.top : r.bottom,
        right: window.innerWidth - r.right,
      };
      setAnchor((prev) =>
        prev && prev.top === next.top && prev.right === next.right ? prev : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      setFlipUp(false);
      setAnchor(null);
    };
  }, [open, isDesktop, triggerSelector]);

  /* Click outside to dismiss (desktop) */
  useEffect(() => {
    if (!open || !isDesktop) return;
    const handler = (e: MouseEvent) => {
      const el = panelRef.current;
      if (!el) return;
      const t = e.target as Node;
      if (el.contains(t)) return;
      const trigger = triggerRef.current ?? document.querySelector(triggerSelector);
      if (trigger && trigger.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, isDesktop, onClose, triggerSelector]);

  /* Esc to close. Apply draft on mobile, otherwise just close. */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!isDesktop) onApply(draft);
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, isDesktop, draft, onApply, onClose]);

  /* Desktop applies immediately, mobile uses Done */
  const applyMaybe = useCallback(
    (next: FilterState) => {
      setDraft(next);
      if (isDesktop) onApply(next);
    },
    [isDesktop, onApply],
  );

  const handleDone = () => {
    onApply(draft);
    onClose();
  };

  // Empty every selection. The user explicitly cleared — don't sneak the
  // followed-cities set back in. "Select my cities" is the one-click recovery.
  const clearAll = () => {
    const cleared: FilterState = {
      selectedCityIds: new Set(),
      selectedTopics: new Set(),
      selectedDistricts: new Map(),
      selectedPlaceId: null,
      onlyMySavedPlaces: false,
      feedOrder: "published_at",
    };
    applyMaybe(cleared);
  };

  // Additive: union followed cities into the current selection. Never removes
  // a non-followed city the user added by hand.
  const selectMyCities = () => {
    const next = new Set(draft.selectedCityIds);
    for (const id of savedCityIds) next.add(id);
    applyMaybe({ ...draft, selectedCityIds: next });
  };

  /* ── Derived values ───────────────────────────────────────────────── */

  const sortedCities = useMemo(() => {
    const followed = cityListSource.filter((c) => savedCityIds.has(c.city_id));
    const other = cityListSource.filter((c) => !savedCityIds.has(c.city_id));
    const byName = (a: CityInfo, b: CityInfo) => a.city_name.localeCompare(b.city_name);
    return [...followed.sort(byName), ...other.sort(byName)];
  }, [cityListSource, savedCityIds]);

  const filteredCities = sortedCities;

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];

    for (const id of draft.selectedCityIds) {
      const c = allCities.find((x) => x.city_id === id);
      // Render a fallback chip when the city isn't in allCities yet (auth flap,
      // feed error, fresh hydrate) so the user can still remove it.
      const label = c
        ? `${c.city_emoji ? `${c.city_emoji} ` : ""}${c.city_name}`
        : "City";
      chips.push({
        key: `city-${id}`,
        label,
        onRemove: () => {
          const next = new Set(draft.selectedCityIds);
          next.delete(id);
          // Drop orphan sub-filters that pointed inside this city — same
          // semantics as unchecking the row in the city list.
          let nextDistricts = draft.selectedDistricts;
          let nextPlaceId = draft.selectedPlaceId;
          if (draft.selectedDistricts.has(id)) {
            nextDistricts = new Map(
              [...draft.selectedDistricts].map(([k, v]) => [k, new Set(v)]),
            );
            nextDistricts.delete(id);
          }
          if (
            draft.selectedPlaceId !== null &&
            userPlaces.find((p) => p.id === draft.selectedPlaceId)?.city_id === id
          ) {
            nextPlaceId = null;
          }
          applyMaybe({
            ...draft,
            selectedCityIds: next,
            selectedDistricts: nextDistricts,
            selectedPlaceId: nextPlaceId,
          });
        },
      });
    }
    for (const t of draft.selectedTopics) {
      chips.push({
        key: `topic-${t}`,
        label: TOPIC_LABELS[t] ?? t,
        onRemove: () => {
          const next = new Set(draft.selectedTopics);
          next.delete(t);
          applyMaybe({ ...draft, selectedTopics: next });
        },
      });
    }
    for (const [cid, nums] of draft.selectedDistricts) {
      const dc = districtsPerCity.find((d) => d.cityId === cid);
      // Fall back to a generic "District N" label when districtsPerCity
      // hasn't loaded the city yet, so the chip is still removable.
      const prefix = dc?.prefix ?? "District ";
      for (const n of nums) {
        chips.push({
          key: `district-${cid}-${n}`,
          label: `${prefix}${n}`,
          onRemove: () => {
            const nextMap = new Map([...draft.selectedDistricts].map(([k, v]) => [k, new Set(v)]));
            const set = nextMap.get(cid);
            if (set) {
              set.delete(n);
              if (set.size === 0) nextMap.delete(cid);
            }
            applyMaybe({ ...draft, selectedDistricts: nextMap });
          },
        });
      }
    }
    if (draft.selectedPlaceId !== null) {
      const place = userPlaces.find((p) => p.id === draft.selectedPlaceId);
      // Fall back to a generic label if the saved place is no longer in the
      // user's list — chip stays removable.
      chips.push({
        key: `place-${draft.selectedPlaceId}`,
        label: place ? `Near ${place.label}` : "Near saved place",
        onRemove: () => applyMaybe({ ...draft, selectedPlaceId: null }),
      });
    }
    if (draft.onlyMySavedPlaces && draft.selectedPlaceId === null) {
      chips.push({
        key: "places-on",
        label: "Near my places",
        onRemove: () => applyMaybe({ ...draft, onlyMySavedPlaces: false }),
      });
    }
    if (draft.feedOrder !== "published_at") {
      chips.push({
        key: "sort-recommended",
        label: "Recommended",
        onRemove: () => applyMaybe({ ...draft, feedOrder: "published_at" }),
      });
    }
    return chips;
  }, [draft, allCities, districtsPerCity, userPlaces, applyMaybe]);

  // "Clear all" is enabled whenever there's anything to clear, full stop.
  // No hidden "default state" that the UI doesn't show.
  const hasAnyFilter =
    draft.selectedCityIds.size > 0 ||
    draft.selectedTopics.size > 0 ||
    draft.selectedDistricts.size > 0 ||
    draft.selectedPlaceId !== null ||
    draft.onlyMySavedPlaces ||
    draft.feedOrder !== "published_at";

  // "Select my cities" is enabled when there is at least one followed city
  // that isn't already checked.
  const canSelectMyCities = useMemo(() => {
    if (savedCityIds.size === 0) return false;
    for (const id of savedCityIds) if (!draft.selectedCityIds.has(id)) return true;
    return false;
  }, [savedCityIds, draft.selectedCityIds]);

  if (!open || !mounted) return null;

  const desktopStyle: React.CSSProperties | undefined =
    isDesktop && anchor
      ? flipUp
        ? { top: "auto", bottom: window.innerHeight - anchor.top + 8, right: anchor.right, left: "auto" }
        : { top: anchor.top + 8, right: anchor.right, bottom: "auto", left: "auto" }
      : undefined;

  /* ── Render ───────────────────────────────────────────────────────── */

  const tree = (
    <>
      <div
        className={styles.backdrop}
        onClick={() => { if (!isDesktop) onApply(draft); onClose(); }}
      />

      <div
        ref={panelRef}
        className={`${styles.panel} ${flipUp ? styles.panelFlipUp : ""}`}
        style={desktopStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Feed filters"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dragHandle}>
          <div className={styles.dragHandleBar} />
        </div>

        <div className={styles.header}>
          <h2 className={styles.title}>Filter feed</h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerClear}
              onClick={selectMyCities}
              disabled={!canSelectMyCities}
              title={
                savedCityIds.size === 0
                  ? "Follow a city first"
                  : canSelectMyCities
                    ? "Add your followed cities to the selection"
                    : "All your cities are already selected"
              }
            >
              Select my cities
            </button>
            <button
              type="button"
              className={styles.headerClear}
              onClick={clearAll}
              disabled={!hasAnyFilter}
            >
              Clear all
            </button>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className={styles.chipRow}>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.chip}
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label}`}
              >
                <span className={styles.chipLabel}>{chip.label}</span>
                <span className={styles.chipX} aria-hidden="true">&times;</span>
              </button>
            ))}
          </div>
        )}

        {/* Sort: mutually-exclusive selection. Modeled as a radiogroup so
            screen readers announce these as a sort choice, not as tabs that
            would switch a tabpanel (the original role="tablist" was wrong). */}
        <div className={styles.sortSegment} role="radiogroup" aria-label="Sort">
          <button
            type="button"
            role="radio"
            aria-checked={draft.feedOrder === "published_at"}
            className={`${styles.sortBtn} ${draft.feedOrder === "published_at" ? styles.sortBtnActive : ""}`}
            onClick={() => applyMaybe({ ...draft, feedOrder: "published_at" })}
          >
            Newest
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={draft.feedOrder === "for_you"}
            className={`${styles.sortBtn} ${draft.feedOrder === "for_you" ? styles.sortBtnActive : ""}`}
            onClick={() => applyMaybe({ ...draft, feedOrder: "for_you" })}
          >
            Recommended
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs} role="tablist" aria-label="Filter section">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cities"}
            className={`${styles.tab} ${tab === "cities" ? styles.tabActive : ""}`}
            onClick={() => setTab("cities")}
          >
            Cities
            {draft.selectedCityIds.size > 0 && (
              <span className={styles.tabCount}>{draft.selectedCityIds.size}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "topics"}
            className={`${styles.tab} ${tab === "topics" ? styles.tabActive : ""}`}
            onClick={() => setTab("topics")}
          >
            Topics
            {draft.selectedTopics.size > 0 && (
              <span className={styles.tabCount}>{draft.selectedTopics.size}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {tab === "cities" ? (
            <CitiesPane
              cities={filteredCities}
              savedCityIds={savedCityIds}
              draft={draft}
              applyMaybe={applyMaybe}
              districtsPerCity={districtsPerCity}
              districtsExpanded={districtsExpanded}
              setDistrictsExpanded={setDistrictsExpanded}
              userPlaces={userPlaces}
              onClose={onClose}
              onAddAddress={onAddAddress}
            />
          ) : (
            <TopicsPane draft={draft} applyMaybe={applyMaybe} />
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.hint} aria-hidden="true">
            <span className={styles.kbd}>F</span> open · <span className={styles.kbd}>Esc</span> close
          </span>
          <button type="button" className={styles.doneBtn} onClick={handleDone}>
            Done
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(tree, document.body);
}

/* ── Sub-panes ─────────────────────────────────────────────────────────── */

function CitiesPane({
  cities,
  savedCityIds,
  draft,
  applyMaybe,
  districtsPerCity,
  districtsExpanded,
  setDistrictsExpanded,
  userPlaces,
  onClose,
  onAddAddress,
}: {
  cities: CityInfo[];
  savedCityIds: Set<number>;
  draft: FilterState;
  applyMaybe: (next: FilterState) => void;
  districtsPerCity: DistrictsForCity[];
  districtsExpanded: boolean;
  setDistrictsExpanded: (v: boolean) => void;
  userPlaces: UserPlace[];
  onClose: () => void;
  onAddAddress: () => void;
}) {
  const toggleCity = (id: number) => {
    const next = new Set(draft.selectedCityIds);
    const removing = next.has(id);
    if (removing) next.delete(id);
    else next.add(id);

    // When removing a city, drop sub-filters that pointed inside it.
    // A dormant district set or a place-in-an-unchecked-city is dead state.
    let nextDistricts = draft.selectedDistricts;
    let nextPlaceId = draft.selectedPlaceId;
    if (removing) {
      if (draft.selectedDistricts.has(id)) {
        nextDistricts = new Map(
          [...draft.selectedDistricts].map(([k, v]) => [k, new Set(v)]),
        );
        nextDistricts.delete(id);
      }
      if (
        draft.selectedPlaceId !== null &&
        userPlaces.find((p) => p.id === draft.selectedPlaceId)?.city_id === id
      ) {
        nextPlaceId = null;
      }
    }

    applyMaybe({
      ...draft,
      selectedCityIds: next,
      selectedDistricts: nextDistricts,
      selectedPlaceId: nextPlaceId,
    });
  };

  // Additive: union followed cities into current selection. Matches the
  // header "Select my cities" so the two behave the same. Falls back to the
  // visible list when there are no follows yet.
  const selectAll = () => {
    const next = new Set(draft.selectedCityIds);
    if (savedCityIds.size > 0) {
      for (const id of savedCityIds) next.add(id);
    } else {
      for (const c of cities) next.add(c.city_id);
    }
    applyMaybe({ ...draft, selectedCityIds: next });
  };

  // Clear the city set and drop the now-orphan sub-filters with it.
  const selectNone = () => {
    applyMaybe({
      ...draft,
      selectedCityIds: new Set(),
      selectedDistricts: new Map(),
      selectedPlaceId: null,
    });
  };

  return (
    <>
      <div className={styles.quickRow}>
        <span className={styles.quickRowLabel}>
          {draft.selectedCityIds.size} of {savedCityIds.size || cities.length} selected
        </span>
        <span className={styles.quickActions}>
          <button type="button" className={styles.quickBtn} onClick={selectAll}>
            All my cities
          </button>
          <button type="button" className={styles.quickBtn} onClick={selectNone}>
            None
          </button>
        </span>
      </div>

      <div className={styles.cityList}>
        {cities.length === 0 ? (
          <div className={styles.emptyState}>
            {savedCityIds.size === 0
              ? "Your cities haven't loaded yet. If this persists, sign back in or refresh."
              : "No cities to show"}
          </div>
        ) : (
          cities.map((c) => {
            const checked = draft.selectedCityIds.has(c.city_id);
            const followed = savedCityIds.has(c.city_id);
            return (
              <button
                key={c.city_id}
                type="button"
                className={styles.cityRow}
                onClick={() => toggleCity(c.city_id)}
                aria-pressed={checked}
              >
                <span
                  className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}
                  aria-hidden="true"
                >
                  {checked ? "✓" : ""}
                </span>
                <span className={styles.cityName}>
                  {c.city_emoji ? `${c.city_emoji} ` : ""}{c.city_name}
                </span>
                {followed && <span className={styles.cityFollowedDot} aria-label="Followed" />}
              </button>
            );
          })
        )}
      </div>

      {districtsPerCity.length > 0 && (
        <div className={styles.districtsBlock}>
          <button
            type="button"
            className={styles.districtsHeader}
            onClick={() => setDistrictsExpanded(!districtsExpanded)}
          >
            <span>
              <span className={styles.districtsHeaderTitle}>Districts</span>
              {!districtsExpanded && (
                <span className={styles.districtsHeaderSummary}>
                  {summarizeDistricts(draft.selectedDistricts, districtsPerCity)}
                </span>
              )}
            </span>
            <span className={styles.districtsCaret} aria-hidden="true">
              {districtsExpanded ? "▲" : "▼"}
            </span>
          </button>

          {districtsExpanded && districtsPerCity.map((dc) => {
            const set = draft.selectedDistricts.get(dc.cityId) ?? new Set<number>();
            return (
              <div key={dc.cityId} className={styles.districtGroup}>
                {districtsPerCity.length > 1 && (
                  <p className={styles.districtGroupLabel}>{dc.cityName}</p>
                )}
                <div className={styles.districtChipGrid}>
                  <button
                    type="button"
                    className={`${styles.districtChip} ${set.size === 0 ? styles.districtChipActive : ""}`}
                    onClick={() => {
                      const next = new Map([...draft.selectedDistricts].map(([k, v]) => [k, new Set(v)]));
                      next.delete(dc.cityId);
                      applyMaybe({ ...draft, selectedDistricts: next });
                    }}
                  >
                    All {dc.districtTerm}s
                  </button>
                  {dc.numbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${styles.districtChip} ${set.has(n) ? styles.districtChipActive : ""}`}
                      onClick={() => {
                        const next = new Map([...draft.selectedDistricts].map(([k, v]) => [k, new Set(v)]));
                        const cur = next.get(dc.cityId);
                        if (cur?.has(n)) {
                          next.delete(dc.cityId);
                        } else {
                          next.set(dc.cityId, new Set([n]));
                        }
                        applyMaybe({ ...draft, selectedDistricts: next });
                      }}
                    >
                      {dc.prefix}{n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Near-my-places sits at the bottom of the city list (Cities tab only),
          flowing inline with the rest of the content rather than pinned. */}
      <div className={styles.placesInline}>
        <button
          type="button"
          className={styles.placesRowInline}
          aria-pressed={userPlaces.length > 0 ? draft.onlyMySavedPlaces : undefined}
          aria-label={
            userPlaces.length === 0
              ? "Add an address to filter by nearby stories"
              : draft.onlyMySavedPlaces
                ? "Stop filtering to stories near my saved places"
                : "Show only stories near my saved places"
          }
          onClick={() => {
            if (userPlaces.length === 0) return onAddAddress();
            applyMaybe({
              ...draft,
              onlyMySavedPlaces: !draft.onlyMySavedPlaces,
              selectedPlaceId: !draft.onlyMySavedPlaces ? draft.selectedPlaceId : null,
            });
          }}
        >
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span className={styles.placesLabel}>📍 Near my places</span>
            <span className={styles.placesSub}>
              {userPlaces.length === 0
                ? "Add an address to see nearby stories"
                : `${userPlaces.length} address${userPlaces.length === 1 ? "" : "es"} saved`}
            </span>
          </span>
          {/* Visual switch only — interactivity is on the parent button.
              Avoids the invalid nesting of an interactive element inside a button. */}
          {userPlaces.length > 0 && (
            <span
              className={`${styles.toggleSwitch} ${draft.onlyMySavedPlaces ? styles.toggleSwitchActive : ""}`}
              aria-hidden="true"
            >
              <span className={styles.toggleKnob} />
            </span>
          )}
        </button>

        {draft.onlyMySavedPlaces && userPlaces.length > 0 && (
          <div className={styles.placeOptions}>
            <button
              type="button"
              className={`${styles.placeOption} ${draft.selectedPlaceId === null ? styles.placeOptionActive : ""}`}
              onClick={() => applyMaybe({ ...draft, selectedPlaceId: null })}
            >
              <span className={`${styles.placeRadio} ${draft.selectedPlaceId === null ? styles.placeRadioActive : ""}`}>
                {draft.selectedPlaceId === null && <span className={styles.placeRadioDot} />}
              </span>
              All my places
            </button>
            {userPlaces.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.placeOption} ${draft.selectedPlaceId === p.id ? styles.placeOptionActive : ""}`}
                onClick={() => applyMaybe({ ...draft, selectedPlaceId: p.id })}
              >
                <span className={`${styles.placeRadio} ${draft.selectedPlaceId === p.id ? styles.placeRadioActive : ""}`}>
                  {draft.selectedPlaceId === p.id && <span className={styles.placeRadioDot} />}
                </span>
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={styles.addAddressBtn}
              onClick={() => { onClose(); onAddAddress(); }}
            >
              + Add another address
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function TopicsPane({
  draft,
  applyMaybe,
}: {
  draft: FilterState;
  applyMaybe: (next: FilterState) => void;
}) {
  const toggle = (value: string) => {
    const next = new Set(draft.selectedTopics);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    applyMaybe({ ...draft, selectedTopics: next });
  };
  return (
    <>
      <div className={styles.topicGrid}>
        {ALL_TOPICS.map((t) => {
          const active = draft.selectedTopics.has(t.value);
          return (
            <button
              key={t.value}
              type="button"
              className={`${styles.topicChip} ${active ? styles.topicChipActive : ""}`}
              onClick={() => toggle(t.value)}
              aria-pressed={active}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className={styles.topicHelp}>
        Pick one or more topics to narrow the feed. With nothing picked, every topic is shown.
      </p>
    </>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function cloneState(s: FilterState): FilterState {
  return {
    selectedCityIds: new Set(s.selectedCityIds),
    selectedTopics: new Set(s.selectedTopics),
    selectedDistricts: new Map([...s.selectedDistricts].map(([k, v]) => [k, new Set(v)])),
    selectedPlaceId: s.selectedPlaceId,
    onlyMySavedPlaces: s.onlyMySavedPlaces,
    feedOrder: s.feedOrder,
  };
}

function summarizeDistricts(
  selected: Map<number, Set<number>>,
  districtsPerCity: DistrictsForCity[],
): string {
  const parts: string[] = [];
  for (const dc of districtsPerCity) {
    const set = selected.get(dc.cityId);
    if (set && set.size > 0) {
      const n = [...set][0];
      const cityLabel = districtsPerCity.length > 1 ? `${dc.cityName.split(",")[0]} ` : "";
      parts.push(`${cityLabel}${dc.prefix}${n}`);
    }
  }
  return parts.length === 0 ? "All" : parts.join(", ");
}

function useIsDesktop() {
  // Lazy-initial so desktop users don't see a one-frame mobile-style flash on
  // first paint. The panel itself is gated on `mounted` (set in useEffect),
  // so this initializer never runs on the server.
  const [v, setV] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setV(mq.matches);
    const h = (e: MediaQueryListEvent) => setV(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return v;
}
