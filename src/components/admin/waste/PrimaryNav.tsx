"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { BracketMark } from "./primitives/BracketMark";
import { CitySelector } from "./CitySelector";
import { getWasteCity } from "@/lib/admin/waste/cities";
import styles from "./PrimaryNav.module.css";

function avatarInitial(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) return name.trim()[0]!.toUpperCase();
  if (email && email.length > 0) return email[0]!.toUpperCase();
  return "?";
}

type NavItem = {
  id: string;
  label: string;
  href: string;
  iconPath: React.ReactNode;
};

const NAV_ITEMS: readonly NavItem[] = [
  { id: "findings", label: "Findings", href: "/admin/waste/findings",
    iconPath: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></> },
  { id: "metrics", label: "Metrics", href: "/admin/waste/metrics",
    iconPath: <path d="M3 3v18h18M7 14l3-3 4 4 5-6" /> },
  { id: "reports", label: "Reports", href: "/admin/waste/reports",
    iconPath: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></> },
];

export function PrimaryNav() {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const cityId = params?.get("city") ?? null;
  const city = getWasteCity(cityId);
  const { user, isAuthenticated, loginWithRedirect, logout } = useAuth0();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenuOpen]);
  const preservedKeys = ["city", "state"] as const;
  const preserved = new URLSearchParams();
  for (const k of preservedKeys) {
    const v = params?.get(k);
    if (v) preserved.set(k, v);
  }
  const querySuffix = preserved.toString() ? `?${preserved.toString()}` : "";

  return (
    <nav className={styles.nav} aria-label="Waste module">
      <div className={styles.brand}>
        <BracketMark size={20} color="#ad35fa" />
        <div className={styles.brandWord}>
          transparent<span className={styles.brandAccent}>.city</span>
        </div>
      </div>

      <CitySelector active={city} />

      <div className={styles.navList}>
        <div className={styles.navHeading}>Waste module</div>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const cls = `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`;
          return (
            <Link key={item.id} href={`${item.href}${querySuffix}`} className={cls} aria-current={isActive ? "page" : undefined}>
              {isActive && <span className={styles.navLinkRail} aria-hidden="true" />}
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.iconPath}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className={styles.navFooter} ref={userMenuRef}>
        {isAuthenticated ? (
          <>
            <button
              type="button"
              className={styles.userButton}
              onClick={() => setUserMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <span className={styles.userAvatar}>
                {user?.picture ? (
                  <img src={user.picture} alt="" />
                ) : (
                  avatarInitial(user?.name, user?.email)
                )}
              </span>
              <span className={styles.userText}>
                <span className={styles.userName}>{user?.name || user?.email || "Account"}</span>
              </span>
            </button>
            {userMenuOpen && (
              <div className={styles.userMenu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.userMenuItem}
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout({ logoutParams: { returnTo: window.location.origin } });
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            className={styles.userButton}
            onClick={() => loginWithRedirect()}
          >
            <span className={styles.userAvatar}>?</span>
            <span className={styles.userText}>
              <span className={styles.userName}>Sign in</span>
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
