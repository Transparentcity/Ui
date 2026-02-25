"use client";

import Link from "next/link";

type Props = {
  className?: string;
  style?: React.CSSProperties;
  /** Optional size: compact for inline, default for standalone. */
  size?: "default" | "compact";
  /** When set with district, link goes to /claim?city_id=&district= so the claim form opens for this official. */
  cityId?: number;
  /** District number (0 = mayor/at-large). Pass with cityId for context-aware claim flow. */
  district?: number;
};

/**
 * Secondary CTA for public officials: purple outline, "Claim my page".
 * Use anywhere we show elected-official context (district list, district page).
 * When cityId and district are passed, the claim page shows a single form for that official.
 */
export default function ClaimMyPageButton({ className, style, size = "default", cityId, district }: Props) {
  const isCompact = size === "compact";
  const href =
    cityId != null && district != null
      ? `/claim?city_id=${cityId}&district=${district}`
      : "/claim";
  return (
    <Link
      href={href}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: isCompact ? "4px 10px" : "6px 14px",
        fontSize: isCompact ? 12 : 13,
        fontWeight: 500,
        color: "var(--brand-primary, #ad35fa)",
        background: "transparent",
        border: "1px solid var(--brand-primary, #ad35fa)",
        borderRadius: 6,
        textDecoration: "none",
        cursor: "pointer",
        ...style,
      }}
    >
      Claim my page
    </Link>
  );
}
