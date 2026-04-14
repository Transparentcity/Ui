"use client";

import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import type { MetricDateRange } from "@/lib/dateRange";

interface CityHeaderProps {
  emoji?: string;
  name: string;
  metricDateRange?: MetricDateRange;
  onMetricDateRangeChange?: (next: MetricDateRange) => void;
  variant?: "overlay" | "standard";
  visible?: boolean;
  showDateRange?: boolean; // Control whether to show date range in header
  /** Follow (district/official): when set, show Follow button in header */
  cityId?: number;
  selectedDistrict?: number | null;
  isFollowed?: boolean;
  followPending?: boolean;
  followerCount?: number;
  onFollowToggle?: () => void;
  showAdminIcon?: boolean;
  onAdminClick?: () => void;
  /** Optional subtitle shown after the city name (e.g. "Mayor: Daniel Lurie") */
  subtitle?: string;
}

export default function CityHeader({
  emoji,
  name,
  metricDateRange,
  onMetricDateRangeChange,
  variant = "standard",
  visible = true,
  showDateRange = true, // Default to showing date range
  cityId,
  selectedDistrict,
  isFollowed = false,
  followPending = false,
  followerCount,
  onFollowToggle,
  showAdminIcon = false,
  onAdminClick,
  subtitle,
}: CityHeaderProps) {
  const className =
    variant === "overlay"
      ? `city-header-overlay ${visible ? "visible" : "hidden"}`
      : "city-header";

  const district = selectedDistrict ?? 0;
  const districtLabel =
    district === 0 ? "citywide" : `District ${district}`;

  return (
    <div className={className}>
      <div className="city-header-left">
        {emoji && <span className="city-emoji-icon">{emoji}</span>}
        <h1 className="city-name">{name}</h1>
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
          <button
            type="button"
            className={`city-header-follow-btn ${isFollowed ? "following" : ""}`}
            onClick={onFollowToggle}
            disabled={followPending}
            title={
              isFollowed
                ? `Unfollow ${districtLabel}`
                : `Follow ${districtLabel}`
            }
            aria-label={
              isFollowed
                ? `Unfollow ${districtLabel}`
                : `Follow ${districtLabel}`
            }
          >
            {followPending ? "…" : isFollowed ? "Following" : "Follow"}
            {followerCount != null && followerCount > 0 && (
              <span className="city-header-follow-count">
                {followerCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
