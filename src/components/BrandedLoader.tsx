"use client";

import { useId } from "react";

type LoaderSize = "sm" | "md" | "lg";
type LoaderColor = "purple" | "blue" | "green" | "orange" | "white" | "dark" | "brand";

interface BrandedLoaderProps {
  size?: LoaderSize;
  color?: LoaderColor;
  className?: string;
  /** Optional label shown below the loader */
  label?: string;
  /** When true, hide from assistive tech (e.g. inside a labeled button) */
  ariaHidden?: boolean;
}

const SIZE_PX: Record<LoaderSize, number> = {
  sm: 24,
  md: 48,
  lg: 80,
};

const COLOR_MAP: Record<LoaderColor, string> = {
  purple: "var(--brand-primary)",
  blue: "#3b82f6",
  green: "var(--success)",
  orange: "var(--warning)",
  white: "#ffffff",
  dark: "#1f2937",
  brand: "var(--brand-primary, #3b82f6)",
};

/**
 * Branded loader featuring the TransparentCity bracket logo
 * with a smooth breathing animation.
 *
 * Converted from docs/loader_mockup.html into a reusable React component.
 * Each instance gets unique SVG mask IDs via useId().
 */
export default function BrandedLoader({
  size = "md",
  color = "brand",
  className,
  label,
  ariaHidden = false,
}: BrandedLoaderProps) {
  const uid = useId().replace(/:/g, "");
  const px = SIZE_PX[size];
  const fill = COLOR_MAP[color];

  const maskBl = `mask-bl-${uid}`;
  const maskTr = `mask-tr-${uid}`;

  return (
    <span
      className={className}
      aria-hidden={ariaHidden || undefined}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: label ? 12 : 0,
      }}
    >
      <span style={{ display: "block", width: px, height: px }}>
        <svg
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: "visible", display: "block", width: "100%", height: "100%" }}
          role={ariaHidden ? undefined : "img"}
          aria-label={ariaHidden ? undefined : "Loading"}
        >
          <defs>
            {/* Bottom-left mask */}
            <mask
              id={maskBl}
              x="-400"
              y="-400"
              width="1200"
              height="1200"
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
            >
              <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
              <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
              <rect
                x="16.666"
                y="-33.333"
                width="66.666"
                height="166.666"
                fill="black"
                transform="rotate(-45 50 50)"
              />
              <rect
                x="50"
                y="-400"
                width="1200"
                height="1200"
                fill="black"
                transform="rotate(-45 50 50)"
              />
            </mask>
            {/* Top-right mask */}
            <mask
              id={maskTr}
              x="-400"
              y="-400"
              width="1200"
              height="1200"
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
            >
              <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
              <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
              <rect
                x="16.666"
                y="-33.333"
                width="66.666"
                height="166.666"
                fill="black"
                transform="rotate(-45 50 50)"
              />
              <rect
                x="-1150"
                y="-400"
                width="1200"
                height="1200"
                fill="black"
                transform="rotate(-45 50 50)"
              />
            </mask>
          </defs>

          <style>{`
            @keyframes breathe-tr-${uid} {
              0%, 100% { transform: translate(0%, 0%); }
              50% { transform: translate(-23.5%, 23.5%); }
            }
            @keyframes breathe-bl-${uid} {
              0%, 100% { transform: translate(0%, 0%); }
              50% { transform: translate(23.5%, -23.5%); }
            }
            .brace-bl-${uid} {
              animation: breathe-bl-${uid} 4s ease-in-out infinite;
              transform-origin: 50% 50%;
            }
            .brace-tr-${uid} {
              animation: breathe-tr-${uid} 4s ease-in-out infinite;
              transform-origin: 50% 50%;
            }
            @media (prefers-reduced-motion: reduce) {
              .brace-bl-${uid}, .brace-tr-${uid} {
                animation: pulse-${uid} 2s ease-in-out infinite;
              }
              @keyframes pulse-${uid} {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
              }
            }
          `}</style>

          {/* Bottom-left bracket */}
          <rect
            className={`brace-bl-${uid}`}
            x="0"
            y="0"
            width="100"
            height="100"
            rx="3"
            ry="3"
            fill={fill}
            mask={`url(#${maskBl})`}
          />
          {/* Top-right bracket */}
          <rect
            className={`brace-tr-${uid}`}
            x="0"
            y="0"
            width="100"
            height="100"
            rx="3"
            ry="3"
            fill={fill}
            mask={`url(#${maskTr})`}
          />
        </svg>
      </span>
      {label && (
        <span
          style={{
            fontSize: size === "sm" ? 11 : size === "md" ? 13 : 15,
            color: "var(--text-secondary, var(--text-muted))",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
