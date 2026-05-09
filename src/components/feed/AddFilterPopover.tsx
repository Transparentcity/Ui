"use client";

/**
 * AddFilterPopover: small inline controls that live in the collapsed pills row.
 *
 * - "+ Add filter" dashed pill opens a tabbed popover (Cities | Topics) with
 *   a searchable list. Tap a row to toggle it. No need to open the full panel
 *   for everyday adjustments.
 * - "Sort: Newest ▾" pill opens a tiny menu to switch sort order.
 *
 * Controls are uncontrolled internally (own their open/close + search state),
 * but selection is owned by the parent so pills update immediately.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import styles from "./AddFilterPopover.module.css";

/**
 * Position a portaled popover relative to a trigger rect, clamped to the
 * viewport. Prefers dropping straight down from the trigger (left-aligned
 * with the trigger's left edge). Falls back to right-aligned when that
 * would overflow the right edge of the viewport. Vertically prefers below;
 * flips above when there's no room.
 */
function viewportAlignedStyle(
  triggerRect: DOMRect | null,
  preferredWidth: number,
): React.CSSProperties | undefined {
  if (typeof window === "undefined" || !triggerRect) return undefined;
  const margin = 8;
  const w = Math.min(preferredWidth, window.innerWidth - margin * 2);

  // Default: drop straight down — left edges aligned with the trigger.
  let left = triggerRect.left;
  // If that would overflow the right edge, right-align with the trigger instead.
  if (left + w > window.innerWidth - margin) {
    left = triggerRect.right - w;
  }
  // Final clamp.
  if (left < margin) left = margin;
  if (left + w > window.innerWidth - margin) left = window.innerWidth - margin - w;

  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const flipUp = spaceBelow < 240 && triggerRect.top > spaceBelow;
  const top = flipUp ? undefined : triggerRect.bottom + 6;
  const bottom = flipUp ? window.innerHeight - triggerRect.top + 6 : undefined;

  return {
    position: "fixed",
    left,
    top,
    bottom,
    width: w,
  };
}

function useTriggerAnchor(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!open || !ref.current) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = ref.current;
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, ref]);
  return rect;
}

export interface CityOption {
  city_id: number;
  city_name: string;
  city_emoji?: string;
}
export interface TopicOption { value: string; label: string }

interface AddFilterProps {
  cities: CityOption[];
  topics: TopicOption[];
  selectedCityIds: Set<number>;
  selectedTopics: Set<string>;
  onToggleCity: (cityId: number) => void;
  onToggleTopic: (topic: string) => void;
}

export function AddFilter({
  cities,
  topics,
  selectedCityIds,
  selectedTopics,
  onToggleCity,
  onToggleTopic,
}: AddFilterProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"cities" | "topics">("cities");
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRect = useTriggerAnchor(open, triggerRef);
  const popoverStyle = viewportAlignedStyle(triggerRect, 280);

  useEffect(() => {
    if (!open) return;
    // Outside-click handler — accounts for the popover being portaled, so we
    // need to check both the trigger and the portaled popover separately.
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const filteredCities = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...cities].sort((a, b) => a.city_name.localeCompare(b.city_name));
    return q ? sorted.filter((c) => c.city_name.toLowerCase().includes(q)) : sorted;
  }, [cities, search]);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? topics.filter((t) => t.label.toLowerCase().includes(q)) : topics;
  }, [topics, search]);

  const popoverContent = open && popoverStyle ? (
    <div
      ref={popoverRef}
      className={styles.popover}
      role="dialog"
      aria-label="Add filter"
      style={popoverStyle}
    >
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "cities" ? styles.tabActive : ""}`}
          onClick={() => { setTab("cities"); setSearch(""); }}
        >
          Add city
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "topics" ? styles.tabActive : ""}`}
          onClick={() => { setTab("topics"); setSearch(""); }}
        >
          Add topic
        </button>
      </div>

      <div className={styles.searchWrap}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={tab === "cities" ? "Search cities…" : "Search topics…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          autoComplete="off"
        />
      </div>

      <div className={styles.list}>
        {tab === "cities" ? (
          filteredCities.length === 0 ? (
            <div className={styles.empty}>No cities match</div>
          ) : (
            filteredCities.map((c) => {
              const checked = selectedCityIds.has(c.city_id);
              return (
                <button
                  key={c.city_id}
                  type="button"
                  className={styles.item}
                  onClick={() => onToggleCity(c.city_id)}
                >
                  <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}>
                    {checked ? "✓" : ""}
                  </span>
                  <span className={styles.itemLabel}>
                    {c.city_emoji ? `${c.city_emoji} ` : ""}{c.city_name}
                  </span>
                </button>
              );
            })
          )
        ) : (
          filteredTopics.length === 0 ? (
            <div className={styles.empty}>No topics match</div>
          ) : (
            filteredTopics.map((t) => {
              const checked = selectedTopics.has(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  className={styles.item}
                  onClick={() => onToggleTopic(t.value)}
                >
                  <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}>
                    {checked ? "✓" : ""}
                  </span>
                  <span className={styles.itemLabel}>{t.label}</span>
                </button>
              );
            })
          )
        )}
      </div>
    </div>
  ) : null;

  return (
    <span className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.addBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        + Add filter
      </button>
      {popoverContent && typeof window !== "undefined"
        ? createPortal(popoverContent, document.body)
        : null}
    </span>
  );
}

interface SortDropdownProps {
  order: "for_you" | "published_at";
  onChange: (order: "for_you" | "published_at") => void;
}

export function SortDropdown({ order, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRect = useTriggerAnchor(open, triggerRef);
  const menuStyle = viewportAlignedStyle(triggerRect, 180);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const label = order === "for_you" ? "Recommended" : "Newest";

  const menuContent = open && menuStyle ? (
    <div ref={menuRef} className={styles.sortMenu} role="menu" style={menuStyle}>
      <button
        type="button"
        role="menuitem"
        className={styles.sortMenuItem}
        onClick={() => { onChange("published_at"); setOpen(false); }}
      >
        <span className={styles.sortMenuCheck} aria-hidden="true">
          {order === "published_at" ? "✓" : ""}
        </span>
        Newest
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.sortMenuItem}
        onClick={() => { onChange("for_you"); setOpen(false); }}
      >
        <span className={styles.sortMenuCheck} aria-hidden="true">
          {order === "for_you" ? "✓" : ""}
        </span>
        Recommended
      </button>
    </div>
  ) : null;

  return (
    <span className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.sortBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Sort: {label} <span className={styles.sortCaret} aria-hidden="true">▾</span>
      </button>
      {menuContent && typeof window !== "undefined"
        ? createPortal(menuContent, document.body)
        : null}
    </span>
  );
}

export default { AddFilter, SortDropdown };
