"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import TitleBar from "@/components/TitleBar";
import Sidebar from "@/components/Sidebar";
// Old feed kept as fallback: import FeedView from "@/components/FeedView";
import FeedView from "@/components/feed/NewFeedView";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { PlaceOnboardingProvider } from "@/contexts/PlaceOnboardingContext";
import {
  getMyPermissions,
  getSavedCities,
  getUserPreferences,
  updateUserPreferences,
  getCity,
  saveCity,
  generateSampleNewsletter,
  saveUserMetricOrdering,
  recordSignupIntent,
  getGovernmentVerificationStatus,
  updateGovernmentVerification,
  listMyPlaces,
  runPlaceMetricsAndAnomaliesAsJob,
  getCityLeaders,
  followRepresentative,
  type ClaimContext,
  type GovernmentVerificationStatus,
  type UserPreferences,
  type UserPreferencesUpdateRequest,
  type CityDetail,
  type UserPlace,
} from "@/lib/apiClient";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import { PENDING_ORDER_STORAGE_KEY_PREFIX } from "@/components/MetricOrderEditor";
import Loader from "@/components/Loader";
import WelcomeModal from "@/components/WelcomeModal";
import CityNotFoundModal from "@/components/CityNotFoundModal";
import GovernmentOnboardingModal from "@/components/GovernmentOnboardingModal";
import EditHomeLocationModal from "@/components/EditHomeLocationModal";
import RedisStatusIndicator from "@/components/RedisStatusIndicator";
import {
  trackSignupComplete,
  trackLogin,
  trackOnboardingComplete,
  trackDashboardView,
  trackUserActivation,
  trackCitySaved,
} from "@/lib/analytics";
import {
  mergeNewsletterPreferenceFields,
  readNewsletterPreferenceFields,
} from "@/lib/newsletterPreferences";
import {
  clearImpersonation,
  getImpersonationState,
  IMPERSONATION_CHANGED_EVENT,
  setImpersonation,
  type ImpersonationState,
} from "@/lib/impersonation";
import { slugify } from "@/lib/utils";
import styles from "./page.module.css";
import dynamic from "next/dynamic";

// Lazy-load heavy views so dashboard shell and default Feed paint immediately
const ChatView = dynamic(() => import("@/components/ChatView"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.contentView} tc-loading-state`} style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader size="sm" color="dark" />
      <span>Loading…</span>
    </div>
  ),
});
const CityView = dynamic(() => import("@/components/CityView"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.contentView} tc-loading-state`} style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader size="sm" color="dark" />
      <span>Loading…</span>
    </div>
  ),
});
const ResearchView = dynamic(() => import("@/components/ResearchView"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.contentView} tc-loading-state`} style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader size="sm" color="dark" />
      <span>Loading…</span>
    </div>
  ),
});
const CityDataAdmin = dynamic(() => import("@/components/CityDataAdmin"), { ssr: false });
const CityDataTable = dynamic(() => import("@/components/CityDataTable"), { ssr: false });
const DatasetsAdmin = dynamic(() => import("@/components/DatasetsAdmin"), { ssr: false });
const MetricsAdmin = dynamic(() => import("@/components/MetricsAdmin"), { ssr: false });
const UserManagement = dynamic(() => import("@/components/UserManagement"), { ssr: false });
const ClaimsAdmin = dynamic(() => import("@/components/ClaimsAdmin"), { ssr: false });
const JobLogsViewer = dynamic(() => import("@/components/JobLogsViewer"), { ssr: false });
const EmailAdmin = dynamic(() => import("@/components/EmailAdmin"), { ssr: false });
const DataCompletenessAdmin = dynamic(() => import("@/components/DataCompletenessAdmin"), { ssr: false });
const FeedAdmin = dynamic(() => import("@/components/FeedAdmin"), { ssr: false });
const NewsletterAdmin = dynamic(() => import("@/components/NewsletterAdmin"), { ssr: false });

// Dynamically import NewResearchPage to avoid SSR issues
const NewResearchPage = dynamic(() => import("../research/new/page"), { ssr: false });

import MobileBottomNav, { type MobileTab } from "@/components/MobileBottomNav";
import MobileMoreMenu from "@/components/MobileMoreMenu";

type ViewType = "chat" | "city-data" | "system-stats" | "user-management" | "claims-admin" | "metrics-admin" | "datasets-admin" | "feed-stories-admin" | "feed-admin" | "newsletter-admin" | "city" | "metric" | "job-logs" | "research" | "research-new" | "feed";

// Mobile breakpoint (matches CSS media query)
const MOBILE_BREAKPOINT = 768;

// Helper function to check if screen is narrow (mobile)
const isNarrowScreen = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

export default function DashboardPage() {
  const { isAuthenticated, isLoading, user, getAccessTokenSilently } =
    useAuth0();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [cityLeadCityIds, setCityLeadCityIds] = useState<number[]>([]);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [impersonationState, setImpersonationState] = useState<ImpersonationState | null>(
    () => getImpersonationState(),
  );
  // Initialize sidebar state - always start with false to match server render
  // Will be updated on client mount based on screen size
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar-width");
      return saved ? Number(saved) : 280;
    }
    return 280;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>("feed");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isCurrentSessionJobSession, setIsCurrentSessionJobSession] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [activeCityId, setActiveCityId] = useState<number | null>(null);
  const [activeCityName, setActiveCityName] = useState<string | null>(null);
  const savedCitiesRef = useRef<Array<{ id: number; display_name: string }>>([]);
  const [initialDistrict, setInitialDistrict] = useState<number | null>(null);
  const [currentResearchId, setCurrentResearchId] = useState<number | null>(null);
  const [initialChatPrompt, setInitialChatPrompt] = useState<string | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [initialPlaceGps, setInitialPlaceGps] = useState<{ lat: number; lng: number; radius_m: number } | null>(null);
  const [requestOpenDistrictModal, setRequestOpenDistrictModal] = useState<number | null>(null);
  const [initialPlaceId, setInitialPlaceId] = useState<number | null>(null);
  const [initialSection, setInitialSection] = useState<"dashboard" | "map" | null>(null);
  /** Official Selector selection (district / place) so left nav can stay in sync; only when currentView === "city". */
  const [citySelection, setCitySelection] = useState<{ district: number | null; placeId: number | null }>({ district: null, placeId: null });
  /** After saving a new block, run metrics job once before showing place dashboard (see CityView). */
  const [placeIdPendingPlaceMetricsBootstrap, setPlaceIdPendingPlaceMetricsBootstrap] = useState<number | null>(null);
  const [allUserPlaces, setAllUserPlaces] = useState<UserPlace[]>([]);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [onboardingJob, setOnboardingJob] = useState<{ placeId: number; jobId: string } | null>(null);
  const onboardingRepNotifyRef = useRef<((name: string) => void) | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [cityNotFound, setCityNotFound] = useState<{ cityName: string; state: string | null; country: string | null } | null>(null);
  const [showGovernmentOnboardingModal, setShowGovernmentOnboardingModal] = useState(false);
  const [governmentClaimContext, setGovernmentClaimContext] = useState<ClaimContext | null>(null);
  const hasAutoSelectedCity = useRef(false);
  const autoSelectedCityRef = useRef<{ id: number; name: string; slug: string } | null>(null);
  const hasCheckedOnboarding = useRef(false);
  const activeCityIdRef = useRef<number | null>(null);
  activeCityIdRef.current = activeCityId;
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [govVerificationStatus, setGovVerificationStatus] = useState<GovernmentVerificationStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<(CityDetail & { display_name?: string }) | null>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [govModeToggling, setGovModeToggling] = useState(false);
  
  // Editable preference state
  const [editableAnomalyAlerts, setEditableAnomalyAlerts] = useState(false);
  const [editableWeeklyDigest, setEditableWeeklyDigest] = useState(false);
  const [editableMonthlyReport, setEditableMonthlyReport] = useState(false);
  const [editableReportScope, setEditableReportScope] = useState<"district" | "city">("district");
  const [editableNewsletterDescription, setEditableNewsletterDescription] = useState("");
  const savedNewsletterDescriptionRef = useRef("");
  const [editableNewsletterFrequency, setEditableNewsletterFrequency] = useState<"weekly" | "monthly">("weekly");
  const [generatingSampleNewsletter, setGeneratingSampleNewsletter] = useState(false);
  const [sampleNewsletterSubject, setSampleNewsletterSubject] = useState<string | null>(null);
  const [testNewsletterGenerationMode, setTestNewsletterGenerationMode] = useState<"stories" | "seymour">("stories");
  const [showEditHomeLocationModal, setShowEditHomeLocationModal] = useState(false);
  const identityScopeKey = impersonationState
    ? `impersonated:${impersonationState.userId}`
    : "self";
  const isImpersonating = impersonationState !== null;
  const previousIdentityScopeKey = useRef(identityScopeKey);
  const identityScopeKeyRef = useRef(identityScopeKey);
  identityScopeKeyRef.current = identityScopeKey;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncImpersonationState = () => {
      setImpersonationState(getImpersonationState());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "tc_impersonation") {
        syncImpersonationState();
      }
    };

    window.addEventListener(
      IMPERSONATION_CHANGED_EVENT,
      syncImpersonationState as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        IMPERSONATION_CHANGED_EVENT,
        syncImpersonationState as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (previousIdentityScopeKey.current === identityScopeKey) {
      return;
    }

    previousIdentityScopeKey.current = identityScopeKey;
    hasCheckedOnboarding.current = isImpersonating;
    setCurrentView("feed");
    setCurrentSessionId(null);
    setIsCurrentSessionJobSession(false);
    setSelectedCityId(null);
    setActiveCityId(null);
    setInitialDistrict(null);
    setCurrentResearchId(null);
    setInitialChatPrompt(null);
    setGpsLocation(null);
    setRequestOpenDistrictModal(null);
    setInitialPlaceId(null);
    setCitySelection({ district: null, placeId: null });
    setPlaceIdPendingPlaceMetricsBootstrap(null);
    setAllUserPlaces([]);
    setShowWelcomeModal(false);
    setShowGovernmentOnboardingModal(false);
    setGovernmentClaimContext(null);
    setSettingsOpen(false);
    setUserPreferences(null);
    setGovVerificationStatus(null);
    setUserEmail(null);
    setHomeCity(null);
  }, [identityScopeKey, isImpersonating]);

  // Resolve a display name for the active (or best-available) city.
  // Priority: active city > home city > first saved city > null.
  // Uses getSavedCities which has a 5s promise cache, so no duplicate network calls.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const cities = await getSavedCities(token);
        savedCitiesRef.current = cities;
        if (cancelled) return;

        // 1. Try active city
        if (activeCityId) {
          const match = cities.find((c) => c.id === activeCityId);
          if (match) {
            setActiveCityName(match.display_name || match.city_name || null);
            return;
          }
        }

        // 2. Try home city (from preferences)
        if (homeCity) {
          setActiveCityName(homeCity.display_name || homeCity.name || null);
          return;
        }

        // 3. Fall back to first saved city
        if (cities.length > 0) {
          setActiveCityName(cities[0].display_name || cities[0].city_name || null);
          return;
        }

        // 4. No cities at all
        setActiveCityName(null);
      } catch {
        if (!cancelled) {
          setActiveCityName(homeCity?.display_name || homeCity?.name || null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeCityId, getAccessTokenSilently, homeCity]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Accept one-time prefilled prompts (e.g. from Waste "Ask Seymour" button)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill") || params.get("prompt");
    if (!prefill) return;

    setCurrentView("chat");
    setCurrentSessionId(null);
    setIsCurrentSessionJobSession(false);
    setActiveCityId(null);
    setCurrentResearchId(null);
    setInitialChatPrompt(prefill);

    // Clean URL so refresh/back doesn't resend the same prompt.
    params.delete("prefill");
    params.delete("prompt");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    router.replace(nextUrl);
  }, [router]);

  // Deep-link to a Seymour job session (e.g. from Feed admin "View session").
  useEffect(() => {
    if (typeof window === "undefined" || !isAuthenticated || isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const jobSession = params.get("job_session");
    if (!jobSession) return;

    setCurrentSessionId(jobSession);
    setIsCurrentSessionJobSession(true);
    setCurrentView("chat");
    setActiveCityId(null);
    setCurrentResearchId(null);

    params.delete("job_session");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    router.replace(nextUrl);
  }, [router, isAuthenticated, isLoading]);

  // Track dashboard view when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      trackDashboardView();
    }
  }, [isAuthenticated, isLoading]);

  // Track signup completion and login; set initial view to feed only when not already on a city/location
  useEffect(() => {
    if (!isAuthenticated || isLoading || !user) return;

    // Read current selection from ref so we don't reset to feed when user has already opened a city
    const currentActiveCityId = activeCityIdRef.current;

    // Check if this is a signup completion (from URL params, or localStorage fallback
    // if Auth0 lost the appState during the redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const signupIntentParam = urlParams.get("signup") as "resident" | "public-servant" | null;
    const signupIntentLS = window.localStorage.getItem("transparentcity.signup_intent") as "resident" | "public-servant" | null;
    const signupIntent = signupIntentParam || signupIntentLS;
    // Clean up signup intent from localStorage (consumed; prevents repeat triggers on next login)
    if (signupIntentLS) {
      window.localStorage.removeItem("transparentcity.signup_intent");
    }

    // Check for follow-city intent (from URL params or localStorage, set by FollowCityButton)
    const followCityIdParam = urlParams.get("follow_city_id");
    const followCityIdLS = typeof window !== "undefined" ? window.localStorage.getItem("transparentcity.follow_city_id") : null;
    const followCityId = followCityIdParam ? parseInt(followCityIdParam, 10) : (followCityIdLS ? parseInt(followCityIdLS, 10) : NaN);

    if (Number.isFinite(followCityId)) {
      // User arrived via "Follow this city" - save the city AND show onboarding.
      // The followed city goes into My Places regardless of what address the
      // user enters during onboarding (e.g. Boston page → lives in Somerville).
      if (signupIntent) {
        trackSignupComplete(signupIntent, user.sub);
        trackUserActivation("signup_complete");
      } else {
        trackLogin(user.sub);
      }
      const followCityName = urlParams.get("follow_city_name") || window.localStorage.getItem("transparentcity.follow_city_name") || "";
      const followCitySlug = urlParams.get("follow_city_slug") || window.localStorage.getItem("transparentcity.follow_city_slug") || slugify(followCityName);
      setActiveCityId(followCityId);
      setCurrentView("city");
      hasAutoSelectedCity.current = true;
      autoSelectedCityRef.current = { id: followCityId, name: followCityName, slug: followCitySlug };
      // Clean up URL params and localStorage
      window.history.replaceState({}, "", window.location.pathname);
      window.localStorage.removeItem("transparentcity.follow_city_slug");
      window.localStorage.removeItem("transparentcity.follow_city_id");
      window.localStorage.removeItem("transparentcity.follow_city_name");
      // Save city in the background
      void (async () => {
        try {
          const token = await getAccessTokenSilently();
          await saveCity(followCityId, token);
          trackCitySaved(followCityId, autoSelectedCityRef.current?.name || "Unknown");
        } catch {
          // Non-blocking
        }
      })();
      // For new signups, show onboarding immediately so the user can enter
      // their address. Returning users (who already completed onboarding)
      // will be caught by the hasCheckedOnboarding guard in effect 2.
      if (signupIntent) {
        hasCheckedOnboarding.current = true;
        if (signupIntent === "public-servant") {
          setShowGovernmentOnboardingModal(true);
        } else {
          setShowWelcomeModal(true);
        }
      }
    } else if (signupIntent) {
      // User just completed signup without a follow intent
      trackSignupComplete(signupIntent, user.sub);
      trackUserActivation("signup_complete");
      setCurrentView((prev) => (currentActiveCityId != null && prev === "city" ? "city" : "feed"));
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);

      // Show the onboarding modal immediately for new signups instead of
      // waiting for the admin permissions check to finish (which can take 15s+).
      // A brand-new user has no saved cities and is not an admin.
      hasCheckedOnboarding.current = true;
      if (signupIntent === "public-servant") {
        setShowGovernmentOnboardingModal(true);
      } else {
        setShowWelcomeModal(true);
      }
    } else {
      // Regular login: default to feed for all users
      trackLogin(user.sub);
      setCurrentView((prev) => (currentActiveCityId != null && prev === "city" ? "city" : "feed"));
    }
  }, [isAuthenticated, isLoading, user]);

  // Migrate pending metric order from localStorage to user account when user signs in
  useEffect(() => {
    if (!isAuthenticated || isLoading || typeof window === "undefined") return;

    const migratePendingMetricOrder = async () => {
      const prefix = PENDING_ORDER_STORAGE_KEY_PREFIX;
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        try {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { city_id: number; orderings: Array<{ category_name: string; category_order: number; subcategory_name?: string | null; metric_id: number; metric_order: number }> };
          if (parsed?.city_id == null || !Array.isArray(parsed.orderings)) continue;
          const token = await getAccessTokenSilently();
          await saveUserMetricOrdering(parsed.city_id, parsed.orderings, token);
          keysToRemove.push(key);
        } catch {
          // Skip this key on error
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    };

    migratePendingMetricOrder();
  }, [isAuthenticated, isLoading]);

  // Load all user places for sidebar (My Places list)
  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      setAllUserPlaces([]);
      return;
    }
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => listMyPlaces(token))
      .then((res) => {
        if (!cancelled) setAllUserPlaces(res.places);
      })
      .catch(() => {
        if (!cancelled) setAllUserPlaces([]);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, getAccessTokenSilently, identityScopeKey]);

  // Reload preferences when settings view becomes active
  useEffect(() => {
    if (currentView === "system-stats" && isAuthenticated && !isLoading && !loadingPreferences) {
      loadUserSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, isAuthenticated, isLoading, identityScopeKey]);

  // Set initial sidebar state based on screen size after mount
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;
    
    // Set initial state based on screen width
    const isNarrow = isNarrowScreen();
    setSidebarOpen(!isNarrow);
  }, []);

  // Keep --sidebar-width CSS variable in sync with sidebarWidth state
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
    localStorage.setItem("sidebar-width", String(width));
  }, []);

  // Handle window resize to update sidebar state for mobile/desktop
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const isNarrow = isNarrowScreen();
      setSidebarOpen((prev) => {
        // When transitioning to narrow screen, close sidebar if it's open
        if (isNarrow && prev) {
          return false;
        }
        // When transitioning to wide screen, keep current state (don't force open)
        return prev;
      });
    };

    // Add resize listener
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load permissions and government verification in parallel (single round-trip for sidebar state)
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setIsAdmin(false);
      setCityLeadCityIds([]);
      setCurrentUserId(null);
      setGovVerificationStatus(null);
      setIsCheckingAdmin(false);
      return;
    }

    let cancelled = false;

    const loadPermissionsAndGov = async () => {
      try {
        if (!cancelled) {
          setIsCheckingAdmin(true);
        }
        const token = await getAccessTokenSilently();
        const [permissions, govStatus] = await Promise.all([
          getMyPermissions(token),
          getGovernmentVerificationStatus(token).catch(() => null),
        ]);
        if (cancelled) return;
        setCurrentUserId(permissions.session_user_id || permissions.user_id || null);
        setIsAdmin(permissions.is_admin || false);
        setCityLeadCityIds(permissions.city_lead_city_ids || []);
        setGovVerificationStatus(govStatus ?? null);

      } catch (error) {
        console.error("Error checking admin status:", error);
      } finally {
        if (!cancelled) setIsCheckingAdmin(false);
      }
    };

    loadPermissionsAndGov();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, getAccessTokenSilently, identityScopeKey]);

  // Check if user needs onboarding (first-time user check)
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Only run once after auth is ready
      if (
        !isAuthenticated ||
        isLoading ||
        isCheckingAdmin ||
        isImpersonating ||
        hasCheckedOnboarding.current
      ) {
        return;
      }

      try {
        hasCheckedOnboarding.current = true;

        const token = await getAccessTokenSilently();
        const prefs = await getUserPreferences(token);
        if (!prefs.has_completed_onboarding) {
          const savedCities = await getSavedCities(token);
          if (savedCities.length === 0) {
            const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
            const signup = urlParams?.get("signup");
            const cityIdParam = urlParams?.get("city_id");
            const districtParam = urlParams?.get("district");
            const preferredType = prefs.extra?.preferred_onboarding_type as string | undefined;
            const isGovernmentFlow =
              signup === "government" ||
              signup === "public-servant" ||
              preferredType === "government";

            if (isGovernmentFlow) {
              // Persist signup intent and claim context for this user
              const claimContextPayload =
                cityIdParam != null &&
                districtParam != null &&
                Number.isFinite(Number(cityIdParam)) &&
                Number.isFinite(Number(districtParam))
                  ? {
                      city_id: parseInt(cityIdParam, 10),
                      district: parseInt(districtParam, 10),
                    }
                  : undefined;
              try {
                await recordSignupIntent(
                  {
                    source: signup === "government" ? "claim_profile" : "public-servant",
                    claim_context: claimContextPayload,
                  },
                  token
                );
              } catch {
                // Non-blocking
              }
              // Prefer claim context from server if already stored, else from URL
              let claimContext: ClaimContext | null = claimContextPayload ?? null;
              try {
                const govStatus = await getGovernmentVerificationStatus(token);
                if (govStatus.claim_context && (govStatus.claim_context.city_id != null || govStatus.claim_context.leader_id != null)) {
                  claimContext = govStatus.claim_context;
                }
              } catch {
                // Use URL-derived context
              }
              if (!claimContext && claimContextPayload) {
                claimContext = claimContextPayload;
              }
              setGovernmentClaimContext(
                preferredType === "government" && !signup ? null : claimContext
              );
              setShowGovernmentOnboardingModal(true);
            } else {
              // Show onboarding even when the user arrived via a follow-city
              // intent. The followed city is already saved to My Places by
              // the saveCity() call in effect 1, but we still need the user
              // to enter their address so place metrics and rep discovery run.
              setShowWelcomeModal(true);
            }
          }
        }
      } catch (error) {
        // Reset so the check retries on next effect trigger (e.g. after
        // a transient API failure) instead of permanently skipping onboarding.
        hasCheckedOnboarding.current = false;
        console.error("Error checking onboarding status:", error);
      }
    };

    if (isAuthenticated && !isLoading && !isCheckingAdmin) {
      checkOnboardingStatus();
    }
  }, [isAuthenticated, isLoading, isCheckingAdmin, getAccessTokenSilently, isImpersonating]);

  // Listen for research creation from embedded research-new view
  useEffect(() => {
    const handleResearchCreated = (e: CustomEvent) => {
      const reportId = e.detail as number;

      setCurrentResearchId(reportId);
      setCurrentView("research");
    };

    if (typeof window !== "undefined") {
      window.addEventListener("research:created", handleResearchCreated as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("research:created", handleResearchCreated as EventListener);
      }
    };
  }, []);

  // Redirect away from research and research-new unless government-verified or admin
  const canAccessResearch = !!govVerificationStatus?.government_verified;
  useEffect(() => {
    if (!isCheckingAdmin && !canAccessResearch && !isAdmin && (currentView === "research" || currentView === "research-new")) {
      setCurrentView("chat");
      setCurrentResearchId(null);
    }
  }, [isCheckingAdmin, canAccessResearch, currentView]);

  // Allow other views (e.g., Research) to open a Job Session for review.
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ session_id: string }>;
      const sessionId = customEvent.detail?.session_id;
      if (!sessionId) return;
      setCurrentSessionId(sessionId);
      setIsCurrentSessionJobSession(true); // Mark as job session
      setCurrentView("chat");
      setActiveCityId(null);
      setCurrentResearchId(null);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("job-session:open", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("job-session:open", handler);
      }
    };
  }, []);

  // Do not auto-select a city on landing. Only Feed is selected; user picks a city from My Places when they want.

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Stable callback so CityView's useEffect doesn't re-run every render (avoids max update depth)
  const onOfficialSelectionChange = useCallback(
    (s: { district: number | null; placeId: number | null }) => setCitySelection(s),
    []
  );

  const handleNewChat = () => {
    setCurrentView("chat");
    setCurrentSessionId(null); // Reset to new chat
    setIsCurrentSessionJobSession(false); // Clear job session flag
    setActiveCityId(null); // Clear city selection when starting new chat
    setCurrentResearchId(null); // Clear research when starting new chat
  };

  const handleSessionClick = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsCurrentSessionJobSession(false); // Regular chat session, not a job session
    setCurrentView("chat");
    setActiveCityId(null); // Clear city selection when selecting a chat session
    setCurrentResearchId(null); // Clear research when selecting a chat session
  };

  const handleJobSessionClick = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsCurrentSessionJobSession(true); // This is a job session
    setCurrentView("chat");
    setActiveCityId(null); // Clear city selection when selecting a job session
    setCurrentResearchId(null); // Clear research when selecting a job session
  };

  const handleSessionDeleted = (sessionId: string) => {
    // If the deleted session was the current one, clear it
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setIsCurrentSessionJobSession(false);
    }
  };

  const handleSearchCities = () => {
    // City search is now handled by the CityTypeahead component in the Sidebar
  };

  const handleOpenFindDistrict = () => {
    if (activeCityId != null) {
      setRequestOpenDistrictModal(activeCityId);
      setCurrentView("city");
    }
  };

  const handleViewChange = (view: string) => {
    const nextView = view as ViewType;
    setCurrentView(nextView);
    // Reset selected city when switching away from city-data view
    if (nextView !== "city-data") {
      setSelectedCityId(null);
    }
    // Reset active city when switching away from city view
    if (nextView !== "city") {
      setActiveCityId(null);
      setInitialDistrict(null); // Clear initial district when leaving city view
      setInitialSection(null);
      setGpsLocation(null); // Clear GPS location when leaving city view
      setInitialPlaceGps(null);
    }
    // Don't close sidebar when navigating - only close on hamburger click
  };

  const handleOpenJobLogsFromCityData = useCallback((jobId: string) => {
    setCurrentView("job-logs");
    const base = pathname || "/home";
    const q = new URLSearchParams({ tab: "logs", job_id: jobId });
    router.replace(`${base}?${q.toString()}`, { scroll: false });
  }, [pathname, router]);

  const handleCityClick = (cityId: number) => {
    setActiveCityId(cityId);
    setInitialDistrict(null);
    setInitialPlaceId(null);
    setInitialPlaceGps(null);
    setInitialSection(null);
    setCitySelection({ district: null, placeId: null });
    setCurrentView("city");
    setCurrentSessionId(null);
    setIsCurrentSessionJobSession(false);
    setCurrentResearchId(null);
    setGpsLocation(null);
  };

  const handlePlaceClick = useCallback(
    (cityId: number, placeId: number, placeOverride?: UserPlace) => {
      // Look up place GPS immediately so the map can start at block level without waiting
      // for listMyPlaces inside CityView (use API response when the place was just created).
      const place = placeOverride ?? allUserPlaces.find((p) => p.id === placeId);
      setActiveCityId(cityId);
      setInitialDistrict(null);
      setInitialPlaceId(placeId);
      setInitialPlaceGps(
        place?.lat != null && place?.lng != null
          ? { lat: place.lat, lng: place.lng, radius_m: place.radius_m ?? 500 }
          : null
      );
      setCitySelection({ district: null, placeId });
      setCurrentView("city");
      setCurrentSessionId(null);
      setIsCurrentSessionJobSession(false);
      setCurrentResearchId(null);
      setGpsLocation(null);
    },
    [allUserPlaces]
  );

  const refreshAllUserPlaces = useCallback(
    (expectedIdentityScopeKey: string = identityScopeKey) => {
      getAccessTokenSilently()
        .then((token) => listMyPlaces(token))
        .then((res) => {
          if (identityScopeKeyRef.current === expectedIdentityScopeKey) {
            setAllUserPlaces(res.places);
          }
        })
        .catch(() => {
          if (identityScopeKeyRef.current === expectedIdentityScopeKey) {
            setAllUserPlaces([]);
          }
        });
    },
    [getAccessTokenSilently, identityScopeKey]
  );

  const handlePlaceSaved = useCallback(
    (place?: UserPlace) => {
      refreshAllUserPlaces();
      if (place) {
        setPlaceIdPendingPlaceMetricsBootstrap(place.id);
        handlePlaceClick(place.city_id, place.id, place);
        setCurrentView("city");
      }
    },
    [refreshAllUserPlaces, handlePlaceClick]
  );

  const consumePlaceMetricsBootstrap = useCallback(() => {
    setPlaceIdPendingPlaceMetricsBootstrap(null);
  }, []);

  useEffect(() => {
    if (
      placeIdPendingPlaceMetricsBootstrap != null &&
      citySelection.placeId !== placeIdPendingPlaceMetricsBootstrap
    ) {
      setPlaceIdPendingPlaceMetricsBootstrap(null);
    }
  }, [citySelection.placeId, placeIdPendingPlaceMetricsBootstrap]);

  const handlePlaceRenamed = () => {
    refreshAllUserPlaces();
  };

  const handlePlaceDeleted = (placeId: number) => {
    refreshAllUserPlaces();
    setPlaceIdPendingPlaceMetricsBootstrap((p) => (p === placeId ? null : p));
    if (citySelection.placeId === placeId) {
      setCitySelection((prev) => ({ ...prev, placeId: null }));
      setInitialPlaceId(null);
    }
  };

  const handleOpenSettings = async () => {
    setSettingsOpen(true);
    // Load user preferences and info when opening settings
    await loadUserSettings();
  };

  const loadUserSettings = async () => {
    try {
      setLoadingPreferences(true);
      const token = await getAccessTokenSilently();
      
      // Fetch preferences
      const prefs = await getUserPreferences(token);
      setUserPreferences(prefs);
      
      // Initialize editable state from preferences
      const commPrefs = prefs.extra?.communication_preferences || {};
      const { newsletterDescription, newsletterFrequency } =
        readNewsletterPreferenceFields(prefs.extra);
      setEditableAnomalyAlerts(commPrefs.anomaly_alerts ?? false);
      setEditableWeeklyDigest(commPrefs.weekly_digest ?? false);
      setEditableMonthlyReport(commPrefs.monthly_report ?? false);
      setEditableReportScope(commPrefs.report_scope || "district");
      setEditableNewsletterDescription(newsletterDescription);
      savedNewsletterDescriptionRef.current = newsletterDescription;
      setEditableNewsletterFrequency(newsletterFrequency);

      // Fetch government verification status (for Settings government mode section)
      try {
        const govStatus = await getGovernmentVerificationStatus(token);
        setGovVerificationStatus(govStatus);
      } catch {
        setGovVerificationStatus(null);
      }

      // Fetch user email from permissions
      try {
        const permissions = await getMyPermissions(token);
        setUserEmail(permissions.email || user?.email || null);
      } catch (err) {
        console.error("Error fetching user email:", err);
        setUserEmail(user?.email || null);
      }
      
      // Fetch home city if we have a home location
      if (prefs.extra?.home_location?.city_id) {
        try {
          const city = await getCity(prefs.extra.home_location.city_id, token);
          setHomeCity(city);
        } catch (err) {
          console.error("Error fetching home city:", err);
        }
      }
    } catch (error) {
      console.error("Error loading user settings:", error);
    } finally {
      setLoadingPreferences(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setSavingPreferences(true);
      const token = await getAccessTokenSilently();
      
      // Get current preferences to preserve other data
      // First, reload from server to ensure we have the latest state
      const latestPrefs = await getUserPreferences(token);
      const currentExtra = latestPrefs.extra || {};
      
      const communicationPreferences = mergeNewsletterPreferenceFields(
        currentExtra,
        {
          newsletterDescription: editableNewsletterDescription,
          newsletterFrequency: editableNewsletterFrequency,
        }
      );
      
      // Build updated extra object, preserving ALL existing data
      // The backend merges extra fields at the top level of preferences,
      // so we need to include all existing extra fields plus our updates
      const updatedExtra = {
        ...currentExtra, // Preserve all existing extra fields (saved_cities, home_location, etc.)
        communication_preferences: {
          ...communicationPreferences,
          anomaly_alerts: editableAnomalyAlerts,
          weekly_digest: editableWeeklyDigest,
          monthly_report: editableMonthlyReport,
          report_scope: editableMonthlyReport ? editableReportScope : null,
        },
      };
      
      // Build update request with only the fields the API expects
      const updateRequest: UserPreferencesUpdateRequest = {
        extra: updatedExtra,
      };
      
      // Preserve has_completed_onboarding and theme if they exist
      if (latestPrefs.has_completed_onboarding !== undefined) {
        updateRequest.has_completed_onboarding = latestPrefs.has_completed_onboarding;
      }
      if (latestPrefs.theme !== undefined) {
        updateRequest.theme = latestPrefs.theme ?? undefined;
      }
      
      // Save preferences
      const saved = await updateUserPreferences(updateRequest, token);
      
      // Reload preferences from server to ensure we have the latest data
      const refreshed = await getUserPreferences(token);
      // Update local state with refreshed preferences
      setUserPreferences(refreshed);
      
      // Re-initialize editable state from refreshed preferences to ensure sync
      const commPrefs = refreshed.extra?.communication_preferences || {};
      const { newsletterDescription, newsletterFrequency } =
        readNewsletterPreferenceFields(refreshed.extra);
      
      setEditableAnomalyAlerts(commPrefs.anomaly_alerts ?? false);
      setEditableWeeklyDigest(commPrefs.weekly_digest ?? false);
      setEditableMonthlyReport(commPrefs.monthly_report ?? false);
      setEditableReportScope(commPrefs.report_scope || "district");
      const newsletterDescriptionChanged =
        newsletterDescription !== savedNewsletterDescriptionRef.current;
      setEditableNewsletterDescription(newsletterDescription);
      savedNewsletterDescriptionRef.current = newsletterDescription;
      setEditableNewsletterFrequency(newsletterFrequency);

      // Update home city if it exists
      if (refreshed.extra?.home_location?.city_id) {
        try {
          const city = await getCity(refreshed.extra.home_location.city_id, token);
          setHomeCity(city);
        } catch (err) {
          console.error("Error fetching home city after save:", err);
        }
      }

      if (newsletterDescriptionChanged) {
        toast.success(
          "Thank you! Behind the scenes we are working to make these prompts increasingly valuable to you, so please keep it updated based on your interests.",
          { duration: 6000 }
        );
      } else {
        toast.success("Preferences saved!");
      }
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleGenerateSampleNewsletter = async () => {
    const homeLocation = userPreferences?.extra?.home_location;
    const cityId = homeLocation?.city_id;
    const district = homeLocation?.district ?? 0;
    if (!cityId) {
      alert("Set a home city first (complete onboarding or save a city as home).");
      return;
    }
    const cityName = homeCity?.name || homeCity?.display_name || "Your city";
    const districtLabel = district ? `District ${district}` : "citywide";
    const defaultPrompt =
      "Create a weekly newsletter report for this city and district. Focus on recent changes and trends in key metrics (crime, housing, permits, 311 calls), notable anomalies, comparative analysis (this period vs. previous, district vs. city-wide), and actionable insights for residents. Be data-driven with specific numbers; highlight both positive and concerning trends.";
    const prompt = editableNewsletterDescription.trim() || defaultPrompt;
    const promptOverride = `For ${cityName} (${districtLabel}). ${prompt}`;

    setGeneratingSampleNewsletter(true);
    setSampleNewsletterSubject(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await generateSampleNewsletter(
        {
          city_id: cityId,
          district: district ? Number(district) : null,
          frequency: editableNewsletterFrequency,
          prompt_override: promptOverride,
          generation_mode: testNewsletterGenerationMode,
        },
        token
      );
      setSampleNewsletterSubject((res?.title || "").trim() || "Your local update");
    } catch (err) {
      console.error("Error generating sample newsletter:", err);
      alert("Failed to send test newsletter. Please try again.");
    } finally {
      setGeneratingSampleNewsletter(false);
    }
  };

  const handleWelcomeCitySelected = (cityId: number, district?: number | null, placeId?: number | null) => {
    setActiveCityId(cityId);
    setInitialDistrict(district !== undefined && district !== null ? district : null);
    setInitialPlaceId(placeId ?? null);
    setCurrentView("city");
    setCurrentSessionId(null);
    setCurrentResearchId(null);
    hasAutoSelectedCity.current = true;
    // Refresh My Places so the new block appears in the sidebar
    if (placeId != null) {
      refreshAllUserPlaces();
    }
  };

  const handleWelcomeComplete = () => {
    setShowWelcomeModal(false);
    setCurrentView("feed");
    toast.success("Welcome! We\u2019re building your neighborhood feed now.");
    if (user?.sub) {
      trackOnboardingComplete(user.sub);
      trackUserActivation("onboarding_complete");
    }

    // Deferred background work: rep discovery
    // Place metrics job is now started from WelcomeModal after place creation to avoid race conditions.
    void (async () => {
      try {
        const token = await getAccessTokenSilently();
        const prefs = await getUserPreferences(token);
        const homeLoc = prefs?.extra?.home_location;
        if (!homeLoc?.coordinates || !homeLoc?.city_id) return;

        const { lat, lng } = homeLoc.coordinates as { lat: number; lng: number };
        const cId = homeLoc.city_id as number;

        const district = await findDistrictFromCoordinates(lat, lng, cId, token);
        if (!district) return;

        await followRepresentative(cId, String(district), token);

        const leaders = await getCityLeaders(cId, token);
        const rep = leaders.find((l) => l.district === district);
        if (rep) {
          onboardingRepNotifyRef.current?.(rep.name);
        }
      } catch {
        // Non-blocking
      }
    })();
  };

  const handleGovernmentOnboardingComplete = () => {
    setShowGovernmentOnboardingModal(false);
    setGovernmentClaimContext(null);
    toast.success("Verification submitted! We\u2019ll notify you once approved.");
    if (user?.sub) {
      trackOnboardingComplete(user.sub);
      trackUserActivation("onboarding_complete");
    }
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (urlParams?.get("signup")) {
      const p = new URLSearchParams(window.location.search);
      p.delete("signup");
      p.delete("city_id");
      p.delete("district");
      const next = p.toString() ? `${window.location.pathname}?${p}` : window.location.pathname;
      window.history.replaceState({}, "", next);
    }
  };

  const handleResetOnboarding = async () => {
    if (!confirm("This will reset your onboarding experience. The welcome (citizen) screen will appear immediately. Continue?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const extra = { ...(userPreferences?.extra || {}), preferred_onboarding_type: "citizen" };
      await updateUserPreferences({ has_completed_onboarding: false, extra }, token);
      hasCheckedOnboarding.current = false;
      await getSavedCities(token);
      setShowGovernmentOnboardingModal(false);
      setShowWelcomeModal(true);
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      alert("Failed to reset onboarding. Please try again.");
    }
  };

  const handleResetOnboardingGovernment = async () => {
    if (!confirm("This will reset onboarding and show the government flow (verify email, etc.) immediately. Continue?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const extra = { ...(userPreferences?.extra || {}), preferred_onboarding_type: "government" };
      await updateUserPreferences({ has_completed_onboarding: false, extra }, token);
      hasCheckedOnboarding.current = false;
      setShowWelcomeModal(false);
      setGovernmentClaimContext(null);
      setShowGovernmentOnboardingModal(true);
    } catch (error) {
      console.error("Error resetting to government onboarding:", error);
      alert("Failed to reset. Please try again.");
    }
  };

  const handleLoginAsUser = useCallback((targetUser: { id: number; email: string }) => {
    setImpersonation(targetUser.id, targetUser.email);
  }, []);

  const handleStopImpersonating = useCallback(() => {
    clearImpersonation();
  }, []);

  const handleSwitchGovernmentMode = async (enable: boolean) => {
    try {
      setGovModeToggling(true);
      const token = await getAccessTokenSilently();
      const updated = await updateGovernmentVerification(
        enable,
        enable ? (userEmail ?? undefined) : undefined,
        token
      );
      setGovVerificationStatus(updated);
    } catch (error) {
      console.error("Error toggling government mode:", error);
      alert(enable ? "Failed to switch to government mode." : "Failed to revert to standard user.");
    } finally {
      setGovModeToggling(false);
    }
  };

  // Only block on Auth0; show shell + feed immediately. Admin/gov state fills in when ready.
  if (isLoading) {
    return (
      <div className={`${styles.dashboardLoading} tc-loading-state`}>
        <Loader size="sm" color="dark" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const hasGovernmentBanner = !!govVerificationStatus?.government_verified;

  return (
    <div className={`${styles.dashboardLayout} ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <TitleBar
        onMenuToggle={handleMenuToggle}
        isAdmin={isAdmin}
        sidebarOpen={sidebarOpen}
      />
      
      <Sidebar
        key={`sidebar-${identityScopeKey}`}
        isOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        onWidthChange={handleSidebarWidthChange}
        isAdmin={isAdmin}
        cityLeadCityIds={cityLeadCityIds}
        currentView={currentView}
        governmentVerified={govVerificationStatus?.government_verified ?? false}
        governmentEmail={govVerificationStatus?.government_email ?? null}
        onNewChat={handleNewChat}
        onSearchCities={handleSearchCities}
        chatEnabled={isAdmin}
        activeCityName={activeCityName}
        onQuestionClick={() => {
          // Toast: chat coming soon
          const toast = document.createElement("div");
          toast.textContent = "Chat with Seymour is coming soon";
          toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg-secondary,#333);color:var(--text-primary,#fff);padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.2);transition:opacity 0.3s ease";
          document.body.appendChild(toast);
          setTimeout(() => { toast.style.opacity = "0"; }, 2500);
          setTimeout(() => { toast.remove(); }, 3000);
        }}
        onOpenSettings={handleOpenSettings}
        onViewChange={handleViewChange}
        onSessionClick={handleSessionClick}
        onJobSessionClick={handleJobSessionClick}
        currentSessionId={currentSessionId}
        isCurrentSessionJobSession={isCurrentSessionJobSession}
        onSessionDeleted={handleSessionDeleted}
        onClose={() => setSidebarOpen(false)}
        onMenuToggle={handleMenuToggle}
        onCityClick={handleCityClick}
        onDistrictClick={(cityId, district) => {
          setActiveCityId(cityId);
          const districtNum = typeof district === "string" ? parseInt(district, 10) : district;
          setInitialDistrict(districtNum);
          setInitialPlaceId(null);
          setCitySelection({ district: Number.isNaN(districtNum) ? null : districtNum, placeId: null });
          setCurrentView("city");
          setCurrentSessionId(null);
          setIsCurrentSessionJobSession(false);
          setCurrentResearchId(null);
          setGpsLocation(null);
        }}
        userPlaces={allUserPlaces}
        activePlaceId={currentView === "city" ? citySelection.placeId : null}
        activeDistrict={
          currentView === "city"
            ? citySelection.placeId != null
              ? undefined
              : citySelection.district
            : undefined
        }
        onPlaceClick={handlePlaceClick}
        onPlaceSaved={handlePlaceSaved}
        onPlaceRenamed={handlePlaceRenamed}
        onPlaceDeleted={handlePlaceDeleted}
        onCitySectionClick={(cityId, section) => {
          setActiveCityId(cityId);
          setInitialDistrict(null);
          setInitialPlaceId(null);
          setInitialPlaceGps(null);
          setInitialSection(section);
          setCitySelection({ district: null, placeId: null });
          setCurrentView("city");
          setCurrentSessionId(null);
          setIsCurrentSessionJobSession(false);
          setCurrentResearchId(null);
          setGpsLocation(null);
        }}
        activeCityId={activeCityId}
        onResearchClick={(reportId) => {
          setCurrentResearchId(reportId);
          setCurrentView("research");
          setCurrentSessionId(null);
          setIsCurrentSessionJobSession(false);
          setActiveCityId(null);
        }}
        currentResearchId={currentResearchId}
        onResearchDeleted={(reportId) => {
          if (currentResearchId === reportId) {
            setCurrentResearchId(null);
          }
        }}
        onCitySelect={(cityId) => {
          setActiveCityId(cityId);
          setInitialDistrict(null); // Clear initial district when manually selecting
          setInitialPlaceId(null);
          setCitySelection({ district: null, placeId: null });
          setCurrentView("city");
          setCurrentSessionId(null); // Clear chat session when selecting a city
          setIsCurrentSessionJobSession(false);
          // Preserve GPS location - it will only be cleared when user manually
          // selects a city from the sidebar list (via handleCityClick)
        }}
        onGPSLocation={(location) => {
          setGpsLocation(location);
        }}
        onOpenFindDistrict={handleOpenFindDistrict}
      />

      <PlaceOnboardingProvider
        initialJob={onboardingJob}
        notifyRepFoundRef={onboardingRepNotifyRef}
      >
      <main className={`${styles.mainContent} ${sidebarOpen ? "" : styles.mainContentCollapsed}`} id="main-content">
        {impersonationState && (
          <ImpersonationBanner
            email={impersonationState.email}
            onStop={handleStopImpersonating}
          />
        )}
        {isAdmin && (
          <div className={`${styles.governmentBanner} ${styles.governmentBannerAdmin}`} role="banner">
            Admin View
          </div>
        )}
        {!isAdmin && hasGovernmentBanner && (
          <div className={styles.governmentBanner} role="banner">
            Government View
          </div>
        )}
        <div className={styles.viewsContainer}>
          {currentView === "chat" && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
              <ChatView
                sessionId={currentSessionId}
                onSessionChange={setCurrentSessionId}
                initialPrompt={initialChatPrompt}
                onInitialPromptHandled={() => setInitialChatPrompt(null)}
              />
            </div>
          )}

                  {currentView === "research" && currentResearchId && canAccessResearch && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
                      <ResearchView reportId={currentResearchId} isAdmin={isAdmin} />
            </div>
          )}

          {currentView === "research-new" && canAccessResearch && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
              <NewResearchPage />
            </div>
          )}
          
          {/* Admin Views */}
          {currentView === "city-data" && (
            <div id="city-data-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              {selectedCityId ? (
                <div className={styles.adminContainer}>
                  <CityDataAdmin cityId={selectedCityId} onBack={() => setSelectedCityId(null)} />
                </div>
              ) : (
                <CityDataTable
                  onOpenCity={(cityId) => handleCityClick(cityId)}
                  onViewJob={handleOpenJobLogsFromCityData}
                />
              )}
            </div>
          )}

          {/* Settings will be rendered as overlay below */}
          {currentView === "user-management" && (
            <div id="user-management-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <UserManagement
                  currentUserId={currentUserId}
                  onLoginAsUser={handleLoginAsUser}
                />
              </div>
            </div>
          )}

          {currentView === "claims-admin" && (
            <div id="claims-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <ClaimsAdmin />
              </div>
            </div>
          )}

          {currentView === "metrics-admin" && (
            <div id="metrics-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
                  Metrics Administration
                </h2>
                {isAdmin ? (
                  <MetricsAdmin />
                ) : (
                  <p style={{ color: "var(--text-secondary)" }}>
                    You don&apos;t have access to metrics administration.
                  </p>
                )}
              </div>
            </div>
          )}

          {currentView === "datasets-admin" && (
            <div id="datasets-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
                  Datasets Administration
                </h2>
                <DatasetsAdmin />
              </div>
            </div>
          )}

          {currentView === "city" && activeCityId && (
            <div id="city-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={`${styles.adminContainer} ${styles.cityViewContainer}`}>
                <CityView
                  key={`${activeCityId}-${identityScopeKey}`}
                  cityId={activeCityId}
                  isAdmin={isAdmin || cityLeadCityIds.includes(activeCityId)}
                  gpsLocation={gpsLocation}
                  initialDistrict={initialDistrict}
                  initialPlaceId={initialPlaceId}
                  initialPlaceGps={initialPlaceGps}
                  initialSection={initialSection}
                  requestOpenDistrictModal={requestOpenDistrictModal}
                  onClearDistrictModalRequest={() => setRequestOpenDistrictModal(null)}
                  onOfficialSelectionChange={onOfficialSelectionChange}
                  bootstrapPlaceMetricsForPlaceId={placeIdPendingPlaceMetricsBootstrap}
                  onConsumePlaceMetricsBootstrap={consumePlaceMetricsBootstrap}
                  onRequestPlaceMetricsBootstrap={setPlaceIdPendingPlaceMetricsBootstrap}
                />
              </div>
            </div>
          )}

          {currentView === "metric" && (
            <div id="metric-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2>Metric View</h2>
                <p>Metric view coming soon...</p>
              </div>
            </div>
          )}

          {currentView === "job-logs" && isAdmin && (
            <div id="job-logs-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <JobLogsViewer />
              </div>
            </div>
          )}

          {currentView === "feed-stories-admin" && (isAdmin || cityLeadCityIds.length > 0) && (
            <div id="feed-stories-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
                  Seymour&apos;s inbox
                </h2>
                <EmailAdmin />
              </div>
            </div>
          )}

          {currentView === "feed-admin" && (isAdmin || cityLeadCityIds.length > 0) && (
            <div id="feed-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
                  Feed
                </h2>
                <FeedAdmin />
              </div>
            </div>
          )}

          {currentView === "newsletter-admin" && isAdmin && (
            <div id="newsletter-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
                  Newsletters
                </h2>
                <NewsletterAdmin />
              </div>
            </div>
          )}

          {currentView === "feed" && govVerificationStatus?.government_pending_verification && !govVerificationStatus?.government_verified && (
            <div style={{
              padding: "12px 16px",
              margin: "0 0 12px",
              background: "var(--bg-secondary, #f3f4f6)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>{"\u23F3"}</span>
              <span>Your government verification is pending review. You&apos;ll get full official access once approved.</span>
            </div>
          )}

          {currentView === "feed" && (
            <div id="feed-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <FeedView
                key={`feed-${identityScopeKey}`}
                cityId={null}
                district={null}
                isAdmin={isAdmin}
                isImpersonating={isImpersonating}
                userPlaces={allUserPlaces}
                homeCityId={userPreferences?.extra?.home_location?.city_id ?? null}
              />
            </div>
          )}
        </div>
      </main>
      </PlaceOnboardingProvider>

      {/* Settings Overlay */}
      {settingsOpen && (
        <>
          <div className={styles.settingsBackdrop} onClick={() => setSettingsOpen(false)} aria-hidden />
          <div className={styles.settingsPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className={styles.settingsPanelInner}>
              <header className={styles.settingsHeader}>
                <h2 id="settings-title" className={styles.settingsTitle}>Settings</h2>
                <button type="button" className={styles.settingsCloseBtn} onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                  ×
                </button>
              </header>
              {loadingPreferences ? (
                <div className="tc-loading-state" style={{ marginTop: "8px" }}>
                  <Loader size="sm" color="dark" />
                  <span>Loading preferences…</span>
                </div>
              ) : (
                <div className={styles.settingsBody}>
                  {/* Account */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Account</h3>
                    <div className={styles.settingsSectionCard}>
                      {userEmail && (
                        <div className={styles.settingsRow}>
                          <div className={styles.settingsRowLabel}>
                            <div className={styles.settingsRowTitle}>Email</div>
                            <div className={styles.settingsRowDescription}>{userEmail}</div>
                          </div>
                        </div>
                      )}
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Home location</div>
                          <div className={styles.settingsRowDescription}>
                            {userPreferences?.extra?.home_location ? (
                              homeCity ? (
                                <>
                                  {homeCity.emoji && <span style={{ marginRight: "6px" }}>{homeCity.emoji}</span>}
                                  {homeCity.display_name || homeCity.name}
                                  {userPreferences.extra.home_location.district !== null && userPreferences.extra.home_location.district !== undefined && (
                                    <span> · District {userPreferences.extra.home_location.district}</span>
                                  )}
                                </>
                              ) : (
                                `City ID: ${userPreferences.extra.home_location.city_id}${
                                  userPreferences.extra.home_location.district !== null && userPreferences.extra.home_location.district !== undefined
                                    ? ` · District ${userPreferences.extra.home_location.district}`
                                    : ""
                                }`
                              )
                            ) : (
                              "Not set"
                            )}
                          </div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <button type="button" className={styles.settingsSecondaryBtn} onClick={() => setShowEditHomeLocationModal(true)}>
                            {userPreferences?.extra?.home_location ? "Edit" : "Set location"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                  <EditHomeLocationModal
                      open={showEditHomeLocationModal}
                      onClose={() => setShowEditHomeLocationModal(false)}
                      onSaved={async () => {
                        await loadUserSettings();
                        handlePlaceSaved();
                      }}
                    />

                  {/* Communication preferences */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>{isAdmin ? "Communication preferences" : "Newsletter"}</h3>
                    <div className={styles.settingsSectionCard}>
                      {isAdmin && (
                      <label className={styles.settingsRow} style={{ cursor: "pointer" }}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Anomaly alerts</div>
                          <div className={styles.settingsRowDescription}>Get notified when significant changes are detected</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={editableAnomalyAlerts} onChange={(e) => setEditableAnomalyAlerts(e.target.checked)} aria-label="Toggle anomaly alerts" />
                            {editableAnomalyAlerts ? "On" : "Off"}
                          </label>
                        </div>
                      </label>
                      )}
                      <label className={styles.settingsRow} style={{ cursor: "pointer" }}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Weekly newsletter</div>
                          <div className={styles.settingsRowDescription}>{isAdmin ? "Summary of key metrics and changes" : "Get a weekly summary of your city"}</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={editableWeeklyDigest} onChange={(e) => setEditableWeeklyDigest(e.target.checked)} aria-label="Toggle weekly digest" />
                            {editableWeeklyDigest ? "On" : "Off"}
                          </label>
                        </div>
                      </label>
                      {isAdmin && (
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel} style={{ flex: 1 }}>
                          <div className={styles.settingsRowTitle}>Monthly report</div>
                          <div className={styles.settingsRowDescription}>Comprehensive analysis of city performance</div>
                          {editableMonthlyReport && (
                            <div style={{ marginTop: "10px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                              <label className={styles.settingsRadioLabel}>
                                <input type="radio" name="reportScope" checked={editableReportScope === "district"} onChange={() => setEditableReportScope("district")} />
                                For my district
                              </label>
                              <label className={styles.settingsRadioLabel}>
                                <input type="radio" name="reportScope" checked={editableReportScope === "city"} onChange={() => setEditableReportScope("city")} />
                                For the whole city
                              </label>
                            </div>
                          )}
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={editableMonthlyReport} onChange={(e) => setEditableMonthlyReport(e.target.checked)} aria-label="Toggle monthly report" />
                            {editableMonthlyReport ? "On" : "Off"}
                          </label>
                        </div>
                      </div>
                      )}
                    </div>
                    {/* Customize your newsletter - all users */}
                    <div className={styles.settingsNewsletterBlock} style={{ marginTop: "16px" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
                        Customize your newsletter
                      </label>
                      <p className={styles.settingsNewsletterIntro} style={{ marginBottom: "10px" }}>
                        Tell us what you care about and we&apos;ll tailor each edition to you.
                      </p>
                      <textarea
                        className={styles.settingsTextarea}
                        value={editableNewsletterDescription}
                        onChange={(e) => setEditableNewsletterDescription(e.target.value)}
                        placeholder="e.g. Focus on crime trends near me, the timing of new building permits, and how the city budget is being spent."
                        rows={3}
                      />
                    </div>
                  </section>

                  {/* Admin-only: test newsletter generation */}
                  {isAdmin && <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Newsletter testing</h3>
                    <div className={styles.settingsNewsletterBlock}>
                      <div className={styles.settingsRadioGroup}>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>Frequency:</span>
                        <label className={styles.settingsRadioLabel}>
                          <input type="radio" name="newsletterFreqSettings" checked={editableNewsletterFrequency === "weekly"} onChange={() => setEditableNewsletterFrequency("weekly")} style={{ accentColor: "var(--brand-primary, #ad35fa)" }} />
                          Weekly
                        </label>
                        <label className={styles.settingsRadioLabel}>
                          <input type="radio" name="newsletterFreqSettings" checked={editableNewsletterFrequency === "monthly"} onChange={() => setEditableNewsletterFrequency("monthly")} style={{ accentColor: "var(--brand-primary, #ad35fa)" }} />
                          Monthly
                        </label>
                      </div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "8px", marginTop: "16px" }}>
                        Test email generation
                      </label>
                      <select
                        className={styles.settingsTextarea}
                        value={testNewsletterGenerationMode}
                        onChange={(e) => setTestNewsletterGenerationMode(e.target.value as "stories" | "seymour")}
                        aria-label="Test newsletter generation mode"
                        style={{ minHeight: "unset", height: "44px", padding: "10px 12px", cursor: "pointer", maxWidth: "100%" }}
                      >
                        <option value="stories">Feed stories (same as weekly send)</option>
                        <option value="seymour">Seymour — full personalized prompt (LLM + tools)</option>
                      </select>
                      <button type="button" className={styles.settingsGenerateBtn} onClick={handleGenerateSampleNewsletter} disabled={generatingSampleNewsletter}>
                        {generatingSampleNewsletter ? (
                          <>
                            <Loader size="sm" color="white" />
                            <span>
                              {testNewsletterGenerationMode === "seymour"
                                ? "Running Seymour (may take a minute)…"
                                : "Sending test…"}
                            </span>
                          </>
                        ) : (
                          "Send test newsletter"
                        )}
                      </button>
                      {sampleNewsletterSubject && (
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "12px", padding: "12px", background: "var(--bg-primary)", borderRadius: "8px" }}>
                          Test newsletter completed. Subject: <strong style={{ color: "var(--text-primary)" }}>{sampleNewsletterSubject}</strong>. Check Seymour&apos;s outbox and your inbox (if email delivery is enabled).
                        </p>
                      )}
                    </div>
                  </section>}

                  {/* Display */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Display</h3>
                    <div className={styles.settingsSectionCard}>
                      <label className={styles.settingsRow} style={{ cursor: "pointer" }}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Dark mode</div>
                          <div className={styles.settingsRowDescription}>Use a dark color theme across the UI</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={theme === "dark"} onChange={(e) => setTheme(e.target.checked ? "dark" : "light")} aria-label="Toggle dark mode" />
                            {theme === "dark" ? "On" : "Off"}
                          </label>
                        </div>
                      </label>
                    </div>
                  </section>

                  {/* Save */}
                  <div className={styles.settingsSaveBlock}>
                    <button type="button" className={styles.settingsSaveBtn} onClick={handleSavePreferences} disabled={savingPreferences}>
                      {savingPreferences ? (
                        <>
                          <Loader size="sm" color="white" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        "Save preferences"
                      )}
                    </button>
                  </div>

                  {/* System status - admin only */}
                  {isAdmin && (
                  <div className={styles.settingsFooterBlock}>
                    <div className={styles.settingsFooterRow}>
                      <div>
                        <div className={styles.settingsRowTitle} style={{ fontSize: "12px", marginBottom: "2px" }}>Session storage</div>
                        <div className={styles.settingsRowDescription} style={{ fontSize: "12px" }}>Connection status for chat sessions</div>
                      </div>
                      <RedisStatusIndicator subtle />
                    </div>
                  </div>
                  )}

                  {/* Government mode (preview) - admin only */}
                  {isAdmin && <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Government mode (preview)</h3>
                    <div className={styles.settingsSectionCard}>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>
                            {govVerificationStatus?.government_verified ? "Government mode on" : "Government mode off"}
                          </div>
                          <div className={styles.settingsRowDescription}>
                            {govVerificationStatus?.government_verified
                              ? govVerificationStatus.government_email
                                ? `Verified as ${govVerificationStatus.government_email}`
                                : "You're seeing the app as a government user."
                              : "Switch to government mode to see the UI as a government-verified user."}
                          </div>
                        </div>
                        <div className={styles.settingsRowControl} style={{ display: "flex", gap: "8px" }}>
                          {govVerificationStatus?.government_verified ? (
                            <button type="button" className={styles.settingsSecondaryBtn} onClick={() => handleSwitchGovernmentMode(false)} disabled={govModeToggling}>
                              {govModeToggling ? "…" : "Revert to standard user"}
                            </button>
                          ) : (
                            <button type="button" className={styles.settingsSecondaryBtn} onClick={() => handleSwitchGovernmentMode(true)} disabled={govModeToggling}>
                              {govModeToggling ? "…" : "Switch to government mode"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>}

                  {/* Onboarding - admin only */}
                  {isAdmin && (
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Onboarding</h3>
                    <div className={styles.settingsSectionCard}>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Reset onboarding</div>
                          <div className={styles.settingsRowDescription}>Show the citizen welcome screen again on your next visit</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <button type="button" className={styles.settingsSecondaryBtn} onClick={handleResetOnboarding}>Reset</button>
                        </div>
                      </div>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Reset and show government onboarding</div>
                          <div className={styles.settingsRowDescription}>Run the government flow (verify email, confirm profile) again</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <button type="button" className={styles.settingsSecondaryBtn} onClick={handleResetOnboardingGovernment}>Reset (government)</button>
                        </div>
                      </div>
                    </div>
                  </section>
                  )}

                  {/* System statistics - admin only */}
                  {isAdmin && (
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>System statistics</h3>
                    <div className={styles.settingsSectionCard}>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowDescription}>Coming soon…</div>
                        </div>
                      </div>
                    </div>
                  </section>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Welcome Modal for first-time users */}
      <GovernmentOnboardingModal
        isOpen={showGovernmentOnboardingModal}
        onClose={() => setShowGovernmentOnboardingModal(false)}
        onComplete={handleGovernmentOnboardingComplete}
        claimContext={governmentClaimContext}
      />
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onCitySelected={handleWelcomeCitySelected}
        onComplete={handleWelcomeComplete}
        onCityNotFound={(cityName, state, country) => {
          setShowWelcomeModal(false);
          setCurrentView("feed");
          setCityNotFound({ cityName, state, country });
        }}
      />
      <CityNotFoundModal
        isOpen={!!cityNotFound}
        cityName={cityNotFound?.cityName ?? ""}
        state={cityNotFound?.state ?? null}
        country={cityNotFound?.country ?? null}
        onClose={() => setCityNotFound(null)}
        onComplete={() => {
          setCityNotFound(null);
          toast.success("We'll notify you when your city launches!");
        }}
      />

      {/* Mobile bottom navigation (hidden on desktop via CSS) */}
      <MobileBottomNav
        activeTab={
          moreMenuOpen ? "more"
            : currentView === "feed" ? "feed"
            : currentView === "city" ? "my-places"
            : "more"
        }
        onTabChange={(tab: MobileTab) => {
          setMoreMenuOpen(false);
          if (tab === "feed") {
            setCurrentView("feed");
          } else if (tab === "my-places") {
            setInitialSection(null);
            if (activeCityId) {
              setCurrentView("city");
            } else {
              // No city selected: open the sidebar so user can pick a city
              setSidebarOpen(true);
            }
          } else if (tab === "more") {
            setMoreMenuOpen(true);
          }
        }}
      />
      <MobileMoreMenu
        isOpen={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        isAdmin={isAdmin}
        onAdminViewChange={(view) => {
          const validAdminViews: ViewType[] = ["feed-admin", "newsletter-admin", "metrics-admin", "city-data", "system-stats", "user-management", "claims-admin", "datasets-admin", "feed-stories-admin", "job-logs"];
          if (validAdminViews.includes(view as ViewType)) {
            setCurrentView(view as ViewType);
          }
          setMoreMenuOpen(false);
        }}
      />
    </div>
  );
}
