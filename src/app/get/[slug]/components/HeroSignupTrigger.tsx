"use client";

import { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { focusGetLandingHeroSignup } from "@/lib/passwordlessSignup";

type Props = {
  children: ReactNode;
  className?: string;
  /**
   * Accessible label announced to screen readers. When provided, the
   * wrapper is treated as a button (role/tabIndex/keyboard handler).
   */
  ariaLabel?: string;
};

/**
 * Wrap non-form regions of the /get landing hero so any click within them
 * scrolls the email signup field into view and focuses it. We treat this
 * as a UX convenience: real keyboard users still tab directly to the email
 * input that lives inside this hero, so we only attach role="button"
 * semantics when an explicit ariaLabel is given.
 */
export default function HeroSignupTrigger({ children, className, ariaLabel }: Props) {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    // Ignore clicks that originated from interactive descendants (links,
    // buttons, inputs, etc.) so the form keeps its own behavior.
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, textarea, select, label, form")) {
      return;
    }
    focusGetLandingHeroSignup();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ariaLabel) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusGetLandingHeroSignup();
    }
  };

  return (
    <div
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={ariaLabel ? "button" : undefined}
      tabIndex={ariaLabel ? 0 : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
