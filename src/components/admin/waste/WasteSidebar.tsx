"use client";

import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import {
  ClipboardCheck,
  BarChart3,
  FileText,
  BookOpen,
  ArrowLeft,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDbUserProfile } from "@/lib/apiClient";
import { CitySelector } from "./CitySelector";
import { getWasteCity } from "@/lib/admin/waste/cities";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: readonly NavItem[] = [
  { id: "findings", label: "Findings", href: "/admin/waste/findings", icon: ClipboardCheck },
  { id: "metrics", label: "Metrics", href: "/admin/waste/metric-values", icon: BarChart3 },
  { id: "reports", label: "Reports", href: "/admin/waste/reports", icon: FileText },
  { id: "methodology", label: "Methodology", href: "/admin/waste/metrics", icon: BookOpen },
];

function avatarInitial(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) return name.trim()[0]!.toUpperCase();
  if (email && email.length > 0) return email[0]!.toUpperCase();
  return "?";
}

export function WasteSidebar() {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const city = getWasteCity(params?.get("city"));
  const { user, isAuthenticated, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();

  // Unique mask ids so the brace logo renders correctly even if another
  // instance of the mark is mounted on the page.
  const baseId = useId();
  const logoMaskIdBl = `${baseId}-logo-mask-bl`;
  const logoMaskIdTr = `${baseId}-logo-mask-tr`;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Mirror the main-app avatar: prefer the uploaded DB picture, fall back to
  // the Auth0 picture, then to an initial. Keeps the account chrome identical
  // to what the user sees on /home.
  const [dbPicture, setDbPicture] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const profile = await getDbUserProfile(token);
        if (!cancelled && profile.picture) setDbPicture(profile.picture);
      } catch {
        // Non-fatal — fall back to the Auth0 picture / initial.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently]);
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<{ picture_url: string }>).detail?.picture_url;
      if (url) setDbPicture(url);
    };
    window.addEventListener("tc:avatar-updated", handler);
    return () => window.removeEventListener("tc:avatar-updated", handler);
  }, []);
  const pictureUrl = dbPicture || user?.picture || null;

  // Match the main-app logout exactly: clear local state then return to the
  // logged-out landing page.
  const handleLogout = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore storage access errors
    }
    void logout({ logoutParams: { returnTo: window.location.origin + "/?logged_out=true" } });
  };

  // Preserve city/state across nav clicks.
  const preserved = new URLSearchParams();
  for (const k of ["city", "state"] as const) {
    const v = params?.get(k);
    if (v) preserved.set(k, v);
  }
  const querySuffix = preserved.toString() ? `?${preserved.toString()}` : "";

  return (
    <aside className="w-[280px] min-w-[280px] h-screen bg-[var(--bg-primary)] border-r border-[var(--border-primary)] flex flex-col sticky top-0 left-0 z-50">
      {/* Brand — same corner-brace mark + wordmark as the main app sidebar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-primary)] min-h-16">
        <Link
          href="/home"
          aria-label="Transparent.city home"
          className="flex items-center gap-2.5 text-inherit no-underline flex-1 min-w-0"
        >
          <span className="flex items-center w-[22px] h-[22px] shrink-0">
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full block"
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
                  <rect x="50" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
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
                  <rect x="-1150" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
                </mask>
              </defs>
              <rect
                className="fill-[var(--text-primary)]"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask={`url(#${logoMaskIdBl})`}
              />
              <rect
                className="fill-[var(--text-primary)]"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask={`url(#${logoMaskIdTr})`}
              />
            </svg>
          </span>
          <span className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis">
            <span className="text-[var(--text-primary)]">transparent</span>
            <span className="text-[var(--brand-primary)]">.city</span>
          </span>
        </Link>
      </div>

      {/* Eyebrow + back link */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
          Waste Module
        </span>
        <Link
          href="/home"
          className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] no-underline hover:text-[var(--brand-primary)] transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Main App
        </Link>
      </div>

      {/* City picker */}
      <CitySelector active={city} variant="panel" />

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul className="list-none m-0 p-0">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={`${item.href}${querySuffix}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-all border-l-[3px]",
                    isActive
                      ? "text-[var(--brand-primary)] font-semibold bg-[var(--bg-tertiary)] border-l-purple-600"
                      : "text-[var(--text-secondary)] font-normal bg-transparent border-l-transparent hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Account footer — mirrors the main app: avatar menu on the left,
          settings gear on the right. */}
      <div
        className="px-3 py-3 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center justify-between gap-2"
        ref={menuRef}
      >
        {isAuthenticated ? (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center justify-center p-1 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={user?.name || user?.email || "Account"}
                title={user?.name || user?.email || "Account"}
              >
                {/* Admin avatar — everyone here is admin-gated, so show the crown. */}
                <span className="relative w-9 h-9 rounded-full bg-[var(--brand-primary)] text-white text-sm font-semibold flex items-center justify-center border-2 border-[var(--brand-primary)] shadow-[0_0_0_2px_var(--bg-primary)]">
                  {pictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pictureUrl}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    avatarInitial(user?.name, user?.email)
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--bg-primary)] border border-[var(--brand-primary)] flex items-center justify-center text-[10px] leading-none">
                    👑
                  </span>
                </span>
              </button>

              {menuOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 min-w-[200px] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-lg py-1 z-50"
                  role="menu"
                >
                  <div className="px-3 py-2 border-b border-[var(--border-primary)]">
                    <span className="block text-sm text-[var(--text-primary)] truncate">
                      {user?.name || "Account"}
                    </span>
                    {user?.email && (
                      <span className="block text-xs text-[var(--text-tertiary)] truncate">
                        {user.email}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/sitemap"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-tertiary)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Sitemap
                  </Link>
                  <Link
                    href="/home"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-tertiary)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Main app
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Settings gear — opens the main-app settings, same as /home. */}
            <Link
              href="/home?email_prefs=1"
              title="Settings"
              aria-label="Settings"
              className="flex items-center justify-center w-9 h-9 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
                aria-hidden="true"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={() => loginWithRedirect()}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <LogIn className="w-4 h-4 text-[var(--text-tertiary)]" />
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}
