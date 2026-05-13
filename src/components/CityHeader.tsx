"use client";

import { useState, useRef, useEffect } from "react";
import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import FollowButton from "@/components/FollowButton";
import type { MetricDateRange } from "@/lib/dateRange";

interface FollowedCity {
  id: number;
  display_name: string;
  emoji?: string | null;
}

interface CityHeaderProps {
  emoji?: string;
  name: string;
  metricDateRange?: MetricDateRange;
  onMetricDateRangeChange?: (next: MetricDateRange) => void;
  variant?: "overlay" | "standard";
  visible?: boolean;
  showDateRange?: boolean;
  /** Follow (district/official): when set, show Follow button in header */
  cityId?: number;
  /** Label before district number in follow scope (e.g. Ward, District). */
  districtUnitLabel?: string;
  selectedDistrict?: number | null;
  isFollowed?: boolean;
  followPending?: boolean;
  followerCount?: number;
  onFollowToggle?: () => void;
  showAdminIcon?: boolean;
  onAdminClick?: () => void;
  /** Optional subtitle shown after the city name (e.g. "Mayor: Daniel Lurie") */
  subtitle?: string;
  /** Followed cities to show in the city switcher dropdown (should exclude the current city). */
  followedCities?: FollowedCity[];
  /** Called when user selects a different city from the dropdown. */
  onCityChange?: (cityId: number) => void;
}

export default function CityHeader({
  emoji,
  name,
  metricDateRange,
  onMetricDateRangeChange,
  variant = "standard",
  visible = true,
  showDateRange = true,
  cityId,
  districtUnitLabel = "District",
  selectedDistrict,
  isFollowed = false,
  followPending = false,
  followerCount,
  onFollowToggle,
  showAdminIcon = false,
  onAdminClick,
  subtitle,
  followedCities,
  onCityChange,
}: CityHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasSwitcher = (followedCities?.length ?? 0) > 0 && onCityChange != null;

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const className =
    variant === "overlay"
      ? `city-header-overlay ${visible ? "visible" : "hidden"}`
      : "city-header";

  const district = selectedDistrict ?? 0;
  const districtLabel =
    district === 0 ? "citywide" : `${districtUnitLabel} ${district}`;

  return (
    <div className={className}>
      <div className="city-header-left">
        {emoji && <span className="city-emoji-icon">{emoji}</span>}
        {hasSwitcher ? (
          <div className="city-name-switcher" ref={dropdownRef}>
            <button
              type="button"
              className="city-name-switcher-btn"
              onClick={() => setDropdownOpen((o) => !o)}
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
            >
              <span className="city-name">{name}</span>
              <svg
                className={`city-name-switcher-chevron${dropdownOpen ? " open" : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {dropdownOpen && (
              <ul className="city-name-switcher-dropdown" role="listbox" aria-label="Switch city">
                {followedCities!.map((city) => (
                  <li key={city.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="city-name-switcher-option"
                      onClick={() => {
                        setDropdownOpen(false);
                        onCityChange!(city.id);
                      }}
                    >
                      {city.emoji && <span className="city-name-switcher-emoji">{city.emoji}</span>}
                      <span>{city.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <h1 className="city-name">{name}</h1>
        )}
        {subtitle && (
          <span className="city-header-subtitle">{subtitle}</span>
        )}
        {showAdminIcon && onAdminClick && (
          <button
            type="button"
            className="city-header-admin-btn"
            onClick={onAdminClick}
            title="City data admin"
            aria-label="Open city data admin"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        )}
        {showDateRange && metricDateRange && onMetricDateRangeChange ? (
          <MetricDateRangeSelector
            value={metricDateRange}
            onChange={onMetricDateRangeChange}
          />
        ) : null}
      </div>
      <div className="city-header-right">
        {cityId != null && onFollowToggle != null && (
          <FollowButton
            following={isFollowed}
            loading={followPending}
            count={followerCount}
            size="compact"
            onClick={onFollowToggle}
            label={isFollowed ? "Following" : undefined}
            entityLabel={districtLabel}
          />
        )}
      </div>
    </div>
  );
}
