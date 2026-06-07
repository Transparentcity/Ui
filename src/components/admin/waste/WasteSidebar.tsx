"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
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
  const { user, isAuthenticated, loginWithRedirect, logout } = useAuth0();

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

  // Preserve city/state across nav clicks.
  const preserved = new URLSearchParams();
  for (const k of ["city", "state"] as const) {
    const v = params?.get(k);
    if (v) preserved.set(k, v);
  }
  const querySuffix = preserved.toString() ? `?${preserved.toString()}` : "";

  return (
    <aside className="w-[280px] min-w-[280px] h-screen bg-white border-r border-gray-200 flex flex-col sticky top-0 left-0 z-50">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 min-h-16">
        <Link href="/home" className="flex items-center gap-2.5 text-inherit no-underline flex-1">
          <div className="w-5 h-5 shrink-0">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="overflow-visible w-full h-full">
              <path d="M 0 45 Q 0 0, 45 0 L 50 0 L 50 8.333 L 45 8.333 Q 8.333 8.333, 8.333 45 L 8.333 50 L 0 50 Z" className="fill-gray-900" />
              <path d="M 100 55 Q 100 100, 55 100 L 50 100 L 50 91.666 L 55 91.666 Q 91.666 91.666, 91.666 55 L 91.666 50 L 100 50 Z" className="fill-gray-900" />
            </svg>
          </div>
          <div className="font-bold text-lg whitespace-nowrap">
            <span className="text-gray-900">Transparent</span>
            <span className="text-purple-600">.city</span>
          </div>
        </Link>
      </div>

      {/* Eyebrow + back link */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Waste Module
        </span>
        <Link
          href="/home"
          className="flex items-center gap-1 text-xs text-gray-500 no-underline hover:text-purple-600 transition-colors"
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
                      ? "text-purple-600 font-semibold bg-gray-100 border-l-purple-600"
                      : "text-gray-600 font-normal bg-transparent border-l-transparent hover:bg-gray-50 hover:text-gray-900",
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

      {/* Account footer */}
      <div className="px-3 py-3 border-t border-gray-200 bg-white" ref={menuRef}>
        {isAuthenticated ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors text-left"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="w-7 h-7 rounded-full bg-purple-600 text-white text-xs font-semibold flex items-center justify-center overflow-hidden shrink-0">
                {user?.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.picture} alt="" className="w-full h-full object-cover" />
                ) : (
                  avatarInitial(user?.name, user?.email)
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-900 truncate">
                  {user?.name || user?.email || "Account"}
                </span>
                <span className="block text-xs text-gray-500">Sign out</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setMenuOpen(false);
                    logout({ logoutParams: { returnTo: window.location.origin } });
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => loginWithRedirect()}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LogIn className="w-4 h-4 text-gray-400" />
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}
