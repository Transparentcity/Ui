"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FileText,
  MessageSquareMore,
  Database,
  Building2,
  FileStack,
  CheckSquare,
  ArrowLeft,
} from "lucide-react"

const navItems = [
  { label: "Dashboard", href: "/foia", icon: LayoutDashboard },
  { label: "Requests", href: "/foia/requests", icon: FileText },
  { label: "Message Review", href: "/foia/messages", icon: MessageSquareMore },
  { label: "Data Review", href: "/foia/data-review", icon: Database },
  { label: "Tasks", href: "/foia/tasks", icon: CheckSquare },
  { label: "City Profiles", href: "/foia/cities", icon: Building2 },
  { label: "Templates", href: "/foia/templates", icon: FileStack },
]

export function FoiaSidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/foia") return pathname === "/foia"
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-[280px] min-w-[280px] h-screen bg-white border-r border-gray-200 flex flex-col sticky top-0 left-0 z-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 min-h-16">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 text-inherit no-underline flex-1"
        >
          <div className="w-5 h-5 shrink-0">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="overflow-visible w-full h-full">
              <path
                d="M 0 45 Q 0 0, 45 0 L 50 0 L 50 8.333 L 45 8.333 Q 8.333 8.333, 8.333 45 L 8.333 50 L 0 50 Z"
                className="fill-gray-900"
              />
              <path
                d="M 100 55 Q 100 100, 55 100 L 50 100 L 50 91.666 L 55 91.666 Q 91.666 91.666, 91.666 55 L 91.666 50 L 100 50 Z"
                className="fill-gray-900"
              />
            </svg>
          </div>
          <div className="font-bold text-lg whitespace-nowrap">
            <span className="text-gray-900">Transparent</span>
            <span className="text-purple-600">.city</span>
          </div>
        </Link>
      </div>

      {/* Module Label */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          FOIA / Public Records
        </span>
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-xs text-gray-400 no-underline hover:text-purple-600 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Main App
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul className="list-none m-0 p-0">
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-all border-l-[3px]",
                    active
                      ? "text-purple-600 font-semibold bg-gray-100 border-l-purple-600"
                      : "text-gray-600 font-normal bg-transparent border-l-transparent hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-400 m-0">
          FOIA / Public Records
        </p>
      </div>
    </aside>
  )
}
