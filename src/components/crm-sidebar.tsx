"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Users,
  Tags,
  ClipboardCheck,
  ArrowLeft,
  Send,
  FileText,
  MessageSquare,
  ListChecks,
  Newspaper,
  Wand2,
  MapPin,
  ChevronDown,
  Check,
  Loader2,
  Clock,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useCrmCity } from "./crm-city-context"

const navigation = [
  { name: "Templates", href: "/templates", icon: FileText, highlight: true },
  { name: "Create Emails", href: "/create-emails", icon: Wand2 },
  { name: "Review & Send", href: "/review-and-send", icon: ClipboardCheck },
  { name: "Send Queue", href: "/send-queue", icon: Send },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Content", href: "/anomalies", icon: Newspaper },
  { name: "Keywords", href: "/keywords", icon: Tags },
  { name: "Responses", href: "/responses", icon: MessageSquare },
  { name: "Follow-ups", href: "/followups", icon: ListChecks },
]

function CityPicker() {
  const {
    selectedCity,
    cities,
    recentCities,
    isLoading,
    error,
    setSelectedCityId,
    isPickerOpen,
    setPickerOpen,
  } = useCrmCity()
  const open = isPickerOpen
  const setOpen = setPickerOpen
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open, setOpen])

  // Global keyboard shortcut: ⌘K / Ctrl+K opens the picker
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      if (inputRef.current) {
        inputRef.current.focus()
      } else if (buttonRef.current) {
        buttonRef.current.focus()
      }
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [search, open])

  const searchLower = search.trim().toLowerCase()
  const filtered = searchLower
    ? cities.filter((c) =>
        `${c.name} ${c.state ?? ""}`.toLowerCase().includes(searchLower)
      )
    : cities

  const showRecents = !searchLower && recentCities.length > 0 && cities.length >= 5
  const showSearch = cities.length >= 5

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!filtered.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const target = filtered[activeIndex]
      if (target) {
        setSelectedCityId(target.id)
        setOpen(false)
        setSearch("")
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">
        City
      </label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isLoading || cities.length === 0}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
          "bg-white hover:bg-gray-50 border-gray-200",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change city (⌘K)"
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        )}
        <span className="flex-1 min-w-0 text-left truncate font-medium text-gray-900">
          {selectedCity
            ? `${selectedCity.emoji ? selectedCity.emoji + " " : ""}${selectedCity.name}${
                selectedCity.state ? `, ${selectedCity.state}` : ""
              }`
            : isLoading
              ? "Loading..."
              : cities.length === 0
                ? "No launched cities"
                : "Select city"}
        </span>
        <kbd className="hidden md:inline text-[9px] text-gray-400 font-mono bg-gray-100 rounded px-1 py-0.5">⌘K</kbd>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>
      {error && <p className="text-[11px] text-red-600 mt-1 px-1">{error}</p>}
      {!isLoading && cities.length === 0 && !error && (
        <p className="text-[11px] text-gray-500 mt-1 px-1">
          Launch cities from the admin panel to populate this list.
        </p>
      )}

      {open && cities.length > 0 && (
        <div
          role="listbox"
          onKeyDown={handleKeyDown}
          className="absolute left-3 right-3 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 max-h-[60vh] overflow-hidden flex flex-col"
        >
          {showSearch && (
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search cities..."
              className="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none"
            />
          )}
          <div className="overflow-y-auto">
            {showRecents && (
              <>
                <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Clock className="w-3 h-3" />
                  Recent
                </div>
                {recentCities.map((city) => {
                  const isCurrent = selectedCity?.id === city.id
                  return (
                    <button
                      key={`recent-${city.id}`}
                      type="button"
                      onClick={() => {
                        setSelectedCityId(city.id)
                        setOpen(false)
                        setSearch("")
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                        isCurrent ? "bg-purple-50 text-purple-700" : "hover:bg-gray-50"
                      )}
                    >
                      <span className="w-4 shrink-0 text-center">
                        {isCurrent ? <Check className="w-3.5 h-3.5 inline" /> : null}
                      </span>
                      {city.emoji && <span className="shrink-0">{city.emoji}</span>}
                      <span className="flex-1 truncate">
                        {city.name}
                        {city.state && (
                          <span className="text-gray-500 ml-1">· {city.state}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
                <div className="border-t border-gray-100 my-1" />
              </>
            )}

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 p-3 text-center">No matches</p>
            ) : (
              filtered.map((city, idx) => {
                const isCurrent = selectedCity?.id === city.id
                const isActive = idx === activeIndex
                return (
                  <button
                    key={city.id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      setSelectedCityId(city.id)
                      setOpen(false)
                      setSearch("")
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                      isCurrent
                        ? "bg-purple-50 text-purple-700"
                        : isActive
                          ? "bg-gray-100"
                          : "hover:bg-gray-50"
                    )}
                  >
                    <span className="w-4 shrink-0 text-center">
                      {isCurrent ? <Check className="w-3.5 h-3.5 inline" /> : null}
                    </span>
                    {city.emoji && <span className="shrink-0">{city.emoji}</span>}
                    <span className="flex-1 truncate">
                      {city.name}
                      {city.state && (
                        <span className="text-gray-500 ml-1">· {city.state}</span>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function CRMSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[280px] min-w-[280px] h-screen bg-white border-r border-gray-200 flex flex-col sticky top-0 left-0 z-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 min-h-16">
        <Link
          href="/home"
          className="flex items-center gap-2.5 text-inherit no-underline flex-1"
        >
          {/* Logo */}
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

      {/* CRM Label */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          CRM Dashboard
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
      <CityPicker />

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul className="list-none m-0 p-0">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href))

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-all border-l-[3px]",
                    isActive
                      ? "text-purple-600 font-semibold bg-gray-100 border-l-purple-600"
                      : "text-gray-600 font-normal bg-transparent border-l-transparent hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-[18px] h-[18px]",
                      item.highlight && !isActive ? "text-purple-600" : ""
                    )}
                  />
                  <span className="flex-1">{item.name}</span>
                  {item.highlight && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-600 text-white rounded">
                      NEW
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-500 m-0">
          Officials, Press &amp; Subscribers
        </p>
      </div>
    </aside>
  )
}
