"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { formatLeaderName } from "@/lib/utils";

interface Leader {
  name: string;
  title: string;
  district: number | null;
}

interface HeroDistrictSelectorProps {
  slug: string;
  districts: number[];
  mayorName?: string;
  leaders?: Leader[];
}

export default function HeroDistrictSelector({
  slug,
  districts,
  mayorName,
  leaders = [],
}: HeroDistrictSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Total options: citywide + districts
  const optionCount = districts.length + 1;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const options = listRef.current?.querySelectorAll<HTMLLIElement>(
      '[role="option"]'
    );
    options?.[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  const selectOption = useCallback(
    (index: number) => {
      setOpen(false);
      buttonRef.current?.focus();
      if (index === 0) {
        router.push(`/c/${slug}`);
      } else {
        router.push(`/c/${slug}/district/${districts[index - 1]}`);
      }
    },
    [router, slug, districts]
  );

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => (i + 1) % optionCount);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => (i - 1 + optionCount) % optionCount);
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(optionCount - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < optionCount) {
            selectOption(focusedIndex);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          buttonRef.current?.focus();
          break;
        case "Tab":
          setOpen(false);
          break;
      }
    },
    [optionCount, focusedIndex, selectOption]
  );

  const mayorLabel = mayorName ? `Mayor: ${formatLeaderName(mayorName)}` : "Citywide";

  // Build a map from district number to leader name
  const leaderByDistrict = new Map<number, string>();
  for (const l of leaders) {
    if (l.district != null && l.district > 0) {
      leaderByDistrict.set(l.district, formatLeaderName(l.name));
    }
  }

  return (
    <div className="hero-district-selector" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="hero-district-selector-btn"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{mayorLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`hero-district-chevron ${open ? "open" : ""}`}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && districts.length > 0 && (
        <ul
          ref={listRef}
          className="hero-district-selector-menu"
          role="listbox"
          onKeyDown={handleListKeyDown}
        >
          <li
            role="option"
            aria-selected={focusedIndex === 0}
            tabIndex={focusedIndex === 0 ? 0 : -1}
            className="hero-district-selector-option"
            onClick={() => selectOption(0)}
          >
            <span className="hero-district-selector-district">{mayorLabel}</span>
          </li>
          {districts.map((d, i) => {
            const leaderName = leaderByDistrict.get(d);
            const optIndex = i + 1;
            return (
              <li
                key={d}
                role="option"
                aria-selected={focusedIndex === optIndex}
                tabIndex={focusedIndex === optIndex ? 0 : -1}
                className="hero-district-selector-option"
                onClick={() => selectOption(optIndex)}
              >
                <span className="hero-district-selector-district">District {d}</span>
                {leaderName && (
                  <span className="hero-district-selector-leader">{leaderName}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
