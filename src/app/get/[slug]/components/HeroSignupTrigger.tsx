"use client";

import { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  useGetLandingSignup,
  type GetLandingSignupOptions,
} from "./useGetLandingSignup";

type Props = GetLandingSignupOptions & {
  children: ReactNode;
  className?: string;
  /**
   * Accessible label announced to screen readers. When provided, the
   * wrapper is treated as a button (role/tabIndex/keyboard handler).
   */
  ariaLabel?: string;
};

/**
 * Wrap non-form regions of the /get landing hero so clicks open Auth0 signup.
 * Interactive descendants (links, buttons, the email form) keep their own behavior.
 */
export default function HeroSignupTrigger({
  children,
  className,
  ariaLabel,
  ...signupOptions
}: Props) {
  const { triggerSignup } = useGetLandingSignup(signupOptions);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, textarea, select, label, form")) {
      return;
    }
    void triggerSignup();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ariaLabel) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void triggerSignup();
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
