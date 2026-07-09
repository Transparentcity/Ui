"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth0 } from "@auth0/auth0-react"
import { Menu } from "lucide-react"
import Sidebar from "@/components/Sidebar"
import type { SidebarCitySelectOptions } from "@/components/SidebarCitySearch"
import {
  getMyPermissions,
  getGovernmentVerificationStatus,
  type GovernmentVerificationStatus,
} from "@/lib/apiClient"

const MOBILE_BREAKPOINT = 768
const DEFAULT_SIDEBAR_WIDTH = 280

function isNarrowScreen(): boolean {
  if (typeof window === "undefined") return false
  return window.innerWidth <= MOBILE_BREAKPOINT
}

/**
 * Standard app shell for the waste module: the shared left rail (the same
 * `Sidebar` the `/home` SPA renders) plus the waste content to its right.
 *
 * The rail is presentational here — every nav action routes to the `/home`
 * SPA rather than mutating waste state, using the deep-link query params
 * `/home` already consumes on mount (`?city_id=`, `?district=`, `?place_id=`,
 * `?view=`). Chat / research / job-session sections stay hidden (no
 * `chatEnabled`, no research handler) so the rail only surfaces destinations
 * that actually resolve.
 */
export function WasteAppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } =
    useAuth0()

  const [isAdmin, setIsAdmin] = useState(false)
  const [cityLeadCityIds, setCityLeadCityIds] = useState<number[]>([])
  const [govStatus, setGovStatus] =
    useState<GovernmentVerificationStatus | null>(null)

  // Narrow / open / width are seeded from the client environment up front (the
  // rail only ever renders after client-side auth resolves, so there is no SSR
  // paint to mismatch), then the effect just subscribes to viewport changes.
  const [narrow, setNarrow] = useState<boolean>(isNarrowScreen)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => !isNarrowScreen())
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH
    const saved = window.localStorage.getItem("sidebar-width")
    const parsed = saved ? Number(saved) : NaN
    return Number.isFinite(parsed) && parsed >= 200 ? parsed : DEFAULT_SIDEBAR_WIDTH
  })

  useEffect(() => {
    const onResize = () => setNarrow(isNarrowScreen())
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Mirror /home's single-round-trip sidebar bootstrap so the rail reflects the
  // real user (admin sections, government logo mark, etc.). Logged-out defaults
  // are the initial state; the shell only shows the rail when authenticated.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAccessTokenSilently()
        const [permissions, gov] = await Promise.all([
          getMyPermissions(token),
          getGovernmentVerificationStatus(token).catch(() => null),
        ])
        if (cancelled) return
        setIsAdmin(permissions.is_admin || false)
        setCityLeadCityIds(permissions.city_lead_city_ids || [])
        setGovStatus(gov ?? null)
      } catch {
        // Non-fatal: the rail still renders with resident defaults.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, getAccessTokenSilently])

  const handleWidthChange = useCallback((width: number) => {
    setSidebarWidth(width)
    window.localStorage.setItem("sidebar-width", String(width))
  }, [])

  const goHome = useCallback(
    (query?: string) => {
      router.push(query ? `/home?${query}` : "/home")
      if (isNarrowScreen()) setSidebarOpen(false)
    },
    [router],
  )

  const handleViewChange = useCallback(
    (view: string) => {
      if (view === "home") {
        goHome()
        return
      }
      // My Places click handlers in Sidebar fire onCityClick/onDistrictClick/
      // onPlaceClick AND onViewChange("city") in the same click; the dedicated
      // handler already pushes /home?city_id=…, so ignore "city" here to avoid
      // a second router.push("/home") that would clobber the deep link.
      if (view === "city") return
      // /home only understands `feed` and `inbox` as view deep links; anything
      // else lands on the default feed.
      goHome(view === "inbox" ? "view=inbox" : undefined)
    },
    [goHome],
  )

  const handleCitySelect = useCallback(
    (cityId: number, opts?: SidebarCitySelectOptions) => {
      const district =
        opts && "district" in opts && opts.district != null
          ? `&district=${opts.district}`
          : ""
      goHome(`city_id=${cityId}${district}`)
    },
    [goHome],
  )

  // Not authenticated (or still resolving auth): render the waste page alone.
  // `WasteShell` owns the loader and sign-in-required screens full-width — a
  // rail next to a sign-in prompt would be nonsense.
  if (authLoading || !isAuthenticated) {
    return <>{children}</>
  }

  return (
    <>
      {narrow && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="fixed top-2.5 left-2.5 z-[900] md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <Sidebar
        isOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        onWidthChange={handleWidthChange}
        isAdmin={isAdmin}
        cityLeadCityIds={cityLeadCityIds}
        governmentVerified={govStatus?.government_verified ?? false}
        governmentEmail={govStatus?.government_email ?? null}
        chatEnabled={false}
        onNewChat={() => goHome()}
        onOpenSettings={() => goHome()}
        onViewChange={handleViewChange}
        onCityClick={(cityId) => goHome(`city_id=${cityId}`)}
        onDistrictClick={(cityId, district) =>
          goHome(`city_id=${cityId}&district=${district}`)
        }
        onPlaceClick={(cityId, placeId) =>
          goHome(`city_id=${cityId}&place_id=${placeId}`)
        }
        onCitySelect={handleCitySelect}
        onClose={() => setSidebarOpen(false)}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
      />

      <div
        className="min-h-screen transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft: sidebarOpen && !narrow ? sidebarWidth : 0 }}
      >
        {children}
      </div>
    </>
  )
}
