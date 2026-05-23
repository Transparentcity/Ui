"use client";

import { useId } from "react";
import styles from "./landing.module.css";

type Props = {
  size?: number;
  color?: string;
  animated?: boolean;
};

/** Two-corner bracket mark, mirrors assets/favicon.svg. */
export default function BracketMark({
  size = 24,
  color = "currentColor",
  animated = false,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const blId = `bm-bl-${uid}`;
  const trId = `bm-tr-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color }}
    >
      <defs>
        <mask
          id={blId}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          x="-128"
          y="-128"
          width="384"
          height="384"
        >
          <rect x="-128" y="-128" width="384" height="384" fill="white" />
          <rect x="2.67" y="2.67" width="26.67" height="26.67" rx="1" ry="1" fill="black" />
          <rect
            x="5.33"
            y="-10.67"
            width="21.33"
            height="53.33"
            fill="black"
            transform="rotate(-45 16 16)"
          />
          <rect
            x="16"
            y="-128"
            width="384"
            height="384"
            fill="black"
            transform="rotate(-45 16 16)"
          />
        </mask>
        <mask
          id={trId}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          x="-128"
          y="-128"
          width="384"
          height="384"
        >
          <rect x="-128" y="-128" width="384" height="384" fill="white" />
          <rect x="2.67" y="2.67" width="26.67" height="26.67" rx="1" ry="1" fill="black" />
          <rect
            x="5.33"
            y="-10.67"
            width="21.33"
            height="53.33"
            fill="black"
            transform="rotate(-45 16 16)"
          />
          <rect
            x="-368"
            y="-128"
            width="384"
            height="384"
            fill="black"
            transform="rotate(-45 16 16)"
          />
        </mask>
      </defs>
      <rect
        className={animated ? styles.braceBl : undefined}
        x="0"
        y="0"
        width="32"
        height="32"
        rx="1"
        ry="1"
        mask={`url(#${blId})`}
        fill="currentColor"
      />
      <rect
        className={animated ? styles.braceTr : undefined}
        x="0"
        y="0"
        width="32"
        height="32"
        rx="1"
        ry="1"
        mask={`url(#${trId})`}
        fill="currentColor"
      />
    </svg>
  );
}
