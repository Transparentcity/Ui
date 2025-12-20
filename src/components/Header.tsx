"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./Header.module.css";

interface HeaderProps {
  showCityPicker?: boolean;
  cityQuery?: string;
  onCityQueryChange?: (query: string) => void;
  cityResults?: Array<{
    id: number;
    name: string;
    display_name: string;
    emoji?: string;
  }>;
  cityLoading?: boolean;
  cityError?: string | null;
  selectedIndex?: number;
  onCitySelect?: (city: {
    id: number;
    name: string;
    display_name: string;
    emoji?: string;
  }) => void;
  onCityKeyDown?: (e: React.KeyboardEvent) => void;
  cityDropdownOpen?: boolean;
  onCityFocus?: () => void;
  onCityDropdownClose?: () => void;
}

export default function Header({
  showCityPicker = false,
  cityQuery = "",
  onCityQueryChange,
  cityResults = [],
  cityLoading = false,
  cityError = null,
  selectedIndex = -1,
  onCitySelect,
  onCityKeyDown,
  cityDropdownOpen = false,
  onCityFocus,
  onCityDropdownClose,
}: HeaderProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [signupMenuOpen, setSignupMenuOpen] = useState(false);
  const cityPickerRef = useRef<HTMLDivElement | null>(null);

  const handleLogin = async () => {
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
      },
      appState: { returnTo: "/dashboard" },
    });
  };

  const handleSignup = async (intent: "resident" | "public-servant") => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
    }

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: `/dashboard?signup=${intent}` },
    });
  };

  useEffect(() => {
    if (!showCityPicker || !cityDropdownOpen) return;

    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cityPickerRef.current && !cityPickerRef.current.contains(target)) {
        onCityDropdownClose?.();
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [showCityPicker, cityDropdownOpen, onCityDropdownClose]);

  // Generate unique IDs for logo masks to avoid conflicts
  // Use useId hook which generates stable IDs that work with SSR
  const baseId = useId();
  const logoMaskIdBl = `${baseId}-logo-mask-bl`;
  const logoMaskIdTr = `${baseId}-logo-mask-tr`;

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.headerInner}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="Transparent.city home"
          >
            <div className={styles.logoCorners}>
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id={logoMaskIdBl}
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
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
                    id={logoMaskIdTr}
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
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
                <rect
                  className={styles.brace}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask={`url(#${logoMaskIdBl})`}
                  transform="translate(23.5%, -23.5%)"
                />
                <rect
                  className={styles.brace}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask={`url(#${logoMaskIdTr})`}
                  transform="translate(-23.5%, 23.5%)"
                />
              </svg>
            </div>
            <span className={styles.brandText}>
              <span className={styles.logoTransparent}>transparent</span>
              <span className={styles.logoCity}>.city</span>
            </span>
          </Link>

          {showCityPicker && (
            <div className={styles.cityPicker} ref={cityPickerRef}>
              <input
                className={styles.cityInput}
                value={cityQuery}
                placeholder="Start with San Francisco — or search for your city…"
                onChange={(e) => {
                  onCityQueryChange?.(e.target.value);
                }}
                onFocus={onCityFocus}
                onKeyDown={onCityKeyDown}
              />

              {cityDropdownOpen && (
                <div
                  className={styles.cityDropdown}
                  role="listbox"
                  aria-label="City options"
                >
                  {cityLoading && (
                    <div
                      className={styles.cityOption}
                      role="option"
                      aria-selected={false}
                    >
                      <div>Searching…</div>
                      <div className={styles.cityMeta}>
                        Type at least 2 characters
                      </div>
                    </div>
                  )}

                  {!cityLoading && cityError && (
                    <div
                      className={styles.cityOption}
                      role="option"
                      aria-selected={false}
                    >
                      <div>City search unavailable</div>
                      <div className={styles.cityMeta}>{cityError}</div>
                    </div>
                  )}

                  {!cityLoading &&
                    !cityError &&
                    cityQuery.trim().length < 2 && (
                      <>
                        {cityResults.length ? null : (
                          <div
                            className={styles.cityOption}
                            role="option"
                            aria-selected={false}
                          >
                            <div>Start with San Francisco</div>
                            <div className={styles.cityMeta}>
                              Or search by city, state, or country
                            </div>
                          </div>
                        )}
                      </>
                    )}

                  {!cityLoading &&
                    !cityError &&
                    cityQuery.trim().length >= 2 &&
                    cityResults.map((city, idx) => (
                      <div
                        key={`${city.id}-${city.display_name}`}
                        className={styles.cityOption}
                        role="option"
                        aria-selected={idx === selectedIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onCitySelect?.(city);
                        }}
                        style={{
                          background:
                            idx === selectedIndex
                              ? "rgba(17, 24, 39, 0.05)"
                              : "transparent",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          {city.emoji ? (
                            <span aria-hidden style={{ fontSize: 18 }}>
                              {city.emoji}
                            </span>
                          ) : null}
                          <div>{city.display_name}</div>
                        </div>
                        <div className={styles.cityMeta}>Browse</div>
                      </div>
                    ))}

                  {!cityLoading &&
                    !cityError &&
                    cityQuery.trim().length < 2 &&
                    cityResults.map((city, idx) => (
                      <div
                        key={`${city.id}-${city.display_name}`}
                        className={styles.cityOption}
                        role="option"
                        aria-selected={idx === selectedIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onCitySelect?.(city);
                        }}
                        style={{
                          background:
                            idx === selectedIndex
                              ? "rgba(17, 24, 39, 0.05)"
                              : "transparent",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          {city.emoji ? (
                            <span aria-hidden style={{ fontSize: 18 }}>
                              {city.emoji}
                            </span>
                          ) : null}
                          <div>{city.display_name}</div>
                        </div>
                        <div className={styles.cityMeta}>Suggested</div>
                      </div>
                    ))}

                  {!cityLoading &&
                    !cityError &&
                    cityQuery.trim().length >= 2 &&
                    cityResults.length === 0 && (
                      <div
                        className={styles.cityOption}
                        role="option"
                        aria-selected={false}
                      >
                        <div>No cities found</div>
                        <div className={styles.cityMeta}>Try another spelling</div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          <nav className={styles.navRight} aria-label="Top navigation">
            <a
              className={styles.link}
              href="https://www.transparentsf.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Newsletter
            </a>
            <Link className={styles.link} href="/pro">
              For city staff
            </Link>

            <button
              className={styles.button}
              onClick={handleLogin}
              disabled={isLoading}
            >
              {isAuthenticated ? "Dashboard" : "Sign in"}
            </button>

            <div className={styles.menuWrap}>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => setSignupMenuOpen((v) => !v)}
                disabled={isLoading}
                aria-haspopup="menu"
                aria-expanded={signupMenuOpen}
              >
                {isAuthenticated ? "Go to dashboard" : "Sign up"}
              </button>
              {signupMenuOpen && !isAuthenticated && (
                <div
                  className={styles.menu}
                  role="menu"
                  aria-label="Sign up options"
                >
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => handleSignup("resident")}
                    disabled={isLoading}
                  >
                    <div className={styles.menuItemTitle}>I'm a resident</div>
                    <div className={styles.menuItemDesc}>
                      Follow a city, read research, and get the map view.
                    </div>
                  </button>
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => handleSignup("public-servant")}
                    disabled={isLoading}
                  >
                    <div className={styles.menuItemTitle}>
                      I'm a public servant
                    </div>
                    <div className={styles.menuItemDesc}>
                      Tools for staff: briefs, context, and operational clarity.
                    </div>
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

