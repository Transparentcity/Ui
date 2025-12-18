"use client";

import React, { useId } from "react";
import "./Loader.css";

interface LoaderProps {
  size?: "sm" | "md" | "lg";
  color?: "purple" | "blue" | "green" | "orange" | "white" | "dark";
  className?: string;
}

/**
 * TransparentCity branded loading indicator featuring the distinctive corner braces.
 * Uses a calm breathing animation with smooth, organic movement.
 */
export default function Loader({
  size = "sm",
  color = "dark",
  className = "",
}: LoaderProps) {
  const sizeClass = `tc-loader-${size}`;
  const colorClass = `loader-${color}`;

  // Generate unique mask IDs for each instance to avoid conflicts
  // Use useId() for SSR-safe ID generation that matches between server and client
  const id1 = useId();
  const id2 = useId();
  const maskIdBl = `mask-bl-${size}-${color}-${id1}`;
  const maskIdTr = `mask-tr-${size}-${color}-${id2}`;

  return (
    <div className={`tc-loader ${sizeClass} ${colorClass} ${className}`}>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Bottom-left mask */}
          <mask
            id={maskIdBl}
            x="-400"
            y="-400"
            width="1200"
            height="1200"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
            {/* Remove interior rounded rect */}
            <rect
              x="8.333"
              y="8.333"
              width="83.333"
              height="83.333"
              rx="3"
              ry="3"
              fill="black"
            />
            {/* Remove diagonal band */}
            <rect
              x="16.666"
              y="-33.333"
              width="66.666"
              height="166.666"
              fill="black"
              transform="rotate(-45 50 50)"
            />
            {/* Remove top-right half-plane */}
            <rect
              x="50"
              y="-400"
              width="1200"
              height="1200"
              fill="black"
              transform="rotate(-45 50 50)"
            />
          </mask>
          {/* Top-right mask: rotate 180° from center */}
          <mask
            id={maskIdTr}
            x="-400"
            y="-400"
            width="1200"
            height="1200"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
            <rect
              x="8.333"
              y="8.333"
              width="83.333"
              height="83.333"
              rx="3"
              ry="3"
              fill="black"
            />
            <rect
              x="16.666"
              y="-33.333"
              width="66.666"
              height="166.666"
              fill="black"
              transform="rotate(-45 50 50)"
            />
            {/* Remove bottom-left half-plane (180° rotation) */}
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
        {/* Bottom-left bracket */}
        <rect
          className="brace brace-bl"
          x="0"
          y="0"
          width="100"
          height="100"
          rx="3"
          ry="3"
          mask={`url(#${maskIdBl})`}
        />
        {/* Top-right bracket (180° rotation) */}
        <rect
          className="brace brace-tr"
          x="0"
          y="0"
          width="100"
          height="100"
          rx="3"
          ry="3"
          mask={`url(#${maskIdTr})`}
        />
      </svg>
    </div>
  );
}

