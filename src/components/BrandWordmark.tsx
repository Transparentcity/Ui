"use client";

import { useId } from "react";
import styles from "./BrandWordmark.module.css";

interface BrandWordmarkProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * Corner-brace logomark + "transparent.city" wordmark.
 * Matches PublicNavBar / BRAND_KIT branding.
 */
export default function BrandWordmark({ className, size = "md" }: BrandWordmarkProps) {
  const uid = useId().replace(/:/g, "");
  const maskBl = `brand-wordmark-bl-${uid}`;
  const maskTr = `brand-wordmark-tr-${uid}`;

  const rootClass = [
    styles.root,
    size === "sm" ? styles.sm : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClass} aria-label="transparent.city">
      <span className={styles.logomark} aria-hidden>
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
          <defs>
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
          <rect className={styles.brace} x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${maskBl})`} />
          <rect className={styles.brace} x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${maskTr})`} />
        </svg>
      </span>
      <span className={styles.wordmark}>
        <span className={styles.plain}>transparent</span>
        <span className={styles.accent}>.city</span>
      </span>
    </span>
  );
}
