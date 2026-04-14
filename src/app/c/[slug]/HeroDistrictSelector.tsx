"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const mayorLabel = mayorName ? `Mayor: ${mayorName}` : "Citywide";

  // Build a map from district number to leader name
  const leaderByDistrict = new Map<number, string>();
  for (const l of leaders) {
    if (l.district != null && l.district > 0) {
      leaderByDistrict.set(l.district, l.name);
    }
  }

  return (
    <div className="hero-district-selector" ref={ref}>
      <button
        type="button"
        className="hero-district-selector-btn"
        onClick={() => setOpen((v) => !v)}
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
        <ul className="hero-district-selector-menu" role="listbox">
          {districts.map((d) => {
            const leaderName = leaderByDistrict.get(d);
            return (
              <li key={d}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="hero-district-selector-option"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/c/${slug}/district/${d}`);
                  }}
                >
                  <span className="hero-district-selector-district">District {d}</span>
                  {leaderName && (
                    <span className="hero-district-selector-leader">{leaderName}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
