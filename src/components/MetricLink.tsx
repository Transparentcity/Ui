"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface MetricLinkProps {
  metricId: number;
  metricKey?: string;
  citySlug: string;
  children: ReactNode;
  className?: string;
  prefetch?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  mode?: "modal" | "page"; // "modal" opens in-app modal, "page" navigates to page
  onModalOpen?: (metricId: number, district?: number | null) => void; // Callback when mode="modal"
  district?: number | null; // District to filter by (null/0 = citywide)
  style?: React.CSSProperties;
}

/**
 * Reusable component for linking to metric detail pages.
 * Can open in-app modal or navigate to public page.
 */
export function MetricLink({
  metricId,
  metricKey,
  citySlug,
  children,
  className,
  prefetch = true,
  onClick,
  mode = "modal", // Default to modal for in-app links
  onModalOpen,
  district,
  style,
  ...props
}: MetricLinkProps) {
  const metricPath = metricKey ? metricKey : String(metricId);
  const districtParam = district !== null && district !== undefined && district > 0 ? `?district=${district}` : "";
  const href = `/c/${citySlug}/metrics/${metricPath}${districtParam}`;
  
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
      return;
    }

    if (mode === "modal" && onModalOpen) {
      e.preventDefault();
      e.stopPropagation();
      onModalOpen(metricId, district);
    }
    // If mode is "page" or no onModalOpen, let Link handle navigation
  };

  // If mode is modal but no handler provided, fall back to page navigation
  if (mode === "modal" && !onModalOpen) {
    return (
      <Link
        href={href}
        prefetch={prefetch}
        className={className}
        onClick={handleClick}
        style={style}
        {...props}
      >
        {children}
      </Link>
    );
  }

  // For modal mode with handler, render as span (not button) to allow nesting inside other buttons
  if (mode === "modal" && onModalOpen) {
    return (
      <span
        role="button"
        tabIndex={0}
        className={className}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent);
          }
        }}
        style={{ 
          ...style, 
          cursor: "pointer", 
        }}
        {...(props as React.HTMLAttributes<HTMLSpanElement>)}
      >
        {children}
      </span>
    );
  }

  // Default: page navigation
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={className}
      onClick={handleClick}
      style={style}
      {...props}
    >
      {children}
    </Link>
  );
}

interface MetricLinkInlineProps {
  metricId: number;
  citySlug: string;
  metricName: string;
  className?: string;
}

/**
 * Compact inline variant for text mentions of metrics.
 * Includes a visual indicator (→) to show it's a link.
 */
export function MetricLinkInline({
  metricId,
  citySlug,
  metricName,
  className,
}: MetricLinkInlineProps) {
  return (
    <MetricLink
      metricId={metricId}
      citySlug={citySlug}
      className={className || "metric-link-inline"}
      prefetch={true}
    >
      {metricName} <span className="link-indicator">→</span>
    </MetricLink>
  );
}
